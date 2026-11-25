import datetime
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from application.backend.app.core.security import create_access_token, get_password_hash
from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.shift import Shift
from application.backend.app.models.off_day import GuardOffDaySchedule
from application.backend.app.main import app


def test_guard_dashboard_scheduled_off_days(db: Session, client: TestClient):
    """
    Test that guards can see their 4 required monthly off days assigned by their supervisor
    in their dashboard and off-days endpoints.
    """
    today = datetime.date.today()
    target_year = today.year
    target_month = today.month

    # 1. Create Supervisor
    sup_email = f"sup.dash.test.{int(datetime.datetime.now().timestamp())}@corpsec.co.ke"
    sup_user = User(
        email=sup_email,
        phone="+254711888999",
        password_hash=get_password_hash("SupPass123!"),
        full_name="Field Supervisor Daniel",
        role=UserRole.SUPERVISOR.value,
        status=UserStatus.ACTIVE.value
    )
    db.add(sup_user)
    db.commit()
    db.refresh(sup_user)

    # 2. Create Site
    site = Site(
        site_name=f"Test Dashboard Site {int(datetime.datetime.now().timestamp())}",
        location="Upperhill, Nairobi",
        client_name="Dashboard Bank",
        supervisor_id=sup_user.id
    )
    db.add(site)
    db.commit()
    db.refresh(site)

    # 3. Create Guard
    emp_no = f"GD-{int(datetime.datetime.now().timestamp()) % 100000:05d}"
    guard = Guard(
        employee_number=emp_no,
        full_name="Guard Dash Tester",
        national_id=f"ID-{int(datetime.datetime.now().timestamp()) % 1000000:07d}",
        phone="+254722334455",
        email=f"{emp_no.lower()}@corpsec.co.ke",
        hire_date=datetime.date(2025, 1, 1),
        supervisor_id=sup_user.id,
        primary_site_id=site.id,
        shift_id=1,
        status="ACTIVE"
    )
    db.add(guard)
    db.commit()
    db.refresh(guard)

    # 4. Create Guard User Account
    guard_user_email = f"user.{emp_no.lower()}@corpsec.co.ke"
    guard_user = User(
        email=guard_user_email,
        phone=guard.phone,
        password_hash=get_password_hash("GuardPass123!"),
        full_name=guard.full_name,
        role=UserRole.GUARD.value,
        guard_id=guard.id,
        status=UserStatus.ACTIVE.value
    )
    db.add(guard_user)
    db.commit()
    db_session = db
    db_session.refresh(guard_user)

    guard_token = create_access_token(data={"sub": guard_user.email, "email": guard_user.email, "role": "GUARD"})
    headers = {"Authorization": f"Bearer {guard_token}"}

    # Test initial state: No scheduled off days
    resp_init = client.get("/api/v1/guard-portal/dashboard", headers=headers)
    assert resp_init.status_code == 200, resp_init.text
    data_init = resp_init.json()
    assert data_init["off_days_count"] == 0
    assert data_init["scheduled_off_days"] == []
    assert data_init["is_today_off"] is False

    # 5. Supervisor assigns 4 scheduled off days
    off_date_1 = datetime.date(target_year, target_month, 5)
    off_date_2 = datetime.date(target_year, target_month, 10)
    off_date_3 = datetime.date(target_year, target_month, 15)
    off_date_4 = datetime.date(target_year, target_month, 20)

    for d in [off_date_1, off_date_2, off_date_3, off_date_4]:
        sched = GuardOffDaySchedule(
            guard_id=guard.id,
            supervisor_id=sup_user.id,
            year=target_year,
            month=target_month,
            off_date=d,
            notes="Assigned monthly rest day"
        )
        db_session.add(sched)
    db_session.commit()

    # 6. Verify Guard Dashboard has scheduled off days populated
    resp = client.get("/api/v1/guard-portal/dashboard", headers=headers)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["guard_id"] == guard.id
    assert data["off_days_count"] == 4
    assert len(data["scheduled_off_days"]) == 4
    assert str(off_date_1) in data["scheduled_off_days"]
    assert str(off_date_4) in data["scheduled_off_days"]
    assert data["off_days_supervisor_name"] == "Field Supervisor Daniel"
    assert data["off_days_notes"] == "Assigned monthly rest day"

    # Verify details structure
    details = data["scheduled_off_days_details"]
    assert len(details) == 4
    for item in details:
        assert "off_date" in item
        assert "formatted_date" in item
        assert item["status"] in ["TODAY", "UPCOMING", "COMPLETED"]
        assert item["notes"] == "Assigned monthly rest day"

    # 7. Verify dedicated /guard-portal/off-days endpoint
    resp_off = client.get("/api/v1/guard-portal/off-days", headers=headers)
    assert resp_off.status_code == 200, resp_off.text
    off_data = resp_off.json()
    assert off_data["guard_id"] == guard.id
    assert off_data["total_off_days"] == 4
    assert off_data["supervisor_name"] == "Field Supervisor Daniel"

    # 8. Verify Guard can access their own schedule via /supervisors/guards/{id}/off-days
    resp_own = client.get(f"/api/v1/supervisors/guards/{guard.id}/off-days", headers=headers)
    assert resp_own.status_code == 200, resp_own.text
    assert resp_own.json()["total_off_days"] == 4

    # 9. Verify Guard is blocked (403) from accessing another guard's off-days schedule
    other_guard_id = 99999
    resp_other = client.get(f"/api/v1/supervisors/guards/{other_guard_id}/off-days", headers=headers)
    assert resp_other.status_code in [403, 404]
