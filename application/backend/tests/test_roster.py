import os
import pytest
from datetime import date, datetime, timedelta
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.shift import Shift
from application.backend.app.models.roster import RosterPattern, RosterAssignment
from application.backend.app.models.user import User


def get_admin_headers(client):
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@corpsec.co.ke", "password": os.getenv("ADMIN_INITIAL_PASSWORD", "TestAdminSecretPass123!")}
    )
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def get_guard_headers(client, guard_emp_no="CS-00452"):
    login_resp = client.post(
        "/api/v1/auth/login/guard",
        json={"guard_id": guard_emp_no, "password": "Guard@123456"}
    )
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_roster_pattern_creation_and_assignments(client, db):
    headers = get_admin_headers(client)
    guard = db.query(Guard).filter(Guard.status == "ACTIVE").first()
    site = db.query(Site).first()
    shift = db.query(Shift).first()
    today = date.today()

    payload = {
        "guard_id": guard.id,
        "site_id": site.id,
        "shift_id": shift.id,
        "days_of_week": [0, 1, 2, 3, 4],  # Mon-Fri
        "start_date": today.strftime("%Y-%m-%d")
    }

    resp = client.post("/api/v1/roster/patterns", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["guard_id"] == guard.id

    # Verify RosterAssignment rows generated
    assignments = db.query(RosterAssignment).filter(
        RosterAssignment.guard_id == guard.id,
        RosterAssignment.shift_date >= today
    ).all()
    assert len(assignments) > 0


def test_single_date_override_and_conflict(client, db):
    headers = get_admin_headers(client)
    guard = db.query(Guard).filter(Guard.status == "ACTIVE").first()
    sites = db.query(Site).all()
    shifts = db.query(Shift).all()
    target_date = date.today() + timedelta(days=10)

    # 1. Set single day override
    payload_override = {
        "guard_id": guard.id,
        "site_id": sites[1].id if len(sites) > 1 else sites[0].id,
        "shift_id": shifts[1].id if len(shifts) > 1 else shifts[0].id,
        "shift_date": target_date.strftime("%Y-%m-%d"),
        "notes": "Reliever Override"
    }

    resp = client.post("/api/v1/roster/overrides", json=payload_override, headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["is_override"] == True

    # 2. Conflict detection: try to assign guard to a DIFFERENT site on the SAME date
    if len(sites) > 1:
        different_site_id = sites[0].id if sites[1].id != sites[0].id else sites[1].id
        payload_conflict = {
            "guard_id": guard.id,
            "site_id": different_site_id,
            "shift_id": shifts[0].id,
            "shift_date": target_date.strftime("%Y-%m-%d")
        }
        resp_conflict = client.post("/api/v1/roster/overrides", json=payload_conflict, headers=headers)
        assert resp_conflict.status_code == 400
        assert "Conflict detected" in resp_conflict.json()["detail"]


def test_roster_grid_api(client, db):
    headers = get_admin_headers(client)
    today = date.today()

    resp = client.get(f"/api/v1/roster/grid?year={today.year}&month={today.month}", headers=headers)
    assert resp.status_code == 200, resp.text
    grid = resp.json()
    assert grid["year"] == today.year
    assert grid["month"] == today.month
    assert len(grid["rows"]) > 0
