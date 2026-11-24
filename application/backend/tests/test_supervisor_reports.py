import os
import io
import datetime
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from application.backend.app.core.security import create_access_token, get_password_hash
from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.site import Site
from application.backend.app.models.supervisor_report import SupervisorReport


def get_or_create_user(db: Session, role: str, email: str, name: str) -> tuple[User, str]:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            email=email,
            phone=f"+254701{abs(hash(email)) % 1000000:06d}",
            password_hash=get_password_hash("TestPass123!"),
            full_name=name,
            role=role,
            status=UserStatus.ACTIVE.value
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    token = create_access_token(data={"sub": str(user.id), "email": user.email, "role": user.role, "user_id": user.id})
    return user, token


def get_or_create_site(db: Session, site_name: str, supervisor_id: int = None) -> Site:
    site = db.query(Site).filter(Site.site_name == site_name).first()
    if not site:
        site = Site(
            site_name=site_name,
            location="Nairobi Upper Hill",
            client_name="CorpSec Enterprise Client",
            supervisor_id=supervisor_id
        )
        db.add(site)
        db.commit()
        db.refresh(site)
    else:
        if supervisor_id is not None and site.supervisor_id != supervisor_id:
            site.supervisor_id = supervisor_id
            db.commit()
            db.refresh(site)
    return site


# ─────────────────────────────────────────────────────────────────────────────
# TEST SUITE: SUPERVISOR PDF REPORTS SUBMISSION & ADMIN REVIEW WORKFLOW
# ─────────────────────────────────────────────────────────────────────────────

def test_supervisor_can_submit_report_with_auto_generated_pdf(client: TestClient, db: Session):
    """
    Field Supervisor submits operational details without a file;
    Backend compiles a formal CorpSec Enterprise PDF dossier and registers it.
    """
    sup, sup_token = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.patrol@testcorpsec.co.ke", "Supervisor David")
    site = get_or_create_site(db, "KICC Tower Post", supervisor_id=sup.id)

    payload = {
        "title": "Night Shift Perimeter Security Inspection",
        "report_type": "FIELD_INSPECTION",
        "site_id": site.id,
        "report_date": "2026-11-24",
        "summary": "Full physical patrol conducted across Gates A, B, and C. Guards were in full uniform and alert.",
        "recommendations": "Requesting 2 replacement rechargeable searchlights for Perimeter Gate B."
    }

    res = client.post(
        "/api/v1/supervisor-reports",
        data=payload,
        headers={"Authorization": f"Bearer {sup_token}"}
    )
    assert res.status_code == 201, res.text
    data = res.json()

    assert data["title"] == "Night Shift Perimeter Security Inspection"
    assert data["report_type"] == "FIELD_INSPECTION"
    assert data["status"] == "SUBMITTED"
    assert data["supervisor_id"] == sup.id
    assert data["site_name"] == "KICC Tower Post"
    assert data["reference_number"].startswith("REP-202611-")
    assert data["file_name"].endswith(".pdf")
    assert data["mime_type"] == "application/pdf"
    assert data["file_size_bytes"] > 0

    # Verify file exists on disk and is a valid PDF
    rep_in_db = db.query(SupervisorReport).filter(SupervisorReport.id == data["id"]).first()
    assert rep_in_db is not None
    assert os.path.exists(rep_in_db.file_path)

    with open(rep_in_db.file_path, "rb") as f:
        header = f.read(5)
        assert header == b"%PDF-", "Generated document must be a valid PDF"


def test_supervisor_can_submit_report_with_uploaded_pdf(client: TestClient, db: Session):
    """
    Field Supervisor submits a report with an attached existing .pdf file.
    """
    sup, sup_token = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.upload@testcorpsec.co.ke", "Supervisor Rachel")
    site = get_or_create_site(db, "Westlands Mall Perimeter", supervisor_id=sup.id)

    fake_pdf_content = b"%PDF-1.4\n1 0 obj\n<< /Title (Incident Report) >>\nendobj\ntrailer\n<< >>\n%%EOF"
    pdf_file = io.BytesIO(fake_pdf_content)

    res = client.post(
        "/api/v1/supervisor-reports",
        data={
            "title": "Incident Investigation Dossier #044",
            "report_type": "INCIDENT_SUMMARY",
            "site_id": site.id,
            "report_date": "2026-11-23",
            "summary": "Vehicle barrier lock tampered with at 02:40 AM. CCTV footage secured."
        },
        files={"file": ("incident_dossier.pdf", pdf_file, "application/pdf")},
        headers={"Authorization": f"Bearer {sup_token}"}
    )
    assert res.status_code == 201, res.text
    data = res.json()

    assert data["title"] == "Incident Investigation Dossier #044"
    assert data["file_name"] == "incident_dossier.pdf"
    assert data["status"] == "SUBMITTED"

    rep = db.query(SupervisorReport).filter(SupervisorReport.id == data["id"]).first()
    assert rep is not None
    assert os.path.exists(rep.file_path)
    with open(rep.file_path, "rb") as f:
        assert f.read() == fake_pdf_content


def test_submit_report_rejects_non_pdf_file(client: TestClient, db: Session):
    """
    Submissions with non-PDF files (e.g. .txt or .docx) must be rejected with 400 Bad Request.
    """
    sup, sup_token = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.invalid@testcorpsec.co.ke", "Supervisor Jane")

    fake_txt = io.BytesIO(b"This is just plain text")
    res = client.post(
        "/api/v1/supervisor-reports",
        data={
            "title": "Invalid File Test",
            "report_type": "GENERAL_REPORT",
            "summary": "Testing file type validation"
        },
        files={"file": ("notes.txt", fake_txt, "text/plain")},
        headers={"Authorization": f"Bearer {sup_token}"}
    )
    assert res.status_code == 400
    assert "PDF" in res.json()["detail"]


def test_supervisor_can_only_list_own_reports(client: TestClient, db: Session):
    """
    Field Supervisors can list only reports they submitted; cannot see reports of other supervisors.
    """
    sup1, token1 = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.alpha@testcorpsec.co.ke", "Supervisor Alpha")
    sup2, token2 = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.bravo@testcorpsec.co.ke", "Supervisor Bravo")

    # Sup1 submits a report
    res1 = client.post(
        "/api/v1/supervisor-reports",
        data={"title": "Alpha Report on Upper Hill", "report_type": "FIELD_INSPECTION", "summary": "Routine check by Alpha"},
        headers={"Authorization": f"Bearer {token1}"}
    )
    assert res1.status_code == 201
    rep1_id = res1.json()["id"]

    # Sup2 submits a report
    res2 = client.post(
        "/api/v1/supervisor-reports",
        data={"title": "Bravo Report on Kilimani", "report_type": "FIELD_INSPECTION", "summary": "Routine check by Bravo"},
        headers={"Authorization": f"Bearer {token2}"}
    )
    assert res2.status_code == 201
    rep2_id = res2.json()["id"]

    # Sup1 queries listing
    list1 = client.get("/api/v1/supervisor-reports", headers={"Authorization": f"Bearer {token1}"}).json()
    ids1 = [r["id"] for r in list1]
    assert rep1_id in ids1
    assert rep2_id not in ids1, "Supervisor Alpha should not see Supervisor Bravo's report"

    # Sup2 queries listing
    list2 = client.get("/api/v1/supervisor-reports", headers={"Authorization": f"Bearer {token2}"}).json()
    ids2 = [r["id"] for r in list2]
    assert rep2_id in ids2
    assert rep1_id not in ids2, "Supervisor Bravo should not see Supervisor Alpha's report"


def test_admin_can_list_and_filter_all_supervisor_reports(client: TestClient, db: Session):
    """
    System Admin has complete oversight to list, filter and search all submitted supervisor reports.
    """
    admin, admin_token = get_or_create_user(db, UserRole.ADMIN.value, "admin.reports@testcorpsec.co.ke", "Admin Reviewer")
    sup, sup_token = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.delta@testcorpsec.co.ke", "Supervisor Delta")

    # Submit a report
    res = client.post(
        "/api/v1/supervisor-reports",
        data={"title": "Delta Equipment Inventory Audit", "report_type": "EQUIPMENT_AUDIT", "summary": "All 12 radios operational"},
        headers={"Authorization": f"Bearer {sup_token}"}
    )
    assert res.status_code == 201
    rep_id = res.json()["id"]

    # Admin lists all reports
    res_all = client.get("/api/v1/supervisor-reports", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_all.status_code == 200
    all_reports = res_all.json()
    all_ids = [r["id"] for r in all_reports]
    assert rep_id in all_ids

    # Admin filters by status
    res_status = client.get("/api/v1/supervisor-reports?status=SUBMITTED", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_status.status_code == 200
    assert all(r["status"] == "SUBMITTED" for r in res_status.json())

    # Admin filters by search term
    res_search = client.get("/api/v1/supervisor-reports?search=Delta%20Equipment", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_search.status_code == 200
    search_ids = [r["id"] for r in res_search.json()]
    assert rep_id in search_ids


def test_admin_can_review_supervisor_report(client: TestClient, db: Session):
    """
    System Admin reviews a supervisor report, updates review status, and dispatches administrative feedback.
    """
    admin, admin_token = get_or_create_user(db, UserRole.ADMIN.value, "admin.judge@testcorpsec.co.ke", "Admin Chief")
    sup, sup_token = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.action@testcorpsec.co.ke", "Supervisor Echo")

    res = client.post(
        "/api/v1/supervisor-reports",
        data={"title": "Echo Gate Barrier Issue", "report_type": "INCIDENT_SUMMARY", "summary": "Hydraulic ram leaking oil"},
        headers={"Authorization": f"Bearer {sup_token}"}
    )
    rep_id = res.json()["id"]

    review_payload = {
        "status": "REVIEWED",
        "admin_notes": "Acknowledged. Facilities Maintenance ticket #FM-881 dispatched to vendor. Good catch."
    }

    rev_res = client.put(
        f"/api/v1/supervisor-reports/{rep_id}/review",
        json=review_payload,
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert rev_res.status_code == 200, rev_res.text
    reviewed_data = rev_res.json()

    assert reviewed_data["status"] == "REVIEWED"
    assert reviewed_data["admin_notes"] == review_payload["admin_notes"]
    assert reviewed_data["reviewed_by_id"] == admin.id
    assert reviewed_data["reviewed_by_name"] == "Admin Chief"
    assert reviewed_data["reviewed_at"] is not None


def test_supervisor_cannot_review_reports(client: TestClient, db: Session):
    """
    Field Supervisor cannot execute PUT /review; restricted to System Admin (403 Forbidden).
    """
    sup, sup_token = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.hacker@testcorpsec.co.ke", "Supervisor Sneak")

    res = client.post(
        "/api/v1/supervisor-reports",
        data={"title": "Sneak Report", "report_type": "GENERAL_REPORT", "summary": "Nothing to report"},
        headers={"Authorization": f"Bearer {sup_token}"}
    )
    rep_id = res.json()["id"]

    rev_res = client.put(
        f"/api/v1/supervisor-reports/{rep_id}/review",
        json={"status": "REVIEWED", "admin_notes": "Self approved"},
        headers={"Authorization": f"Bearer {sup_token}"}
    )
    assert rev_res.status_code == 403, "Field supervisor must not be permitted to review reports"


def test_pdf_stream_and_download_endpoints(client: TestClient, db: Session):
    """
    Verify GET /pdf streams inline PDF for browser reading and GET /download provides file attachment.
    """
    sup, sup_token = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.stream@testcorpsec.co.ke", "Supervisor Streamer")

    res = client.post(
        "/api/v1/supervisor-reports",
        data={"title": "Stream Inspection Dossier", "report_type": "FIELD_INSPECTION", "summary": "Checking PDF streaming endpoint"},
        headers={"Authorization": f"Bearer {sup_token}"}
    )
    rep_id = res.json()["id"]

    # In-browser inline viewing
    pdf_res = client.get(f"/api/v1/supervisor-reports/{rep_id}/pdf?token={sup_token}")
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"
    assert "inline" in pdf_res.headers.get("content-disposition", "")
    assert pdf_res.content.startswith(b"%PDF-")

    # Secure download
    dl_res = client.get(f"/api/v1/supervisor-reports/{rep_id}/download", headers={"Authorization": f"Bearer {sup_token}"})
    assert dl_res.status_code == 200
    assert dl_res.headers["content-type"] == "application/pdf"
    assert "attachment" in dl_res.headers.get("content-disposition", "")
    assert dl_res.content.startswith(b"%PDF-")


def test_supervisor_report_deletion_rules(client: TestClient, db: Session):
    """
    Supervisor can delete their report while SUBMITTED.
    Once REVIEWED, supervisor cannot delete it (400).
    Supervisor cannot delete another supervisor's report (403).
    Admin can delete any report and file is removed from disk.
    """
    admin, admin_token = get_or_create_user(db, UserRole.ADMIN.value, "admin.cleaner@testcorpsec.co.ke", "Admin Cleaner")
    sup1, token1 = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.del1@testcorpsec.co.ke", "Supervisor Delete 1")
    sup2, token2 = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.del2@testcorpsec.co.ke", "Supervisor Delete 2")

    # Sup1 creates Report 1
    r1 = client.post(
        "/api/v1/supervisor-reports",
        data={"title": "Deletable Report", "report_type": "GENERAL_REPORT", "summary": "Draft submission"},
        headers={"Authorization": f"Bearer {token1}"}
    ).json()
    r1_id = r1["id"]

    # Sup2 tries to delete Sup1's report -> 403 Forbidden
    del_forbidden = client.delete(f"/api/v1/supervisor-reports/{r1_id}", headers={"Authorization": f"Bearer {token2}"})
    assert del_forbidden.status_code == 403

    # Admin reviews Sup1's report
    client.put(
        f"/api/v1/supervisor-reports/{r1_id}/review",
        json={"status": "REVIEWED", "admin_notes": "Reviewed"},
        headers={"Authorization": f"Bearer {admin_token}"}
    )

    # Sup1 tries to delete reviewed report -> 400 Bad Request
    del_reviewed = client.delete(f"/api/v1/supervisor-reports/{r1_id}", headers={"Authorization": f"Bearer {token1}"})
    assert del_reviewed.status_code == 400

    # Admin can delete the reviewed report
    rep_obj = db.query(SupervisorReport).filter(SupervisorReport.id == r1_id).first()
    file_path = rep_obj.file_path
    assert os.path.exists(file_path)

    del_admin = client.delete(f"/api/v1/supervisor-reports/{r1_id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert del_admin.status_code == 200

    # Verify removed from database and disk
    assert db.query(SupervisorReport).filter(SupervisorReport.id == r1_id).first() is None
    assert not os.path.exists(file_path), "Physical PDF file must be deleted when report is deleted"
