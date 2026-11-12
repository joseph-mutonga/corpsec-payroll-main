from datetime import date, datetime, timedelta
import pytest
from fastapi.testclient import TestClient
from application.backend.app.main import app
from application.backend.app.core.database import SessionLocal
from application.backend.app.core.security import get_password_hash, create_access_token
from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.guard import Guard
from application.backend.app.models.attendance import Attendance
from application.backend.app.models.shift import Shift


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture(scope="module")
def setup_test_guard():
    db = SessionLocal()
    # Check or create guard shift
    shift = db.query(Shift).first()
    if not shift:
        shift = Shift(name="Standard Shift", start_time="06:00:00", end_time="18:00:00", duration_hours=12.0)
        db.add(shift)
        db.commit()
        db.refresh(shift)

    guard = db.query(Guard).filter(Guard.employee_number == "TEST-UNCLOSED-01").first()
    if not guard:
        guard = Guard(
            employee_number="TEST-UNCLOSED-01",
            full_name="Test Unclosed Guard",
            national_id="99001122",
            phone="+254799001122",
            hire_date=date(2026, 1, 1),
            shift_id=shift.id,
            primary_site_id=1,
            status="ACTIVE"
        )
        db.add(guard)
        db.commit()
        db.refresh(guard)

    user = db.query(User).filter(User.phone == "+254799001122").first()
    if not user:
        user = User(
            email="test_unclosed@corpsec.co.ke",
            phone="+254799001122",
            password_hash=get_password_hash("GuardPass123!"),
            role=UserRole.GUARD.value,
            guard_id=guard.id,
            status=UserStatus.ACTIVE.value,
            full_name="Test Unclosed Guard"
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    token = create_access_token(data={"sub": str(user.id), "role": user.role, "guard_id": guard.id})
    headers = {"Authorization": f"Bearer {token}"}

    yield {"guard": guard, "user": user, "headers": headers, "shift": shift}

    # Cleanup
    db.query(Attendance).filter(Attendance.guard_id == guard.id).delete()
    db.query(User).filter(User.id == user.id).delete()
    db.query(Guard).filter(Guard.id == guard.id).delete()
    db.commit()
    db.close()


def test_stale_past_unclosed_shift_does_not_block_clock_in(client, setup_test_guard):
    """
    Verifies that a guard who left a shift unclosed on a previous date
    can smoothly clock in on a new day without getting 'Guard has an active unclosed shift'.
    The past shift must be cleanly auto-closed.
    """
    guard = setup_test_guard["guard"]
    headers = setup_test_guard["headers"]
    shift = setup_test_guard["shift"]
    db = SessionLocal()

    # 1. Clear any today attendance for this guard
    today = date.today()
    db.query(Attendance).filter(Attendance.guard_id == guard.id, Attendance.shift_date == today).delete()

    # 2. Simulate an unclosed past shift from 3 days ago
    past_date = today - timedelta(days=3)
    past_in = datetime.now() - timedelta(days=3)
    db.query(Attendance).filter(Attendance.guard_id == guard.id, Attendance.shift_date == past_date).delete()

    past_att = Attendance(
        guard_id=guard.id,
        shift_id=shift.id,
        site_id=1,
        shift_date=past_date,
        actual_clock_in=past_in,
        actual_clock_out=None,  # Unclosed past shift!
        status="PRESENT",
        notes="Forgotten past shift"
    )
    db.add(past_att)
    db.commit()
    db.refresh(past_att)
    past_att_id = past_att.id
    db.close()

    # 3. Guard clocks in TODAY via /attendance/clock-in
    res = client.post("/api/v1/attendance/clock-in", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["guard_id"] == guard.id
    assert data["actual_clock_in"] is not None
    assert data["actual_clock_out"] is None

    # 4. Verify in DB that the past shift from 3 days ago was cleanly auto-closed
    db = SessionLocal()
    updated_past = db.query(Attendance).filter(Attendance.id == past_att_id).first()
    assert updated_past is not None
    assert updated_past.actual_clock_out is not None
    assert updated_past.regular_hours == 12.0
    assert "Auto-closed" in (updated_past.notes or "")
    db.close()

    # 5. Guard attempting to clock in a second time TODAY while already clocked in should be rejected
    res_duplicate = client.post("/api/v1/attendance/clock-in", headers=headers)
    assert res_duplicate.status_code == 400
    assert "already clocked in for today" in res_duplicate.json()["detail"].lower()

    # 6. Guard clocks out of today's shift
    res_out = client.post("/api/v1/attendance/clock-out", headers=headers)
    assert res_out.status_code == 200
    assert res_out.json()["actual_clock_out"] is not None

