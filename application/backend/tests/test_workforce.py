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
    sup_token = login_resp.json()["access_token"]
    sup_headers = {"Authorization": f"Bearer {sup_token}"}

    my_guards_resp = client.get("/api/v1/supervisors/my-guards", headers=sup_headers)
    assert my_guards_resp.status_code == 200
    my_guards = my_guards_resp.json()
    # Should include guards from the 2 assigned sites
    assert len(my_guards) >= 1
    assert any(g["site_id"] in site_ids for g in my_guards)

