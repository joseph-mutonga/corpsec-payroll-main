import datetime
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from application.backend.app.core.security import create_access_token, get_password_hash
from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.shift import Shift
from application.backend.app.models.attendance import Attendance
from application.backend.app.models.roster import RosterAssignment
from application.backend.app.models.off_day import GuardOffDaySchedule


def get_or_create_user(db: Session, role: str, email: str, name: str) -> tuple[User, str]:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            email=email,
            phone=f"+254701{abs(hash(email)) % 1000000:06d}",
            password_hash=get_password_hash("TestPass123!"),
            full_name=name,
            role=role,
            status=UserStatus.ACTIVE.value
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    token = create_access_token(data={"sub": str(user.id), "email": user.email, "role": user.role, "user_id": user.id})
    return user, token


def get_or_create_site(db: Session, site_name: str, supervisor_id: int = None) -> Site:
    site = db.query(Site).filter(Site.site_name == site_name).first()
    if not site:
        site = Site(
            site_name=site_name,
            location="Nairobi",
            client_name="Test Client Corp",
            supervisor_id=supervisor_id
        )
        db.add(site)
        db.commit()
        db.refresh(site)
    else:
        if supervisor_id is not None and site.supervisor_id != supervisor_id:
            site.supervisor_id = supervisor_id
            db.commit()
            db.refresh(site)
    return site


def get_or_create_guard(db: Session, emp_no: str, full_name: str, supervisor_id: int = None, site_id: int = None) -> Guard:
    guard = db.query(Guard).filter(Guard.employee_number == emp_no).first()
    if not guard:
        guard = Guard(
            employee_number=emp_no,
            full_name=full_name,
            national_id=f"ID-{abs(hash(emp_no)) % 10000000:08d}",
            phone=f"+254702{abs(hash(emp_no)) % 1000000:06d}",
            email=f"{emp_no.lower()}@testcorpsec.co.ke",
            hire_date=datetime.date(2025, 1, 1),
            supervisor_id=supervisor_id,
            primary_site_id=site_id,
            shift_id=1,
            status="ACTIVE"
        )
        db.add(guard)
        db.commit()
        db.refresh(guard)
    else:
        updated = False
        if supervisor_id is not None and guard.supervisor_id != supervisor_id:
            guard.supervisor_id = supervisor_id
            updated = True
        if site_id is not None and guard.primary_site_id != site_id:
            guard.primary_site_id = site_id
            updated = True
        if updated:
            db.commit()
            db.refresh(guard)
    return guard


# ── TEST SUITE: SUPERVISOR GUARD OFF-DAYS SCHEDULING MANDATE ───────────────────

def test_supervisor_can_set_consecutive_off_days_for_assigned_guard(client: TestClient, db: Session):
    """
    Supervisor can set 4 consecutive off-days in a month for their assigned guard.
    The days follow each other (block arrangement).
    """
    sup, sup_token = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.consecutive@testcorpsec.co.ke", "Supervisor Block")
    site = get_or_create_site(db, "Westlands Block Site", supervisor_id=sup.id)
    guard = get_or_create_guard(db, "CS-OFF-001", "Guard Patrick Consecutive", supervisor_id=sup.id, site_id=site.id)

    consecutive_dates = ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"]
    payload = {
        "year": 2026,
        "month": 11,
        "off_dates": consecutive_dates,
        "notes": "4 consecutive rest days block"
    }

    res = client.post(
        f"/api/v1/supervisors/guards/{guard.id}/off-days",
        json=payload,
        headers={"Authorization": f"Bearer {sup_token}"}
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["guard_id"] == guard.id
    assert data["total_off_days"] == 4
    assert sorted(data["off_dates"]) == sorted(consecutive_dates)

    # Check DB records in GuardOffDaySchedule
    records = db.query(GuardOffDaySchedule).filter(
        GuardOffDaySchedule.guard_id == guard.id,
        GuardOffDaySchedule.year == 2026,
        GuardOffDaySchedule.month == 11
    ).all()
    assert len(records) == 4
    saved_dates = [s.off_date.strftime("%Y-%m-%d") for s in records]
    assert sorted(saved_dates) == sorted(consecutive_dates)

    # Check RosterAssignment overrides created
    for d_str in consecutive_dates:
        d = datetime.date.fromisoformat(d_str)
        asgn = db.query(RosterAssignment).filter(
            RosterAssignment.guard_id == guard.id,
            RosterAssignment.shift_date == d
        ).first()
        assert asgn is not None
        assert asgn.is_override is True
        assert asgn.site_id is None


def test_supervisor_can_set_scattered_off_days_for_assigned_guard(client: TestClient, db: Session):
    """
    Supervisor can set 4 scattered / non-consecutive off-days (e.g. weekly rest days).
    The days do not follow each other.
    """
    sup, sup_token = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.scattered@testcorpsec.co.ke", "Supervisor Scattered")
    site = get_or_create_site(db, "Upperhill Scattered Site", supervisor_id=sup.id)
    guard = get_or_create_guard(db, "CS-OFF-002", "Guard Mercy Scattered", supervisor_id=sup.id, site_id=site.id)

    scattered_dates = ["2026-11-04", "2026-11-11", "2026-11-18", "2026-11-25"]
    payload = {
        "year": 2026,
        "month": 11,
        "off_dates": scattered_dates,
        "notes": "Weekly Wednesday rest days"
    }

    res = client.post(
        f"/api/v1/supervisors/guards/{guard.id}/off-days",
        json=payload,
        headers={"Authorization": f"Bearer {sup_token}"}
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["guard_id"] == guard.id
    assert data["total_off_days"] == 4
    assert sorted(data["off_dates"]) == sorted(scattered_dates)


def test_supervisor_cannot_set_off_days_for_unassigned_guard(client: TestClient, db: Session):
    """
    Supervisor cannot schedule off-days for a guard not assigned to them or their sites.
    Returns 403 Forbidden with supervisor mandate restriction.
    """
    sup1, sup1_token = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.alpha@testcorpsec.co.ke", "Supervisor Alpha")
    sup2, _ = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.beta@testcorpsec.co.ke", "Supervisor Beta")

    site2 = get_or_create_site(db, "Beta Site Mombasa", supervisor_id=sup2.id)
    guard_beta = get_or_create_guard(db, "CS-OFF-BETA", "Guard Under Beta", supervisor_id=sup2.id, site_id=site2.id)

    payload = {
        "year": 2026,
        "month": 11,
        "off_dates": ["2026-11-05", "2026-11-12", "2026-11-19", "2026-11-26"],
        "notes": "Unauthorized attempt"
    }

    res = client.post(
        f"/api/v1/supervisors/guards/{guard_beta.id}/off-days",
        json=payload,
        headers={"Authorization": f"Bearer {sup1_token}"}
    )
    assert res.status_code == 403
    assert "Supervisor Mandate Restriction" in res.json()["detail"]


def test_validation_rejects_more_than_4_off_days(client: TestClient, db: Session):
    """
    Attempting to schedule more than 4 off-days in a calendar month is rejected (400 Bad Request).
    """
    sup, sup_token = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.quota@testcorpsec.co.ke", "Supervisor Quota")
    site = get_or_create_site(db, "Quota Test Site", supervisor_id=sup.id)
    guard = get_or_create_guard(db, "CS-OFF-003", "Guard Quota Test", supervisor_id=sup.id, site_id=site.id)

    five_dates = ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"]
    payload = {
        "year": 2026,
        "month": 11,
        "off_dates": five_dates,
        "notes": "Excessive off-days"
    }

    res = client.post(
        f"/api/v1/supervisors/guards/{guard.id}/off-days",
        json=payload,
        headers={"Authorization": f"Bearer {sup_token}"}
    )
    assert res.status_code in [400, 422]


def test_validation_rejects_dates_outside_target_month(client: TestClient, db: Session):
    """
    Attempting to schedule off-days on dates that don't belong to the specified month/year is rejected.
    """
    sup, sup_token = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.monthmismatch@testcorpsec.co.ke", "Supervisor Mismatch")
    site = get_or_create_site(db, "Mismatch Test Site", supervisor_id=sup.id)
    guard = get_or_create_guard(db, "CS-OFF-004", "Guard Mismatch Test", supervisor_id=sup.id, site_id=site.id)

    # Month is November (11) but one date is December 02
    invalid_dates = ["2026-11-05", "2026-11-12", "2026-11-19", "2026-12-02"]
    payload = {
        "year": 2026,
        "month": 11,
        "off_dates": invalid_dates,
        "notes": "Mismatch month"
    }

    res = client.post(
        f"/api/v1/supervisors/guards/{guard.id}/off-days",
        json=payload,
        headers={"Authorization": f"Bearer {sup_token}"}
    )
    assert res.status_code == 400
    assert "does not belong" in res.json()["detail"]


def test_get_guard_off_days_schedule(client: TestClient, db: Session):
    """
    Supervisor can retrieve the scheduled off-days for an assigned guard.
    """
    sup, sup_token = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.gettest@testcorpsec.co.ke", "Supervisor Getter")
    site = get_or_create_site(db, "Getter Test Site", supervisor_id=sup.id)
    guard = get_or_create_guard(db, "CS-OFF-005", "Guard Getter Test", supervisor_id=sup.id, site_id=site.id)

    target_dates = ["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24"]
    client.post(
        f"/api/v1/supervisors/guards/{guard.id}/off-days",
        json={"year": 2026, "month": 11, "off_dates": target_dates, "notes": "Test get schedule"},
        headers={"Authorization": f"Bearer {sup_token}"}
    )

    get_res = client.get(
        f"/api/v1/supervisors/guards/{guard.id}/off-days?year=2026&month=11",
        headers={"Authorization": f"Bearer {sup_token}"}
    )
    assert get_res.status_code == 200, get_res.text
    data = get_res.json()
    assert data["guard_id"] == guard.id
    assert data["total_off_days"] == 4
    assert sorted(data["off_dates"]) == sorted(target_dates)


def test_roll_call_displays_scheduled_off_day(client: TestClient, db: Session):
    """
    When supervisor loads roll call attendance for a date, guards with scheduled off-days
    automatically reflect attendance_status = 'OFF'.
    """
    sup, sup_token = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.rollcall@testcorpsec.co.ke", "Supervisor RollCall")
    site = get_or_create_site(db, "RollCall Site", supervisor_id=sup.id)
    guard = get_or_create_guard(db, "CS-OFF-006", "Guard Off In RollCall", supervisor_id=sup.id, site_id=site.id)

    off_date_str = "2026-11-06"
    client.post(
        f"/api/v1/supervisors/guards/{guard.id}/off-days",
        json={"year": 2026, "month": 11, "off_dates": [off_date_str], "notes": "Rest day test"},
        headers={"Authorization": f"Bearer {sup_token}"}
    )

    att_res = client.get(
        f"/api/v1/supervisors/attendance?shift_date={off_date_str}&supervisor_id={sup.id}",
        headers={"Authorization": f"Bearer {sup_token}"}
    )
    assert att_res.status_code == 200, att_res.text
    att_list = att_res.json()
    guard_row = next((r for r in att_list if r["guard_id"] == guard.id), None)
    assert guard_row is not None
    assert guard_row["attendance_status"] == "OFF"


def test_delete_guard_off_days_schedule(client: TestClient, db: Session):
    """
    Supervisor can delete / clear scheduled off-days for a guard for a month.
    """
    sup, sup_token = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.del@testcorpsec.co.ke", "Supervisor Del")
    site = get_or_create_site(db, "Del Test Site", supervisor_id=sup.id)
    guard = get_or_create_guard(db, "CS-OFF-007", "Guard Del Test", supervisor_id=sup.id, site_id=site.id)

    client.post(
        f"/api/v1/supervisors/guards/{guard.id}/off-days",
        json={"year": 2026, "month": 11, "off_dates": ["2026-11-08"], "notes": "Temporary off-day"},
        headers={"Authorization": f"Bearer {sup_token}"}
    )

    # Delete schedule
    del_res = client.delete(
        f"/api/v1/supervisors/guards/{guard.id}/off-days?year=2026&month=11",
        headers={"Authorization": f"Bearer {sup_token}"}
    )
    assert del_res.status_code == 200, del_res.text
    assert del_res.json()["status"] == "success"

    # Verify 0 off-days remain
    get_res = client.get(
        f"/api/v1/supervisors/guards/{guard.id}/off-days?year=2026&month=11",
        headers={"Authorization": f"Bearer {sup_token}"}
    )
    assert get_res.status_code == 200
    assert get_res.json()["total_off_days"] == 0
