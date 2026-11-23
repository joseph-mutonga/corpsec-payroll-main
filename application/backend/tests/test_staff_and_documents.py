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
    data = login_resp.json()
    if data.get("access_token"):
        return data["access_token"]
    if data.get("otp_required"):
        from application.backend.app.models.email_otp import EmailOTP
        from application.backend.app.core.database import SessionLocal
        with SessionLocal() as db_session:
            otp_record = (
                db_session.query(EmailOTP)
                .filter(EmailOTP.email.ilike(email.strip()), EmailOTP.is_used == False)
                .order_by(EmailOTP.id.desc())
                .first()
            )
            code = otp_record.otp_code if otp_record else "123456"
        v_resp = client.post(
            "/api/v1/auth/verify-otp",
            json={"email": email, "otp_code": code}
        )
        assert v_resp.status_code == 200, f"OTP verification failed: {v_resp.text}"
        return v_resp.json()["access_token"]
    return None


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


def test_staff_suspension_and_pdf_dossier_lifecycle(client):
    admin_headers = get_admin_headers(client)

    # 1. Create a dedicated staff member for testing
    test_email = "alex.hr.test@corpsec.co.ke"
    payload = {
        "email": test_email,
        "full_name": "Alex Omondi",
        "phone": "0711998877",
        "role": "HR",
        "password": "Password123!"
    }
    create_resp = client.post("/api/v1/staff", json=payload, headers=admin_headers)
    if create_resp.status_code == 400 and "already exists" in create_resp.text:
        # Fetch existing
        all_staff = client.get("/api/v1/staff", headers=admin_headers).json()
        staff_user = next(s for s in all_staff if s["email"] == test_email)
        staff_id = staff_user["id"]
        # Ensure active initially
        client.patch(f"/api/v1/staff/{staff_id}/status", json={"status": "ACTIVE"}, headers=admin_headers)
    else:
        assert create_resp.status_code == 201, create_resp.text
        staff_id = create_resp.json()["id"]

    # 2. Verify staff is initially in ACTIVE list, not in SUSPENDED list
    active_resp = client.get("/api/v1/staff?status_filter=ACTIVE", headers=admin_headers)
    assert active_resp.status_code == 200
    active_ids = [s["id"] for s in active_resp.json()]
    assert staff_id in active_ids

    susp_resp = client.get("/api/v1/staff?status_filter=SUSPENDED", headers=admin_headers)
    assert susp_resp.status_code == 200
    susp_ids = [s["id"] for s in susp_resp.json()]
    assert staff_id not in susp_ids

    # 3. Suspend the staff member
    suspend_patch = client.patch(
        f"/api/v1/staff/{staff_id}/status",
        json={"status": "SUSPENDED"},
        headers=admin_headers
    )
    assert suspend_patch.status_code == 200
    assert suspend_patch.json()["status"] == "SUSPENDED"

    # 4. Verify staff member has moved to Suspended section and is excluded from Active section
    active_resp2 = client.get("/api/v1/staff?status_filter=ACTIVE", headers=admin_headers)
    active_ids2 = [s["id"] for s in active_resp2.json()]
    assert staff_id not in active_ids2, "Suspended staff member must not appear in active staff list"

    susp_resp2 = client.get("/api/v1/staff?status_filter=SUSPENDED", headers=admin_headers)
    susp_ids2 = [s["id"] for s in susp_resp2.json()]
    assert staff_id in susp_ids2, "Suspended staff member must appear in suspended staff list"

    # 5. Test PDF upload validation - Non-PDF files must be strictly rejected
    invalid_txt = b"This is a text document, not a PDF."
    non_pdf_file = {"file": ("alex_cv.txt", io.BytesIO(invalid_txt), "text/plain")}
    non_pdf_data = {"document_type": "CV / Resume", "title": "Alex CV Text"}
    fail_resp1 = client.post(
        f"/api/v1/staff/{staff_id}/documents",
        data=non_pdf_data,
        files=non_pdf_file,
        headers=admin_headers
    )
    assert fail_resp1.status_code == 400
    assert "Only PDF documents" in fail_resp1.json()["detail"]

    # 6. Test PDF upload validation - Fake PDF without %PDF- magic signature
    fake_pdf = b"Plain content without PDF header signature"
    fake_pdf_file = {"file": ("fake_degree.pdf", io.BytesIO(fake_pdf), "application/pdf")}
    fail_resp2 = client.post(
        f"/api/v1/staff/{staff_id}/documents",
        data={"document_type": "Academic Certificate", "title": "Fake Degree"},
        files=fake_pdf_file,
        headers=admin_headers
    )
    assert fail_resp2.status_code == 400
    assert "PDF header signature" in fail_resp2.json()["detail"]

    # 7. Upload genuine CV (PDF)
    cv_bytes = b"%PDF-1.5 Mock Curriculum Vitae for Alex Omondi - HR Specialist CorpSec 2026"
    cv_file = {"file": ("alex_omondi_cv_2026.pdf", io.BytesIO(cv_bytes), "application/pdf")}
    cv_data = {"document_type": "CV / Resume", "title": "Alex Omondi Official CV 2026"}
    upload_cv_resp = client.post(
        f"/api/v1/staff/{staff_id}/documents",
        data=cv_data,
        files=cv_file,
        headers=admin_headers
    )
    assert upload_cv_resp.status_code == 201, upload_cv_resp.text
    cv_doc = upload_cv_resp.json()
    assert cv_doc["document_type"] == "CV / Resume"
    assert cv_doc["title"] == "Alex Omondi Official CV 2026"
    assert cv_doc["filename"] == "alex_omondi_cv_2026.pdf"
    assert cv_doc["file_size_bytes"] == len(cv_bytes)
    assert cv_doc["mime_type"] == "application/pdf"
    cv_doc_id = cv_doc["id"]

    # 8. Upload genuine Academic Certificate (PDF)
    degree_bytes = b"%PDF-1.4 Bachelor of Human Resource Management Certificate - University of Nairobi 2024"
    degree_file = {"file": ("bachelor_hrm_degree.pdf", io.BytesIO(degree_bytes), "application/pdf")}
    degree_data = {"document_type": "Academic Certificate", "title": "Bachelor of HR Management Degree Certificate"}
    upload_deg_resp = client.post(
        f"/api/v1/staff/{staff_id}/documents",
        data=degree_data,
        files=degree_file,
        headers=admin_headers
    )
    assert upload_deg_resp.status_code == 201, upload_deg_resp.text
    deg_doc = upload_deg_resp.json()
    assert deg_doc["document_type"] == "Academic Certificate"
    deg_doc_id = deg_doc["id"]

    # 9. List documents for this staff member
    list_docs_resp = client.get(f"/api/v1/staff/{staff_id}/documents", headers=admin_headers)
    assert list_docs_resp.status_code == 200
    docs_list = list_docs_resp.json()
    assert len(docs_list) >= 2
    doc_ids = [d["id"] for d in docs_list]
    assert cv_doc_id in doc_ids
    assert deg_doc_id in doc_ids

    # 10. Download / preview PDF document
    down_resp = client.get(f"/api/v1/staff/{staff_id}/documents/{cv_doc_id}/download", headers=admin_headers)
    assert down_resp.status_code == 200
    assert down_resp.content == cv_bytes
    assert "application/pdf" in down_resp.headers.get("content-type", "")

    # 11. Delete one document
    del_doc_resp = client.delete(f"/api/v1/staff/{staff_id}/documents/{deg_doc_id}", headers=admin_headers)
    assert del_doc_resp.status_code == 200
    assert "successfully deleted" in del_doc_resp.json()["message"]

    # Verify deleted from list
    list_docs_after = client.get(f"/api/v1/staff/{staff_id}/documents", headers=admin_headers).json()
    assert not any(d["id"] == deg_doc_id for d in list_docs_after)
    assert any(d["id"] == cv_doc_id for d in list_docs_after)

    # 12. Reinstate staff member to active
    reinstate_resp = client.patch(
        f"/api/v1/staff/{staff_id}/status",
        json={"status": "ACTIVE"},
        headers=admin_headers
    )
    assert reinstate_resp.status_code == 200
    assert reinstate_resp.json()["status"] == "ACTIVE"

    # 13. Permanently delete staff member as requested ("he or she is not the staff anymore and we have to delete their information")
    del_staff_resp = client.delete(f"/api/v1/staff/{staff_id}", headers=admin_headers)
    assert del_staff_resp.status_code == 200
    assert "successfully removed" in del_staff_resp.json()["message"]

    # Verify staff member no longer exists
    get_del = client.get(f"/api/v1/staff/{staff_id}", headers=admin_headers)
    assert get_del.status_code == 404
