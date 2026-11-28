import os
import pytest
from datetime import date
from application.backend.app.models.guard import Guard
from application.backend.app.models.audit import AuditLog


def get_admin_headers(client):
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@corpsec.co.ke", "password": os.getenv("ADMIN_INITIAL_PASSWORD", "TestAdminSecretPass123!")}
    )
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_list_guards(client):
    headers = get_admin_headers(client)
    response = client.get("/api/v1/guards", headers=headers)
    assert response.status_code == 200
    guards = response.json()
    assert len(guards) >= 4  # Default active guards from seed
    assert any(g["employee_number"] == "CS-00452" for g in guards)


def test_create_guard(client, db):
    headers = get_admin_headers(client)
    payload = {
        "employee_number": "CS-00995",
        "full_name": "Test Guard Five",
        "national_id": "99887755",
        "phone": "0799887755",
        "email": "test.guard5@corpsec.co.ke",
        "hire_date": "2024-05-10",
        "basic_salary": 16000.0,
        "payment_method": "Bank Transfer",
        "bank_name": "KCB Bank",
        "bank_account": "998877665544",
        "nssf_number": "NSSF-99995",
        "shif_number": "SHIF-99995",
        "kra_pin": "A00999885X"
    }

    response = client.post("/api/v1/guards", json=payload, headers=headers)
    assert response.status_code == 201
    data = response.json()
    assert data["employee_number"] == "CS-00995"
    assert data["full_name"] == "Test Guard Five"
    assert data["status"] == "ACTIVE"

    audit = db.query(AuditLog).filter(AuditLog.action == "CREATE_GUARD").first()
    assert audit is not None


def test_get_guard_profile(client):
    headers = get_admin_headers(client)
    # Get John Mwangi (CS-00452)
    response = client.get("/api/v1/guards", headers=headers)
    guards = response.json()
    john = next(g for g in guards if g["employee_number"] == "CS-00452")

    profile_resp = client.get(f"/api/v1/guards/{john['id']}", headers=headers)
    assert profile_resp.status_code == 200
    profile = profile_resp.json()
    assert profile["full_name"] == "John Mwangi"
    assert profile["site"] is not None
    assert profile["site"]["site_name"] == "Nairobi Hospital"


def test_deactivate_and_reactivate_guard(client, db):
    headers = get_admin_headers(client)
    guards = client.get("/api/v1/guards", headers=headers).json()
    john = next(g for g in guards if g["employee_number"] == "CS-00452")

    # Deactivate Guard with mandatory reason
    deactivate_resp = client.post(
        f"/api/v1/guards/{john['id']}/deactivate",
        json={"reason": "Resigned from service"},
        headers=headers
    )
    assert deactivate_resp.status_code == 200
    assert deactivate_resp.json()["status"] == "INACTIVE"
    assert deactivate_resp.json()["deactivation_reason"] == "Resigned from service"

    guard_in_db = db.query(Guard).filter(Guard.id == john['id']).first()
    assert guard_in_db is not None
    assert guard_in_db.status == "INACTIVE"

    # Verify Audit log entry
    audit = db.query(AuditLog).filter(AuditLog.action == "DEACTIVATE_GUARD").first()
    assert audit is not None
    assert audit.reason == "Resigned from service"

    # Reactivate Guard
    reactivate_resp = client.post(
        f"/api/v1/guards/{john['id']}/reactivate",
        headers=headers
    )
    assert reactivate_resp.status_code == 200
    assert reactivate_resp.json()["status"] == "ACTIVE"


def test_hr_can_deactivate_and_activate_guard(client, db):
    from application.backend.app.core.security import create_access_token, get_password_hash
    from application.backend.app.models.user import User, UserRole, UserStatus

    hr_user = db.query(User).filter(User.email == "hr_guard_toggle@corpsec.co.ke").first()
    if not hr_user:
        hr_user = User(
            email="hr_guard_toggle@corpsec.co.ke",
            phone="0788112233",
            full_name="Sarah HR",
            password_hash=get_password_hash("HrPass@123"),
            role=UserRole.HR.value,
            status=UserStatus.ACTIVE.value,
        )
        db.add(hr_user)
        db.commit()
        db.refresh(hr_user)

    sup_user = db.query(User).filter(User.email == "sup_guard_toggle@corpsec.co.ke").first()
    if not sup_user:
        sup_user = User(
            email="sup_guard_toggle@corpsec.co.ke",
            phone="0788112244",
            full_name="Field Supervisor",
            password_hash=get_password_hash("SupPass@123"),
            role=UserRole.SUPERVISOR.value,
            status=UserStatus.ACTIVE.value,
        )
        db.add(sup_user)
        db.commit()
        db.refresh(sup_user)

    hr_token = create_access_token(
        subject=hr_user.id,
        role=hr_user.role,
        data={"sub": str(hr_user.id), "role": hr_user.role, "email": hr_user.email}
    )
    hr_headers = {"Authorization": f"Bearer {hr_token}"}

    sup_token = create_access_token(
        subject=sup_user.id,
        role=sup_user.role,
        data={"sub": str(sup_user.id), "role": sup_user.role, "email": sup_user.email}
    )
    sup_headers = {"Authorization": f"Bearer {sup_token}"}

    guards = client.get("/api/v1/guards", headers=hr_headers).json()
    target = next(g for g in guards if g["status"] == "ACTIVE")

    # Supervisor remains forbidden
    sup_resp = client.post(
        f"/api/v1/guards/{target['id']}/deactivate",
        json={"reason": "Unauthorized attempt"},
        headers=sup_headers
    )
    assert sup_resp.status_code == 403

    # HR can deactivate guard
    deact_resp = client.post(
        f"/api/v1/guards/{target['id']}/deactivate",
        json={"reason": "HR contract termination"},
        headers=hr_headers
    )
    assert deact_resp.status_code == 200
    assert deact_resp.json()["status"] == "INACTIVE"
    assert deact_resp.json()["deactivation_reason"] == "HR contract termination"

    # Linked guard user account is suspended while inactive
    linked_user = db.query(User).filter(User.guard_id == target["id"]).first()
    if linked_user:
        db.refresh(linked_user)
        assert linked_user.status == UserStatus.SUSPENDED.value

    # HR can reactivate guard via /reactivate or /activate
    act_resp = client.post(
        f"/api/v1/guards/{target['id']}/activate",
        headers=hr_headers
    )
    assert act_resp.status_code == 200
    assert act_resp.json()["status"] == "ACTIVE"
    assert act_resp.json()["deactivation_reason"] is None

    if linked_user:
        db.refresh(linked_user)
        assert linked_user.status == UserStatus.ACTIVE.value


def test_list_sites(client):
    headers = get_admin_headers(client)
    response = client.get("/api/v1/sites", headers=headers)
    assert response.status_code == 200
    sites = response.json()
    assert len(sites) >= 5
    nairobi_hosp = next(s for s in sites if s["site_name"] == "Nairobi Hospital")
    assert nairobi_hosp["guard_count"] >= 1
    assert nairobi_hosp["daily_rate"] == 1350.0


def test_bulk_salary_change(client, db):
    headers = get_admin_headers(client)
    sites = client.get("/api/v1/sites", headers=headers).json()
    nairobi_hosp = next(s for s in sites if s["site_name"] == "Nairobi Hospital")

    payload = {
        "new_daily_rate": 1450.0,
        "new_night_allowance": 250.0,
        "effective_date": "2026-10-01",
        "reason": "Annual CBA rate adjustment"
    }

    response = client.post(
        f"/api/v1/sites/{nairobi_hosp['id']}/bulk-salary-change",
        json=payload,
        headers=headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["new_daily_rate"] == 1450.0
    assert data["new_night_allowance"] == 250.0
    assert data["affected_guards_count"] >= 1

    audit = db.query(AuditLog).filter(AuditLog.action == "BULK_SALARY_CHANGE").first()
    assert audit is not None


def test_list_and_create_shifts(client):
    headers = get_admin_headers(client)
    response = client.get("/api/v1/shifts", headers=headers)
    assert response.status_code == 200
    shifts = response.json()
    assert len(shifts) >= 3

    # Create new shift
    new_shift_payload = {
        "name": "Special Event Shift",
        "shift_type": "DAY",
        "start_time": "10:00",
        "end_time": "22:00",
        "duration_hours": 12.0
    }
    create_resp = client.post("/api/v1/shifts", json=new_shift_payload, headers=headers)
    assert create_resp.status_code == 201
    assert create_resp.json()["name"] == "Special Event Shift"


def test_update_site_rates_and_supervisor_assignment(client, db):
    headers = get_admin_headers(client)

    # 1. Create a supervisor
    sup_payload = {
        "full_name": "Site Ops Supervisor",
        "email": "siteops.sup@corpsec.co.ke",
        "phone": "0733112233",
        "password": "password123"
    }
    sup_resp = client.post("/api/v1/supervisors", json=sup_payload, headers=headers)
    assert sup_resp.status_code == 201
    sup_id = sup_resp.json()["id"]

    # 2. Get Nairobi Hospital site
    sites = client.get("/api/v1/sites", headers=headers).json()
    site = next(s for s in sites if s["site_name"] == "Nairobi Hospital")
    site_id = site["id"]

    # 3. Update site with new rates and assign supervisor
    update_payload = {
        "daily_rate": 1550.0,
        "basic_salary": 17500.0,
        "night_allowance": 250.0,
        "supervisor_id": sup_id
    }
    update_resp = client.put(f"/api/v1/sites/{site_id}", json=update_payload, headers=headers)
    assert update_resp.status_code == 200
    updated_site = update_resp.json()
    assert updated_site["daily_rate"] == 1550.0
    assert updated_site["basic_salary"] == 17500.0
    assert updated_site["supervisor_id"] == sup_id
    assert updated_site["supervisor_name"] == "Site Ops Supervisor"

    # Verify guards deployed at Nairobi Hospital were synced with this supervisor
    guards = client.get(f"/api/v1/guards?site_id={site_id}", headers=headers).json()
    assert len(guards) > 0
    for g in guards:
        assert g["supervisor_id"] == sup_id


def test_supervisor_site_allocation_flow(client, db):
    headers = get_admin_headers(client)

    # 1. Create another supervisor
    sup_payload = {
        "full_name": "Sector Lead Supervisor",
        "email": "sector.lead@corpsec.co.ke",
        "phone": "0744556677",
        "password": "password123"
    }
    sup_resp = client.post("/api/v1/supervisors", json=sup_payload, headers=headers)
    assert sup_resp.status_code == 201
    sup_id = sup_resp.json()["id"]

    # 2. Get two sites
    sites = client.get("/api/v1/sites", headers=headers).json()
    assert len(sites) >= 2
    site_ids = [sites[0]["id"], sites[1]["id"]]

    # 3. Assign sites to supervisor
    assign_resp = client.post(
        f"/api/v1/supervisors/{sup_id}/assign-sites",
        json={"site_ids": site_ids},
        headers=headers
    )
    assert assign_resp.status_code == 200
    data = assign_resp.json()
    assert data["assigned_sites"] == 2

    # 4. Query supervisor sites
    list_sites_resp = client.get(f"/api/v1/supervisors/{sup_id}/sites", headers=headers)
    assert list_sites_resp.status_code == 200
    assigned_sites = list_sites_resp.json()
    assert len(assigned_sites) == 2

    # 5. Check supervisor list reflects site count
    sups_resp = client.get("/api/v1/supervisors", headers=headers)
    sups = sups_resp.json()
    lead_sup = next(s for s in sups if s["id"] == sup_id)
    assert lead_sup["assigned_site_count"] == 2

    # 6. Login as supervisor and verify my-guards includes site guards
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "sector.lead@corpsec.co.ke", "password": "password123"}
    )
    assert login_resp.status_code == 200
    sup_token = login_resp.json().get("access_token")
    if not sup_token and login_resp.json().get("otp_required"):
        from application.backend.app.models.email_otp import EmailOTP
        otp_rec = (
            db.query(EmailOTP)
            .filter(EmailOTP.email == "sector.lead@corpsec.co.ke", EmailOTP.is_used == False)
            .order_by(EmailOTP.id.desc())
            .first()
        )
        assert otp_rec is not None
        v_res = client.post(
            "/api/v1/auth/verify-otp",
            json={"email": "sector.lead@corpsec.co.ke", "otp_code": otp_rec.otp_code}
        )
        assert v_res.status_code == 200
        sup_token = v_res.json()["access_token"]
    sup_headers = {"Authorization": f"Bearer {sup_token}"}

    my_guards_resp = client.get("/api/v1/supervisors/my-guards", headers=sup_headers)
    assert my_guards_resp.status_code == 200
    my_guards = my_guards_resp.json()
    # Should include guards from the 2 assigned sites
    assert len(my_guards) >= 1
    assert any(g["site_id"] in site_ids for g in my_guards)


def test_hr_can_be_assigned_guards_and_sites(client, db):
    """Verify HR managers appear in assignable supervisors list, can be assigned guards and sites, and view them."""
    from application.backend.app.core.security import create_access_token, get_password_hash
    from application.backend.app.models.user import User, UserRole, UserStatus

    headers = get_admin_headers(client)

    hr_user = db.query(User).filter(User.email == "hr.assignable@corpsec.co.ke").first()
    if not hr_user:
        hr_user = User(
            full_name="HR Assignable Manager",
            email="hr.assignable@corpsec.co.ke",
            phone="0790112233",
            password_hash=get_password_hash("HrAssign@123"),
            role=UserRole.HR.value,
            status=UserStatus.ACTIVE.value,
        )
        db.add(hr_user)
        db.commit()
        db.refresh(hr_user)

    # 1. HR user appears in /api/v1/supervisors
    sups_resp = client.get("/api/v1/supervisors", headers=headers)
    assert sups_resp.status_code == 200
    sups = sups_resp.json()
    hr_entry = next((s for s in sups if s["id"] == hr_user.id), None)
    assert hr_entry is not None
    assert hr_entry["role"] == "HR"

    # 2. Assign guards directly to HR manager
    guards = client.get("/api/v1/guards", headers=headers).json()
    active_guard = next(g for g in guards if g["status"] == "ACTIVE")
    assign_resp = client.post(
        f"/api/v1/supervisors/{hr_user.id}/assign-guards",
        json={"guard_ids": [active_guard["id"]]},
        headers=headers
    )
    assert assign_resp.status_code == 200
    assert assign_resp.json()["assigned"] == 1

    # 3. Verify Guard record in DB now has supervisor_id == hr_user.id
    guard_in_db = db.query(Guard).filter(Guard.id == active_guard["id"]).first()
    db.refresh(guard_in_db)
    assert guard_in_db.supervisor_id == hr_user.id

    # 4. HR manager's assigned guards list works
    hr_guards_resp = client.get(f"/api/v1/supervisors/{hr_user.id}/guards", headers=headers)
    assert hr_guards_resp.status_code == 200
    assert any(g["id"] == active_guard["id"] for g in hr_guards_resp.json())

    # 5. HR manager can also be assigned to a site
    sites = client.get("/api/v1/sites", headers=headers).json()
    site_assign_resp = client.post(
        f"/api/v1/supervisors/{hr_user.id}/assign-sites",
        json={"site_ids": [sites[0]["id"]]},
        headers=headers
    )
    assert site_assign_resp.status_code == 200
    assert site_assign_resp.json()["assigned_sites"] == 1


def test_amend_guard_persists_all_fields_for_admin_and_hr(client, db):
    """Verify amending guard information as HR or Admin persists all changes to DB and syncs User credentials."""
    from application.backend.app.core.security import create_access_token, get_password_hash
    from application.backend.app.models.user import User, UserRole, UserStatus

    hr_user = db.query(User).filter(User.email == "hr.amend@corpsec.co.ke").first()
    if not hr_user:
        hr_user = User(
            full_name="HR Amend Officer",
            email="hr.amend@corpsec.co.ke",
            phone="0790223344",
            password_hash=get_password_hash("HrAmend@123"),
            role=UserRole.HR.value,
            status=UserStatus.ACTIVE.value,
        )
        db.add(hr_user)
        db.commit()
        db.refresh(hr_user)

    hr_token = create_access_token(
        subject=hr_user.id,
        role=hr_user.role,
        data={"sub": str(hr_user.id), "role": hr_user.role, "email": hr_user.email}
    )
    hr_headers = {"Authorization": f"Bearer {hr_token}"}

    # Create a guard as HR
    sites = client.get("/api/v1/sites", headers=hr_headers).json()
    shifts = client.get("/api/v1/shifts", headers=hr_headers).json()
    assert len(sites) >= 1 and len(shifts) >= 1

    create_resp = client.post(
        "/api/v1/guards",
        json={
            "employee_number": "CS-AMEND-01",
            "full_name": "Initial Guard Name",
            "national_id": "77889900",
            "phone": "0799001122",
            "email": "amend.guard1@corpsec.co.ke",
            "hire_date": "2026-01-10",
            "site_id": sites[0]["id"],
            "shift_id": shifts[0]["id"],
            "supervisor_id": hr_user.id,
        },
        headers=hr_headers
    )
    assert create_resp.status_code == 201, create_resp.text
    g_id = create_resp.json()["id"]

    # Amend guard details as HR (changing name, email, phone, shift, salary, static fields)
    target_shift_id = shifts[1]["id"] if len(shifts) > 1 else shifts[0]["id"]
    amend_payload = {
        "full_name": "Amended Guard Name",
        "phone": "0799001199",
        "email": "amended.guard1@corpsec.co.ke",
        "shift_id": target_shift_id,
        "supervisor_id": hr_user.id,
        "basic_salary": 21500.0,
        "education_level": "Diploma in Criminology",
        "blood_group": "O+",
        "emergency_contact_name": "Jane Doe",
        "emergency_contact_phone": "0711998877",
        "next_of_kin": "Jane Doe",
        "bank_name": "KCB Bank",
        "bank_account": "1122334455",
        "kra_pin": "A001122334K"
    }
    put_resp = client.put(f"/api/v1/guards/{g_id}", json=amend_payload, headers=hr_headers)
    assert put_resp.status_code == 200, put_resp.text
    updated = put_resp.json()
    assert updated["full_name"] == "Amended Guard Name"
    assert updated["phone"] == "0799001199"
    assert updated["email"] == "amended.guard1@corpsec.co.ke"
    assert updated["shift_id"] == target_shift_id
    assert updated["supervisor_id"] == hr_user.id
    assert updated["basic_salary"] == 21500.0
    assert updated["education_level"] == "Diploma in Criminology"

    # Re-query DB directly to verify persistence
    db.expire_all()
    db_guard = db.query(Guard).filter(Guard.id == g_id).first()
    assert db_guard.full_name == "Amended Guard Name"
    assert db_guard.phone == "0799001199"
    assert db_guard.email == "amended.guard1@corpsec.co.ke"
    assert db_guard.shift_id == target_shift_id
    assert db_guard.supervisor_id == hr_user.id
    assert db_guard.basic_salary == 21500.0

    # Verify linked portal User account synced
    linked_user = db.query(User).filter(User.guard_id == g_id).first()
    assert linked_user is not None
    assert linked_user.email == "amended.guard1@corpsec.co.ke"
    assert linked_user.phone == "0799001199"


def test_shifts_crud_and_no_dummy_ui_data(client):
    """Verify Shift create/update/delete endpoints and confirm dummy values are removed from frontend."""
    headers = get_admin_headers(client)

    create_resp = client.post(
        "/api/v1/shifts",
        json={
            "name": "Patrol Mid Shift",
            "shift_type": "SPLIT",
            "start_time": "10:00",
            "end_time": "18:00",
            "is_night_shift": False
        },
        headers=headers
    )
    assert create_resp.status_code == 201, create_resp.text
    sh_id = create_resp.json()["id"]

    upd_resp = client.put(
        f"/api/v1/shifts/{sh_id}",
        json={"name": "Patrol Midday Shift", "end_time": "19:00"},
        headers=headers
    )
    assert upd_resp.status_code == 200, upd_resp.text
    assert upd_resp.json()["name"] == "Patrol Midday Shift"
    assert upd_resp.json()["duration_hours"] == 9.0

    del_resp = client.delete(f"/api/v1/shifts/{sh_id}", headers=headers)
    assert del_resp.status_code == 200, del_resp.text

    # Verify frontend contains no hardcoded dummy profile/shift placeholders
    index_html = client.get("/").text
    portal_html = client.get("/portal").text
    app_js = client.get("/static/js/app.js").text
    portal_js = client.get("/static/js/portal.js").text

    assert "Reliever Floating Roster" not in app_js
    assert "KCSE / Secondary School Certificate" not in app_js
    assert "P051288491A" not in app_js
    assert "AC_corpsec_voice_demo" not in index_html
    assert "September 18, 2026" not in index_html
    assert "peter.otieno@corpsec.co.ke" not in portal_html
    assert "0721654321" not in portal_html
    assert "guard@corpsec.co.ke" not in portal_js


