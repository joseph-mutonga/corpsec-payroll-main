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
