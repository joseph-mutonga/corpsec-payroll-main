import os
import pytest
from datetime import date, timedelta
from application.backend.app.models.audit import AuditLog
from application.backend.app.models.leave import LeaveRequest
from application.backend.app.models.incident import Incident


def get_guard_headers(client, guard_id="CS-00452", password="Guard@123456"):
    login_resp = client.post(
        "/api/v1/auth/login/guard",
        json={"guard_id": guard_id, "password": password}
    )
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_guard_home_dashboard(client):
    headers = get_guard_headers(client, "CS-00452")
    response = client.get("/api/v1/guard-portal/home", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["employee_number"] == "CS-00452"
    assert "today_shift" in data
    assert data["today_shift"]["site_name"] is not None


def test_guard_submit_and_view_leave(client, db):
    headers = get_guard_headers(client, "CS-00431")

    # 1. Submit leave request
    today = date.today()
    start = today + timedelta(days=5)
    end = today + timedelta(days=8)

    leave_resp = client.post(
        "/api/v1/guard-portal/leave",
        json={
            "leave_type": "Annual",
            "start_date": str(start),
            "end_date": str(end),
            "reason": "Family obligation in home county"
        },
        headers=headers
    )
    assert leave_resp.status_code == 200
    leave_data = leave_resp.json()
    assert leave_data["duration_days"] == 4
    assert leave_data["status"] == "PENDING"

    # 2. View leave history
    list_resp = client.get("/api/v1/guard-portal/leave", headers=headers)
    assert list_resp.status_code == 200
    leaves = list_resp.json()
    assert len(leaves) >= 1
    assert leaves[0]["reason"] == "Family obligation in home county"


def test_guard_report_incident(client, db):
    headers = get_guard_headers(client, "CS-00418")

    response = client.post(
        "/api/v1/guard-portal/incidents",
        json={
            "incident_type": "Security Incident",
            "site_id": 1,
            "incident_date": str(date.today()),
            "incident_time": "22:15",
            "description": "Attempted forced entry at East Gate. Alarm raised and perpetrator fled."
        },
        headers=headers
    )
    assert response.status_code == 200
    inc_data = response.json()
    assert inc_data["reference_number"].startswith("INC-")
    assert inc_data["status"] == "OPEN"

    # Verify audit entry
    audit = db.query(AuditLog).filter(AuditLog.action == "REPORT_INCIDENT").first()
    assert audit is not None


def test_guard_payslips(client):
    headers = get_guard_headers(client, "CS-00405")
    response = client.get("/api/v1/guard-portal/payslips", headers=headers)
    assert response.status_code == 200
    payslips = response.json()
    assert isinstance(payslips, list)



def test_guard_rbac_isolation(client):
    headers = get_guard_headers(client, "CS-00452")
    
    # Attempt to call Admin-only route -> Should fail with 403 Forbidden
    admin_route_resp = client.get("/api/v1/payroll/periods", headers=headers)
    assert admin_route_resp.status_code == 403


def test_admin_incidents_management(client, db):
    # 1. Guard reports an incident
    guard_headers = get_guard_headers(client, "CS-00418")
    report_resp = client.post(
        "/api/v1/guard-portal/incidents",
        json={
            "incident_type": "Medical Incident",
            "site_id": 1,
            "incident_date": str(date.today()),
            "incident_time": "14:30",
            "description": "Visitor suffered faintness at reception. First aid administered on scene."
        },
        headers=guard_headers
    )
    assert report_resp.status_code == 200
    inc_id = report_resp.json()["id"]

    # 2. Admin logs in
    admin_login = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@corpsec.co.ke", "password": os.getenv("ADMIN_INITIAL_PASSWORD", "TestAdminSecretPass123!")}
    )
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 3. Admin fetches incidents list
    list_resp = client.get("/api/v1/incidents", headers=admin_headers)
    assert list_resp.status_code == 200
    incidents = list_resp.json()
    assert len(incidents) >= 1
    found_inc = next((i for i in incidents if i["id"] == inc_id), None)
    assert found_inc is not None
    assert found_inc["incident_type"] == "Medical Incident"
    assert found_inc["status"] == "OPEN"

    # 4. Admin updates status to INVESTIGATING
    patch_resp = client.patch(
        f"/api/v1/incidents/{inc_id}/status",
        json={"status": "INVESTIGATING"},
        headers=admin_headers
    )
    assert patch_resp.status_code == 200
    assert patch_resp.json()["status"] == "INVESTIGATING"

    # 5. Admin updates status to RESOLVED
    patch_resp2 = client.patch(
        f"/api/v1/incidents/{inc_id}/status",
        json={"status": "RESOLVED"},
        headers=admin_headers
    )
    assert patch_resp2.status_code == 200
    assert patch_resp2.json()["status"] == "RESOLVED"

