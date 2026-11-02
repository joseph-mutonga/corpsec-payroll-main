import os
import pytest
from datetime import date
from application.backend.app.models.incident import Incident
from application.backend.app.models.audit import AuditLog


def get_admin_headers(client):
    admin_login = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@corpsec.co.ke", "password": os.getenv("ADMIN_INITIAL_PASSWORD", "TestAdminSecretPass123!")}
    )
    assert admin_login.status_code == 200, f"Login failed: {admin_login.text}"
    token = admin_login.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_list_admin_incidents_from_db(client, db):
    headers = get_admin_headers(client)

    # Ensure at least one incident exists in test DB
    create_res = client.post(
        "/api/v1/incidents",
        json={
            "guard_id": 1,
            "site_id": 1,
            "incident_type": "Perimeter Breach",
            "incident_date": str(date.today()),
            "incident_time": "02:15",
            "description": "Initial test perimeter breach description.",
            "status": "OPEN"
        },
        headers=headers
    )
    assert create_res.status_code == 201

    res = client.get("/api/v1/incidents", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    first = data[0]
    assert "reference_number" in first
    assert "guard_name" in first
    assert "guard_employee_number" in first
    assert "site_name" in first
    assert "incident_type" in first
    assert "status" in first


def test_filter_incidents_by_status(client, db):
    headers = get_admin_headers(client)

    # Create OPEN incident
    client.post(
        "/api/v1/incidents",
        json={
            "guard_id": 1,
            "site_id": 1,
            "incident_type": "Suspicious Activity",
            "incident_date": str(date.today()),
            "incident_time": "04:00",
            "description": "Suspicious person observed testing vehicle doors.",
            "status": "OPEN"
        },
        headers=headers
    )

    # Create RESOLVED incident
    client.post(
        "/api/v1/incidents",
        json={
            "guard_id": 1,
            "site_id": 1,
            "incident_type": "Noise Complaint",
            "incident_date": str(date.today()),
            "incident_time": "22:00",
            "description": "Tenant music volume too loud; guard intervened.",
            "status": "RESOLVED"
        },
        headers=headers
    )

    res_open = client.get("/api/v1/incidents?status_filter=OPEN", headers=headers)
    assert res_open.status_code == 200
    for inc in res_open.json():
        assert inc["status"] == "OPEN"

    res_res = client.get("/api/v1/incidents?status_filter=RESOLVED", headers=headers)
    assert res_res.status_code == 200
    for inc in res_res.json():
        assert inc["status"] == "RESOLVED"


def test_admin_create_incident_lifecycle(client, db):
    headers = get_admin_headers(client)
    payload = {
        "guard_id": 1,
        "site_id": 1,
        "incident_type": "Broken Seal",
        "incident_date": str(date.today()),
        "incident_time": "03:45",
        "description": "Container seal broken during transit check at depot entrance.",
        "status": "OPEN"
    }

    res = client.post("/api/v1/incidents", json=payload, headers=headers)
    assert res.status_code == 201
    created = res.json()
    assert created["incident_type"] == "Broken Seal"
    assert created["status"] == "OPEN"
    assert created["guard_id"] == 1
    assert created["site_id"] == 1
    assert "INC-" in created["reference_number"]

    inc_id = created["id"]

    # Retrieve single record
    get_res = client.get(f"/api/v1/incidents/{inc_id}", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["reference_number"] == created["reference_number"]

    # Status update: INVESTIGATING
    patch_res = client.patch(
        f"/api/v1/incidents/{inc_id}/status",
        json={"status": "INVESTIGATING"},
        headers=headers
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["status"] == "INVESTIGATING"

    # Status update: RESOLVED
    patch_res2 = client.patch(
        f"/api/v1/incidents/{inc_id}/status",
        json={"status": "RESOLVED"},
        headers=headers
    )
    assert patch_res2.status_code == 200
    assert patch_res2.json()["status"] == "RESOLVED"

    # Clean up delete
    del_res = client.delete(f"/api/v1/incidents/{inc_id}", headers=headers)
    assert del_res.status_code == 200

    # Verify deleted
    get_after = client.get(f"/api/v1/incidents/{inc_id}", headers=headers)
    assert get_after.status_code == 404


def test_incident_validation_errors(client, db):
    headers = get_admin_headers(client)
    # Description too short
    res_short = client.post(
        "/api/v1/incidents",
        json={"guard_id": 1, "site_id": 1, "incident_type": "Theft", "description": "bad"},
        headers=headers
    )
    assert res_short.status_code == 400

    # Non-existent guard
    res_no_guard = client.post(
        "/api/v1/incidents",
        json={"guard_id": 999999, "site_id": 1, "incident_type": "Theft", "description": "Legitimate length description."},
        headers=headers
    )
    assert res_no_guard.status_code == 404

    # Create an incident to test bad status
    create_res = client.post(
        "/api/v1/incidents",
        json={
            "guard_id": 1,
            "site_id": 1,
            "incident_type": "Property Damage",
            "incident_date": str(date.today()),
            "incident_time": "12:00",
            "description": "Minor dent on vehicle barrier gate after heavy wind gust.",
            "status": "OPEN"
        },
        headers=headers
    )
    assert create_res.status_code == 201
    inc_id = create_res.json()["id"]

    # Invalid status update
    res_bad_status = client.patch(
        f"/api/v1/incidents/{inc_id}/status",
        json={"status": "INVALID_STATUS"},
        headers=headers
    )
    assert res_bad_status.status_code == 400
