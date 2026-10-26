import os
import pytest
from datetime import datetime, timedelta, date
from application.backend.app.models.guard import Guard
from application.backend.app.models.attendance import Attendance
from application.backend.app.models.audit import AuditLog
from application.backend.app.services.attendance_service import calculate_shift_hours


def get_guard_headers(client, employee_number="CS-00452", password="Guard@123456"):
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "john.mwangi@corpsec.co.ke", "password": password}
    )
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def get_admin_headers(client):
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@corpsec.co.ke", "password": os.getenv("ADMIN_INITIAL_PASSWORD")}
    )
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_calculate_shift_hours():
    # 8 hour standard shift
    in_time = datetime(2026, 8, 1, 6, 0)
    out_time = datetime(2026, 8, 1, 14, 0)
    reg, ot = calculate_shift_hours(in_time, out_time)
    assert reg == 8.0
    assert ot == 0.0

    # 12 hour day shift (12h regular shift duration, 0h overtime)
    out_time_12h = datetime(2026, 8, 1, 18, 0)
    reg, ot = calculate_shift_hours(in_time, out_time_12h)
    assert reg == 12.0
    assert ot == 0.0

    # 14 hour day shift (12h regular + 2h overtime)
    out_time_14h = datetime(2026, 8, 1, 20, 0)
    reg, ot = calculate_shift_hours(in_time, out_time_14h)
    assert reg == 12.0
    assert ot == 2.0

    # Midnight crossing 12 hour night shift (18:00 to 06:00 next day = 12h reg, 0h OT)
    night_in = datetime(2026, 8, 1, 18, 0)
    night_out = datetime(2026, 8, 2, 6, 0)
    reg, ot = calculate_shift_hours(night_in, night_out)
    assert reg == 12.0
    assert ot == 0.0


def test_clock_in_and_clock_out(client, db):
    headers = get_guard_headers(client)
    
    # 1. Clock In
    clock_in_resp = client.post(
        "/api/v1/attendance/clock-in?shift_id=1",
        headers=headers
    )
    assert clock_in_resp.status_code == 200
    att_data = clock_in_resp.json()
    assert att_data["status"] == "PRESENT"
    assert att_data["actual_clock_in"] is not None

    # 2. Duplicate Clock In prevention
    dup_resp = client.post(
        "/api/v1/attendance/clock-in?shift_id=1",
        headers=headers
    )
    assert dup_resp.status_code == 400

    # 3. Clock Out
    clock_out_resp = client.post(
        "/api/v1/attendance/clock-out",
        headers=headers
    )
    assert clock_out_resp.status_code == 200
    out_data = clock_out_resp.json()
    assert out_data["actual_clock_out"] is not None


def test_my_attendance(client):
    headers = get_guard_headers(client)
    response = client.get("/api/v1/attendance", headers=headers)
    assert response.status_code == 200
    records = response.json()
    assert isinstance(records, list)


def test_attendance_anomalies_scanner(client, db):
    admin_headers = get_admin_headers(client)

    response = client.get("/api/v1/attendance/anomalies?start_date=2026-08-01&end_date=2026-08-31", headers=admin_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


def test_admin_attendance_correction(client, db):
    admin_headers = get_admin_headers(client)

    now = datetime.now()
    att = Attendance(
        guard_id=1,
        shift_id=1,
        shift_date=date.today(),
        actual_clock_in=now - timedelta(hours=10),
        status="PRESENT"
    )
    db.add(att)
    db.commit()
    db.refresh(att)

    correction_payload = {
        "actual_clock_in": (now - timedelta(hours=10)).isoformat(),
        "actual_clock_out": now.isoformat(),
        "status": "PRESENT",
        "reason": "Guard phone battery died; verified with supervisor"
    }

    correct_resp = client.put(
        f"/api/v1/attendance/{att.id}/correct",
        json=correction_payload,
        headers=admin_headers
    )
    assert correct_resp.status_code == 200
    corr_data = correct_resp.json()
    assert corr_data["regular_hours"] == 10.0
    assert corr_data["overtime_hours"] == 0.0


def test_overtime_management(client, db):
    admin_headers = get_admin_headers(client)
    now = datetime.now()
    att = Attendance(
        guard_id=1,
        shift_id=1,
        shift_date=date.today(),
        actual_clock_in=now - timedelta(hours=10),
        actual_clock_out=now,
        regular_hours=8.0,
        overtime_hours=2.0,
        status="PRESENT"
    )
    db.add(att)
    db.commit()

    overtime_list_resp = client.get("/api/v1/attendance", headers=admin_headers)
    assert overtime_list_resp.status_code == 200
