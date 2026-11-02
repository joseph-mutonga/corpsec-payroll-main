import os
import io
import pytest
from datetime import date
from application.backend.app.models.guard import Guard
from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.core.security import get_password_hash


def get_auth_token(client, email, password):
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password}
    )
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    return login_resp.json()["access_token"]


def get_admin_headers(client):
    token = get_auth_token(
        client,
        "admin@corpsec.co.ke",
        os.getenv("ADMIN_INITIAL_PASSWORD", "TestAdminSecretPass123!")
    )
    return {"Authorization": f"Bearer {token}"}


def test_admin_create_staff_and_hr(client):
    admin_headers = get_admin_headers(client)

    # 1. Admin creates an HR user
    hr_payload = {
        "email": "hr.manager@corpsec.co.ke",
        "full_name": "Sarah Connor",
        "phone": "0799001122",
        "role": "HR",
        "password": "Password123!"
    }
    resp = client.post("/api/v1/staff", json=hr_payload, headers=admin_headers)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["role"] == "HR"
    assert data["email"] == "hr.manager@corpsec.co.ke"
    assert data["full_name"] == "Sarah Connor"
    hr_id = data["id"]

    # 2. Admin creates a Supervisor user
    sup_payload = {
        "email": "sup.field@corpsec.co.ke",
        "full_name": "James Bond",
        "phone": "0799001133",
        "role": "SUPERVISOR",
        "password": "Password123!"
    }
    resp2 = client.post("/api/v1/staff", json=sup_payload, headers=admin_headers)
    assert resp2.status_code == 201, resp2.text
    assert resp2.json()["role"] == "SUPERVISOR"

    # 3. Duplicate email rejected
    resp_dup = client.post("/api/v1/staff", json=hr_payload, headers=admin_headers)
    assert resp_dup.status_code == 400

    # 4. List staff
    list_resp = client.get("/api/v1/staff", headers=admin_headers)
    assert list_resp.status_code == 200
    staff_list = list_resp.json()
    assert any(s["email"] == "hr.manager@corpsec.co.ke" for s in staff_list)
    assert any(s["email"] == "sup.field@corpsec.co.ke" for s in staff_list)

    # 5. Suspend staff
    patch_resp = client.patch(f"/api/v1/staff/{hr_id}/status", json={"status": "SUSPENDED"}, headers=admin_headers)
    assert patch_resp.status_code == 200
    assert patch_resp.json()["status"] == "SUSPENDED"

    # Reactivate staff
    patch_resp2 = client.patch(f"/api/v1/staff/{hr_id}/status", json={"status": "ACTIVE"}, headers=admin_headers)
    assert patch_resp2.status_code == 200
    assert patch_resp2.json()["status"] == "ACTIVE"


def test_hr_finances_and_payroll_permissions(client, db):
    admin_headers = get_admin_headers(client)

    # Create HR account
    client.post("/api/v1/staff", json={
        "email": "hr.officer@corpsec.co.ke",
        "full_name": "Helen Rose",
        "phone": "0733445566",
        "role": "HR",
        "password": "SecurePassword123!"
    }, headers=admin_headers)

    # HR logs in
    hr_token = get_auth_token(client, "hr.officer@corpsec.co.ke", "SecurePassword123!")
    hr_headers = {"Authorization": f"Bearer {hr_token}"}

    # 1. HR can view financial analytics / reports
    analytics_resp = client.get("/api/v1/reports/analytics", headers=hr_headers)
    assert analytics_resp.status_code == 200
    analytics_data = analytics_resp.json()
    assert "kpis" in analytics_data
    assert "monthly_payroll_gross" in analytics_data["kpis"]

    # 2. HR can view payroll periods
    periods_resp = client.get("/api/v1/payroll/periods", headers=hr_headers)
    assert periods_resp.status_code == 200

    # 3. HR can access statutory reports (NSSF, SHIF, Housing Levy)
    nssf_resp = client.get("/api/v1/reports/nssf?period_id=1", headers=hr_headers)
    assert nssf_resp.status_code in [200, 404]  # 200 if records exist, 404 if period 1 has no records

    shif_resp = client.get("/api/v1/reports/shif?period_id=1", headers=hr_headers)
    assert shif_resp.status_code in [200, 404]

    housing_resp = client.get("/api/v1/reports/housing-levy?period_id=1", headers=hr_headers)
    assert housing_resp.status_code in [200, 404]

    # 4. HR can view payment reconciliation
    pay_resp = client.get("/api/v1/payments/reconciliation?period_id=1", headers=hr_headers)
    assert pay_resp.status_code in [200, 404]

    # 5. HR cannot manage staff (admin only)
    forbidden_staff = client.post("/api/v1/staff", json={
        "email": "rogue@corpsec.co.ke",
        "full_name": "Rogue User",
        "role": "ADMIN",
        "password": "Pass"
    }, headers=hr_headers)
    assert forbidden_staff.status_code == 403


def test_supervisor_guard_boundaries_and_clockin_out(client, db):
    admin_headers = get_admin_headers(client)

    # 1. Create Supervisor 1
    resp_sup1 = client.post("/api/v1/staff", json={
        "email": "supervisor1@corpsec.co.ke",
        "full_name": "Supervisor Alpha",
        "phone": "0744111222",
        "role": "SUPERVISOR",
        "password": "Password123!"
    }, headers=admin_headers)
    sup1_id = resp_sup1.json()["id"]

    # 2. Create Supervisor 2
    resp_sup2 = client.post("/api/v1/staff", json={
        "email": "supervisor2@corpsec.co.ke",
        "full_name": "Supervisor Bravo",
        "phone": "0744111333",
        "role": "SUPERVISOR",
        "password": "Password123!"
    }, headers=admin_headers)
    sup2_id = resp_sup2.json()["id"]

    # Get active guards from seed
    guards = db.query(Guard).filter(Guard.status == "ACTIVE").all()
    assert len(guards) >= 2
    guard_alpha = guards[0]
    guard_bravo = guards[1]

    # Assign guard_alpha to Supervisor 1
    client.post(
        f"/api/v1/supervisors/{sup1_id}/assign-guards",
        json={"guard_ids": [guard_alpha.id]},
        headers=admin_headers
    )

    # Assign guard_bravo to Supervisor 2
    client.post(
        f"/api/v1/supervisors/{sup2_id}/assign-guards",
        json={"guard_ids": [guard_bravo.id]},
        headers=admin_headers
    )

    # Supervisor 1 logs in
    sup1_token = get_auth_token(client, "supervisor1@corpsec.co.ke", "Password123!")
    sup1_headers = {"Authorization": f"Bearer {sup1_token}"}

    # 3. GET /guards for Supervisor 1 returns ONLY guard_alpha
    sup_guards_resp = client.get("/api/v1/guards", headers=sup1_headers)
    assert sup_guards_resp.status_code == 200
    sup_guards = sup_guards_resp.json()
    assert any(g["id"] == guard_alpha.id for g in sup_guards)
    assert not any(g["id"] == guard_bravo.id for g in sup_guards)

    # 4. Supervisor 1 accessing guard_alpha file succeeds
    detail_ok = client.get(f"/api/v1/guards/{guard_alpha.id}", headers=sup1_headers)
    assert detail_ok.status_code == 200
    assert detail_ok.json()["id"] == guard_alpha.id

    # 5. Supervisor 1 accessing guard_bravo file is strictly 403 Forbidden
    detail_forbidden = client.get(f"/api/v1/guards/{guard_bravo.id}", headers=sup1_headers)
    assert detail_forbidden.status_code == 403
    assert "not assigned to you" in detail_forbidden.json()["detail"]

    # 6. Supervisor 1 clocks in assigned guard_alpha
    clockin_ok = client.post(f"/api/v1/supervisors/guards/{guard_alpha.id}/clock-in", headers=sup1_headers)
    assert clockin_ok.status_code == 200
    assert clockin_ok.json()["status"] == "PRESENT"

    # 7. Supervisor 1 cannot clock in guard_bravo (403 Forbidden)
    clockin_fail = client.post(f"/api/v1/supervisors/guards/{guard_bravo.id}/clock-in", headers=sup1_headers)
    assert clockin_fail.status_code == 403

    # 8. Supervisor 1 clocks out assigned guard_alpha
    clockout_ok = client.post(f"/api/v1/supervisors/guards/{guard_alpha.id}/clock-out", headers=sup1_headers)
    assert clockout_ok.status_code == 200
    assert clockout_ok.json()["status"] == "PRESENT"
    assert clockout_ok.json()["regular_hours"] >= 0.0
    assert "clock_out_time" in clockout_ok.json()


def test_secure_company_documents_lifecycle(client):
    admin_headers = get_admin_headers(client)

    # 1. Admin uploads a secure company document
    sample_content = b"%PDF-1.4 Mock PSRA Corporate Security License Content 2026"
    files = {
        "file": ("psra_compliance_license.pdf", io.BytesIO(sample_content), "application/pdf")
    }
    data = {
        "title": "Private Security Regulatory Authority License 2026",
        "category": "Regulatory & Compliance",
        "confidentiality_level": "RESTRICTED",
        "description": "Annual CorpSec corporate operations license renewed under Section 32 of PSRA Act."
    }

    upload_resp = client.post("/api/v1/documents/upload", data=data, files=files, headers=admin_headers)
    assert upload_resp.status_code == 201, upload_resp.text
    doc_info = upload_resp.json()
    assert doc_info["title"] == "Private Security Regulatory Authority License 2026"
    assert doc_info["file_name"] == "psra_compliance_license.pdf"
    doc_id = doc_info["id"]

    # 2. List documents (both Admin & HR can list)
    list_resp = client.get("/api/v1/documents", headers=admin_headers)
    assert list_resp.status_code == 200
    docs = list_resp.json()
    assert any(d["id"] == doc_id for d in docs)

    # 3. Authenticated download with Bearer token
    down_resp = client.get(f"/api/v1/documents/{doc_id}/download", headers=admin_headers)
    assert down_resp.status_code == 200
    assert down_resp.content == sample_content
    assert "attachment" in down_resp.headers.get("content-disposition", "")

    # 4. Download with ?token= query parameter (for direct browser downloads)
    admin_token = admin_headers["Authorization"].replace("Bearer ", "")
    query_down_resp = client.get(f"/api/v1/documents/{doc_id}/download?token={admin_token}")
    assert query_down_resp.status_code == 200
    assert query_down_resp.content == sample_content

    # 5. Delete document
    del_resp = client.delete(f"/api/v1/documents/{doc_id}", headers=admin_headers)
    assert del_resp.status_code == 200

    # 6. Verify deleted
    down_after_del = client.get(f"/api/v1/documents/{doc_id}/download", headers=admin_headers)
    assert down_after_del.status_code == 404
