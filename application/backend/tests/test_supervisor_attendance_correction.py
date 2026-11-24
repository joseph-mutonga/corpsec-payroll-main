import datetime
import pytest
from application.backend.app.core.security import create_access_token, get_password_hash
from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.shift import Shift
from application.backend.app.models.attendance import Attendance
from application.backend.app.models.audit import AuditLog


def get_or_create_user(db, role: str, email: str, name: str) -> tuple[User, str]:
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


def get_or_create_site(db, site_name: str, supervisor_id: int = None) -> Site:
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


def get_or_create_guard(db, emp_no: str, full_name: str, supervisor_id: int = None, site_id: int = None) -> Guard:
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


def test_supervisor_can_correct_own_guard_attendance(client, db):
    """Field Supervisor can correct attendance of guards assigned directly to them."""
    sup, sup_token = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.kimani@testcorpsec.co.ke", "John Kimani")
    site = get_or_create_site(db, "Westlands Site 1")
    guard = get_or_create_guard(db, "CS-TEST-001", "Angela Okech Test", supervisor_id=sup.id, site_id=site.id)

    today = datetime.date.today()
    clock_in = datetime.datetime.combine(today, datetime.time(8, 0))
    att = Attendance(
        guard_id=guard.id,
        shift_id=1,
        site_id=site.id,
        shift_date=today,
        actual_clock_in=clock_in,
        actual_clock_out=None,
        regular_hours=0.0,
        overtime_hours=0.0,
        status="PRESENT",
        notes="Shift started"
    )
    db.add(att)
    db.commit()
    db.refresh(att)

    # Supervisor corrects attendance by setting clock-out time
    clock_out = datetime.datetime.combine(today, datetime.time(20, 0))
    resp = client.put(
        f"/api/v1/attendance/{att.id}/correct",
        headers={"Authorization": f"Bearer {sup_token}"},
        json={
            "actual_clock_in": clock_in.isoformat(),
            "actual_clock_out": clock_out.isoformat(),
            "status": "PRESENT",
            "reason": "Supervisor confirmed shift completion on ground"
        }
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["regular_hours"] == 12.0
    assert "Corrected by Supervisor" in data["notes"]
    assert "Supervisor confirmed shift completion" in data["notes"]

    # Verify audit log was created
    audit = db.query(AuditLog).filter(
        AuditLog.action == "CORRECT_ATTENDANCE",
        AuditLog.target_id == str(att.id)
    ).first()
    assert audit is not None
    assert audit.user_id == sup.id


def test_supervisor_can_correct_attendance_at_supervised_site(client, db):
    """Field Supervisor can correct attendance of guards deployed at sites they supervise."""
    sup, sup_token = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.site@testcorpsec.co.ke", "Site Supervisor")
    site = get_or_create_site(db, "KICC Supervised Site", supervisor_id=sup.id)
    # Guard not directly assigned supervisor_id, but stationed at supervisor's site
    guard = get_or_create_guard(db, "CS-TEST-002", "Joseph Lino Test", supervisor_id=None, site_id=site.id)

    today = datetime.date.today()
    clock_in = datetime.datetime.combine(today, datetime.time(18, 0))
    att = Attendance(
        guard_id=guard.id,
        shift_id=1,
        site_id=site.id,
        shift_date=today,
        actual_clock_in=clock_in,
        status="PRESENT"
    )
    db.add(att)
    db.commit()
    db.refresh(att)

    clock_out = clock_in + datetime.timedelta(hours=12)
    resp = client.put(
        f"/api/v1/attendance/{att.id}/correct",
        headers={"Authorization": f"Bearer {sup_token}"},
        json={
            "actual_clock_in": clock_in.isoformat(),
            "actual_clock_out": clock_out.isoformat(),
            "status": "PRESENT",
            "reason": "Night shift completed verified at site"
        }
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["regular_hours"] == 12.0


def test_supervisor_forbidden_to_correct_unsupervised_guard(client, db):
    """Field Supervisor is blocked with 403 when trying to correct a guard under another supervisor."""
    sup_a, sup_a_token = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.a@testcorpsec.co.ke", "Supervisor A")
    sup_b, _ = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.b@testcorpsec.co.ke", "Supervisor B")

    site_b = get_or_create_site(db, "Other Site B", supervisor_id=sup_b.id)
    guard_b = get_or_create_guard(db, "CS-TEST-003", "Other Guard B", supervisor_id=sup_b.id, site_id=site_b.id)

    today = datetime.date.today()
    att = Attendance(
        guard_id=guard_b.id,
        shift_id=1,
        site_id=site_b.id,
        shift_date=today,
        actual_clock_in=datetime.datetime.now(),
        status="PRESENT"
    )
    db.add(att)
    db.commit()
    db.refresh(att)

    resp = client.put(
        f"/api/v1/attendance/{att.id}/correct",
        headers={"Authorization": f"Bearer {sup_a_token}"},
        json={
            "actual_clock_in": datetime.datetime.now().isoformat(),
            "actual_clock_out": (datetime.datetime.now() + datetime.timedelta(hours=8)).isoformat(),
            "status": "PRESENT",
            "reason": "Attempting unauthorized correction"
        }
    )
    assert resp.status_code == 403
    assert "Supervisor Mandate Restriction" in resp.json()["detail"]


def test_supervisor_can_mark_guard_absent(client, db):
    """When a supervisor marks a guard as ABSENT, hours should be reset to 0."""
    sup, sup_token = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.kimani@testcorpsec.co.ke", "John Kimani")
    site = get_or_create_site(db, "Westlands Site 1")
    guard = get_or_create_guard(db, "CS-TEST-001", "Angela Okech Test", supervisor_id=sup.id, site_id=site.id)

    today = datetime.date.today()
    att = Attendance(
        guard_id=guard.id,
        shift_id=1,
        site_id=site.id,
        shift_date=today,
        actual_clock_in=datetime.datetime.now(),
        regular_hours=8.0,
        status="PRESENT"
    )
    db.add(att)
    db.commit()
    db.refresh(att)

    resp = client.put(
        f"/api/v1/attendance/{att.id}/correct",
        headers={"Authorization": f"Bearer {sup_token}"},
        json={
            "actual_clock_in": None,
            "actual_clock_out": None,
            "status": "ABSENT",
            "reason": "Guard did not report for duty"
        }
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "ABSENT"
    assert data["regular_hours"] == 0.0
    assert data["overtime_hours"] == 0.0


def test_admin_can_correct_any_guard_attendance(client, db):
    """Admin retains universal mandate to correct any guard's attendance."""
    admin, admin_token = get_or_create_user(db, UserRole.ADMIN.value, "admin.test@testcorpsec.co.ke", "Admin Test")
    guard = get_or_create_guard(db, "CS-TEST-003", "Other Guard B")
    today = datetime.date.today()
    now = datetime.datetime.now()

    att = Attendance(
        guard_id=guard.id,
        shift_id=1,
        site_id=1,
        shift_date=today,
        actual_clock_in=now - datetime.timedelta(hours=8),
        status="PRESENT"
    )
    db.add(att)
    db.commit()
    db.refresh(att)

    resp = client.put(
        f"/api/v1/attendance/{att.id}/correct",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "actual_clock_in": (now - datetime.timedelta(hours=8)).isoformat(),
            "actual_clock_out": now.isoformat(),
            "status": "PRESENT",
            "reason": "Admin systemic adjustment"
        }
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "Corrected by Admin" in data["notes"]


def test_supervisor_manual_shift_logging(client, db):
    """Supervisor can manually log shift for supervised guard, but is blocked for unsupervised guard."""
    sup_a, sup_a_token = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.a@testcorpsec.co.ke", "Supervisor A")
    sup_b, _ = get_or_create_user(db, UserRole.SUPERVISOR.value, "sup.b@testcorpsec.co.ke", "Supervisor B")

    guard_a = get_or_create_guard(db, "CS-TEST-004", "Guard Under A", supervisor_id=sup_a.id)
    guard_b = get_or_create_guard(db, "CS-TEST-005", "Guard Under B", supervisor_id=sup_b.id)

    today = datetime.date.today()
    in_time = datetime.datetime.combine(today, datetime.time(7, 0))
    out_time = datetime.datetime.combine(today, datetime.time(19, 0))

    # 1. Successful manual log for guard_a
    resp_ok = client.post(
        "/api/v1/attendance/log",
        headers={"Authorization": f"Bearer {sup_a_token}"},
        json={
            "guard_id": guard_a.id,
            "shift_id": 1,
            "site_id": 1,
            "shift_date": today.isoformat(),
            "actual_clock_in": in_time.isoformat(),
            "actual_clock_out": out_time.isoformat(),
            "notes": "Manual supervisor ground log"
        }
    )
    assert resp_ok.status_code == 201, resp_ok.text
    data = resp_ok.json()
    assert data["regular_hours"] == 12.0
    assert "Logged by Supervisor" in data["notes"]

    # 2. Blocked for guard_b
    resp_block = client.post(
        "/api/v1/attendance/log",
        headers={"Authorization": f"Bearer {sup_a_token}"},
        json={
            "guard_id": guard_b.id,
            "shift_id": 1,
            "site_id": 1,
            "shift_date": today.isoformat(),
            "actual_clock_in": in_time.isoformat(),
            "actual_clock_out": out_time.isoformat(),
            "notes": "Unauthorized attempt"
        }
    )
    assert resp_block.status_code == 403
    assert "Supervisor Mandate Restriction" in resp_block.json()["detail"]
