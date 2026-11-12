import pytest
from datetime import date, datetime
from fastapi.testclient import TestClient
from application.backend.app.main import app
from application.backend.app.core.database import SessionLocal
from application.backend.app.models.user import User, UserRole
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.shift import Shift
from application.backend.app.models.attendance import Attendance
from application.backend.app.core.security import create_access_token

client = TestClient(app)

@pytest.fixture
def auth_admin_token():
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.role == UserRole.ADMIN.value).first()
        if not admin:
            admin = User(
                email="admin_test_att_filter@corpsec.com",
                hashed_password="hashed_dummy_pw",
                role=UserRole.ADMIN.value,
                is_active=True
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)
        token = create_access_token(data={"sub": str(admin.id), "role": admin.role, "user_id": admin.id})
        return token
    finally:
        db.close()

def test_attendance_shift_and_site_filtering(auth_admin_token):
    db = SessionLocal()
    try:
        # 1. Setup test sites
        site_a = db.query(Site).filter(Site.site_name == "Site Test Alpha").first()
        if not site_a:
            site_a = Site(site_name="Site Test Alpha", location="Nairobi Alpha", client_name="Client A", daily_rate=1200.0)
            db.add(site_a)

        site_b = db.query(Site).filter(Site.site_name == "Site Test Beta").first()
        if not site_b:
            site_b = Site(site_name="Site Test Beta", location="Mombasa Beta", client_name="Client B", daily_rate=1300.0)
            db.add(site_b)
        db.commit()

        # 2. Setup shifts: Day shift and Night shift
        shift_day = db.query(Shift).filter(Shift.name == "Day Shift Test").first()
        if not shift_day:
            shift_day = Shift(name="Day Shift Test", start_time="06:00", end_time="18:00", duration_hours=12.0, is_night_shift=False, shift_type="DAY")
            db.add(shift_day)

        shift_night = db.query(Shift).filter(Shift.name == "Night Shift Test").first()
        if not shift_night:
            shift_night = Shift(name="Night Shift Test", start_time="18:00", end_time="06:00", duration_hours=12.0, is_night_shift=True, shift_type="NIGHT")
            db.add(shift_night)
        db.commit()

        # 3. Setup test guard
        guard = db.query(Guard).filter(Guard.full_name == "Filter Test Guard").first()
        if not guard:
            guard = Guard(
                employee_number="TEST-ATT-001",
                full_name="Filter Test Guard",
                national_id="9988776655",
                phone="0711000999",
                primary_site_id=site_a.id,
                shift_id=shift_day.id,
                hire_date=date(2025, 1, 1),
                status="ACTIVE"
            )
            db.add(guard)
            db.commit()

        test_date = date(2026, 11, 12)

        # Clear existing test attendances for this guard
        db.query(Attendance).filter(Attendance.guard_id == guard.id).delete()
        db.commit()

        # 4. Insert 1 day shift on site_a, 1 night shift on site_b
        att_day = Attendance(
            guard_id=guard.id,
            shift_id=shift_day.id,
            site_id=site_a.id,
            shift_date=test_date,
            actual_clock_in=datetime(2026, 11, 12, 6, 0),
            actual_clock_out=datetime(2026, 11, 12, 18, 0),
            regular_hours=12.0,
            overtime_hours=0.0,
            status="PRESENT"
        )
        att_night = Attendance(
            guard_id=guard.id,
            shift_id=shift_night.id,
            site_id=site_b.id,
            shift_date=test_date,
            actual_clock_in=datetime(2026, 11, 12, 18, 0),
            actual_clock_out=datetime(2026, 11, 13, 6, 0),
            regular_hours=12.0,
            overtime_hours=2.0,
            status="PRESENT"
        )
        db.add_all([att_day, att_night])
        db.commit()

        headers = {"Authorization": f"Bearer {auth_admin_token}"}

        # Query all records
        res_all = client.get(f"/api/v1/attendance?guard_id={guard.id}", headers=headers)
        assert res_all.status_code == 200
        records = res_all.json()
        assert len(records) == 2
        
        # Verify shift attributes returned
        day_rec = next(r for r in records if r["shift_id"] == shift_day.id)
        night_rec = next(r for r in records if r["shift_id"] == shift_night.id)
        assert day_rec["is_night_shift"] is False
        assert day_rec["shift_type"] == "DAY"
        assert night_rec["is_night_shift"] is True
        assert night_rec["shift_type"] == "NIGHT"

        # Query filter by site_id == site_a.id
        res_site_a = client.get(f"/api/v1/attendance?guard_id={guard.id}&site_id={site_a.id}", headers=headers)
        assert res_site_a.status_code == 200
        records_site_a = res_site_a.json()
        assert len(records_site_a) == 1
        assert records_site_a[0]["site_id"] == site_a.id

        # Query filter by shift_type == NIGHT
        res_night = client.get(f"/api/v1/attendance?guard_id={guard.id}&shift_type=NIGHT", headers=headers)
        assert res_night.status_code == 200
        records_night = res_night.json()
        assert len(records_night) == 1
        assert records_night[0]["shift_id"] == shift_night.id
        assert records_night[0]["is_night_shift"] is True

        # Query filter by shift_type == DAY
        res_day = client.get(f"/api/v1/attendance?guard_id={guard.id}&shift_type=DAY", headers=headers)
        assert res_day.status_code == 200
        records_day = res_day.json()
        assert len(records_day) == 1
        assert records_day[0]["shift_id"] == shift_day.id

        # Query filter by is_night_shift == True
        res_is_night = client.get(f"/api/v1/attendance?guard_id={guard.id}&is_night_shift=true", headers=headers)
        assert res_is_night.status_code == 200
        records_is_night = res_is_night.json()
        assert len(records_is_night) == 1
        assert records_is_night[0]["shift_id"] == shift_night.id

        # Query filter by search text "Beta" (should match Site Test Beta)
        res_search = client.get(f"/api/v1/attendance?guard_id={guard.id}&search=Beta", headers=headers)
        assert res_search.status_code == 200
        records_search = res_search.json()
        assert len(records_search) == 1
        assert records_search[0]["site_id"] == site_b.id

    finally:
        db.close()
