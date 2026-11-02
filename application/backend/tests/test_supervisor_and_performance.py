import os
import uuid
import pytest
from datetime import date, datetime, timedelta
from application.backend.app.models.guard import Guard
from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.site import Site
from application.backend.app.models.shift import Shift
from application.backend.app.models.incident import Incident
from application.backend.app.models.leave import LeaveRequest
from application.backend.app.core.security import get_password_hash


def get_auth_token(client, email, password):
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password}
    )
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    return login_resp.json()["access_token"]


def get_admin_headers(client):
    token = get_auth_token(
        client,
        "admin@corpsec.co.ke",
        os.getenv("ADMIN_INITIAL_PASSWORD", "TestAdminSecretPass123!")
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def setup_supervisors_and_guards(db):
    # Ensure site exists
    site = db.query(Site).first()
    if not site:
        site = Site(site_name="Alpha Industrial Park", site_code="AIP-01", location="Nairobi", hourly_billing_rate=250.0, monthly_rate=65000.0)
        db.add(site)
        db.commit()
        db.refresh(site)

    # Ensure shift exists
    shift = db.query(Shift).first()
    if not shift:
        shift = Shift(name="Day Shift", start_time="06:00", end_time="18:00", duration_hours=12.0)
        db.add(shift)
        db.commit()
        db.refresh(shift)

    # 1. Create Supervisor 1
    sup1 = db.query(User).filter(User.email == "sup1.test@corpsec.co.ke").first()
    if not sup1:
        sup1 = User(
            full_name="Supervisor One",
            email="sup1.test@corpsec.co.ke",
            phone="0711100001",
            password_hash=get_password_hash("Password123!"),
            role=UserRole.SUPERVISOR.value,
            status=UserStatus.ACTIVE.value
        )
        db.add(sup1)
        db.commit()
        db.refresh(sup1)

    # 2. Create Supervisor 2
    sup2 = db.query(User).filter(User.email == "sup2.test@corpsec.co.ke").first()
    if not sup2:
        sup2 = User(
            full_name="Supervisor Two",
            email="sup2.test@corpsec.co.ke",
            phone="0711100002",
            password_hash=get_password_hash("Password123!"),
            role=UserRole.SUPERVISOR.value,
            status=UserStatus.ACTIVE.value
        )
        db.add(sup2)
        db.commit()
        db.refresh(sup2)

    # 3. Create Guard 1 (assigned to Supervisor 1)
    g1 = db.query(Guard).filter(Guard.employee_number == "CS-SUP-001").first()
    if not g1:
        g1 = Guard(
            employee_number="CS-SUP-001",
            national_id="11223341",
            full_name="Alice Wanjiku",
            phone="0712000001",
            hire_date=date.today(),
            primary_site_id=site.id,
            shift_id=shift.id,
            supervisor_id=sup1.id,
            status="ACTIVE",
            is_reliever=False
        )
        db.add(g1)
        db.commit()
        db.refresh(g1)
    else:
        g1.supervisor_id = sup1.id
        db.commit()

    # 4. Create Guard 2 (assigned to Supervisor 2)
    g2 = db.query(Guard).filter(Guard.employee_number == "CS-SUP-002").first()
    if not g2:
        g2 = Guard(
            employee_number="CS-SUP-002",
            national_id="11223342",
            full_name="Bob Otieno",
            phone="0712000002",
            hire_date=date.today(),
            primary_site_id=site.id,
            shift_id=shift.id,
            supervisor_id=sup2.id,
            status="ACTIVE",
            is_reliever=False
        )
        db.add(g2)
        db.commit()
        db.refresh(g2)
    else:
        g2.supervisor_id = sup2.id
        db.commit()

    # 5. Create Guard 3 (Reliever guard)
    g3 = db.query(Guard).filter(Guard.employee_number == "CS-REL-003").first()
    if not g3:
        g3 = Guard(
            employee_number="CS-REL-003",
            national_id="11223343",
            full_name="Charles Mutua",
            phone="0712000003",
            hire_date=date.today(),
            primary_site_id=site.id,
            shift_id=shift.id,
            supervisor_id=sup1.id,
            status="ACTIVE",
            is_reliever=True
        )
        db.add(g3)
        db.commit()
        db.refresh(g3)

    return {
        "sup1": sup1,
        "sup2": sup2,
        "guard1": g1,
        "guard2": g2,
        "reliever": g3,
        "site": site
    }


def test_supervisor_incident_reports_isolation(client, db, setup_supervisors_and_guards):
    """Verify Field Supervisor only sees and manages incident reports of assigned guards."""
    data = setup_supervisors_and_guards
    sup1 = data["sup1"]
    sup2 = data["sup2"]
    g1 = data["guard1"]
    g2 = data["guard2"]
    site = data["site"]

    sup1_token = get_auth_token(client, sup1.email, "Password123!")
    sup1_headers = {"Authorization": f"Bearer {sup1_token}"}

    sup2_token = get_auth_token(client, sup2.email, "Password123!")
    sup2_headers = {"Authorization": f"Bearer {sup2_token}"}

    # 1. Create incident for Guard 1
    inc1 = Incident(
        reference_number=f"INC-{uuid.uuid4().hex[:8].upper()}",
        guard_id=g1.id,
        site_id=site.id,
        incident_date=date.today(),
        incident_time="10:30",
        incident_type="EQUIPMENT_FAULT",
        status="OPEN",
        description="Flashlight malfunction at gate A"
    )
    # 2. Create incident for Guard 2
    inc2 = Incident(
        reference_number=f"INC-{uuid.uuid4().hex[:8].upper()}",
        guard_id=g2.id,
        site_id=site.id,
        incident_date=date.today(),
        incident_time="11:45",
        incident_type="PERIMETER_BREACH",
        status="OPEN",
        description="Broken fence section at perimeter east"
    )
    db.add(inc1)
    db.add(inc2)
    db.commit()
    db.refresh(inc1)
    db.refresh(inc2)

    # Supervisor 1 lists incidents: should ONLY see inc1, NOT inc2
    resp1 = client.get("/api/v1/incidents", headers=sup1_headers)
    assert resp1.status_code == 200
    incidents_sup1 = resp1.json()
    sup1_inc_ids = [i["id"] for i in incidents_sup1]
    assert inc1.id in sup1_inc_ids, "Supervisor 1 should see assigned guard's incident"
    assert inc2.id not in sup1_inc_ids, "Supervisor 1 should NOT see unassigned guard's incident"

    # Supervisor 2 lists incidents: should ONLY see inc2, NOT inc1
    resp2 = client.get("/api/v1/incidents", headers=sup2_headers)
    assert resp2.status_code == 200
    incidents_sup2 = resp2.json()
    sup2_inc_ids = [i["id"] for i in incidents_sup2]
    assert inc2.id in sup2_inc_ids, "Supervisor 2 should see assigned guard's incident"
    assert inc1.id not in sup2_inc_ids, "Supervisor 2 should NOT see unassigned guard's incident"

    # Supervisor 1 attempts to create incident for Guard 2: MUST return 403 Forbidden
    unauth_create = client.post(
        "/api/v1/incidents",
        headers=sup1_headers,
        json={
            "guard_id": g2.id,
            "site_id": site.id,
            "incident_date": str(date.today()),
            "incident_time": "12:00",
            "incident_type": "THEFT_REPORTED",
            "description": "Unauthorized incident creation attempt"
        }
    )
    assert unauth_create.status_code == 403
    assert "not assigned to you" in unauth_create.json()["detail"]

    # Supervisor 1 attempts to view detail of inc2 (Guard 2): MUST return 403 Forbidden
    unauth_view = client.get(f"/api/v1/incidents/{inc2.id}", headers=sup1_headers)
    assert unauth_view.status_code == 403

    # Supervisor 1 attempts to update status of inc2 (Guard 2): MUST return 403 Forbidden
    unauth_update = client.patch(
        f"/api/v1/incidents/{inc2.id}/status",
        headers=sup1_headers,
        json={"status": "INVESTIGATING"}
    )
    assert unauth_update.status_code == 403

    # Supervisor 1 updates inc1 (assigned guard): MUST succeed
    auth_update = client.patch(
        f"/api/v1/incidents/{inc1.id}/status",
        headers=sup1_headers,
        json={"status": "INVESTIGATING"}
    )
    assert auth_update.status_code == 200
    assert auth_update.json()["status"] == "INVESTIGATING"


def test_supervisor_blocked_from_running_payroll(client, setup_supervisors_and_guards):
    """Verify Supervisor is strictly forbidden from running or calculating payroll."""
    data = setup_supervisors_and_guards
    sup1 = data["sup1"]
    sup1_token = get_auth_token(client, sup1.email, "Password123!")
    sup1_headers = {"Authorization": f"Bearer {sup1_token}"}

    # Supervisor attempts to calculate payroll: MUST return 403
    resp = client.post(
        "/api/v1/payroll/1/calculate",
        headers=sup1_headers
    )
    assert resp.status_code == 403
    assert "Administrative privileges required" in resp.json()["detail"]


def test_supervisor_leave_isolation(client, db, setup_supervisors_and_guards):
    """Verify Supervisor only sees and approves leave requests of assigned guards."""
    data = setup_supervisors_and_guards
    sup1 = data["sup1"]
    g1 = data["guard1"]
    g2 = data["guard2"]

    sup1_token = get_auth_token(client, sup1.email, "Password123!")
    sup1_headers = {"Authorization": f"Bearer {sup1_token}"}

    # Create leave requests
    today = date.today()
    l1 = LeaveRequest(
        guard_id=g1.id,
        leave_type="ANNUAL",
        start_date=today + timedelta(days=5),
        end_date=today + timedelta(days=8),
        duration_days=4,
        reason="Annual rest",
        status="PENDING"
    )
    l2 = LeaveRequest(
        guard_id=g2.id,
        leave_type="EMERGENCY",
        start_date=today + timedelta(days=3),
        end_date=today + timedelta(days=5),
        duration_days=3,
        reason="Family emergency",
        status="PENDING"
    )
    db.add(l1)
    db.add(l2)
    db.commit()
    db.refresh(l1)
    db.refresh(l2)

    # Supervisor 1 lists leave: should only see l1, NOT l2
    resp = client.get("/api/v1/leave", headers=sup1_headers)
    assert resp.status_code == 200
    leave_list = resp.json()
    leave_ids = [x["id"] for x in leave_list]
    assert l1.id in leave_ids
    assert l2.id not in leave_ids

    # Supervisor 1 attempts to approve l2 (Guard 2): MUST return 403 Forbidden
    resp_unauth = client.patch(
        f"/api/v1/leave/{l2.id}/status",
        headers=sup1_headers,
        json={"status": "APPROVED", "comments": "Unauthorized approval"}
    )
    assert resp_unauth.status_code == 403
    assert "not assigned to you" in resp_unauth.json()["detail"]

    # Supervisor 1 approves l1 (Guard 1): MUST succeed
    resp_auth = client.patch(
        f"/api/v1/leave/{l1.id}/status",
        headers=sup1_headers,
        json={"status": "APPROVED", "comments": "Approved by supervisor"}
    )
    assert resp_auth.status_code == 200
    assert resp_auth.json()["status"] == "APPROVED"


def test_admin_performance_and_transactions_any_month_or_year(client):
    """Verify Admin can inspect performance analytics and financial transactions ledger for any month/year."""
    admin_headers = get_admin_headers(client)

    # Request analytics for specific year and month
    resp = client.get("/api/v1/reports/analytics?year=2026&month=1", headers=admin_headers)
    assert resp.status_code == 200
    data = resp.json()

    # Check that KPI fields exist
    assert "kpis" in data
    assert "monthly_payroll_gross" in data["kpis"]
    assert "total_company_cost" in data["kpis"]

    # Check that company_finances ledger exists
    assert "company_finances" in data
    cf = data["company_finances"]
    assert "gross_payroll" in cf
    assert "net_disbursed" in cf
    assert "employer_statutory_obligations" in cf
    assert "total_company_outflow" in cf
    assert "bank_disbursed" in cf
    assert "mpesa_disbursed" in cf
    assert "transactions" in cf
    assert isinstance(cf["transactions"], list)
    assert "available_years" in data
    assert 2026 in data["available_years"]


def test_guard_4_days_off_statutory_default(client, db, setup_supervisors_and_guards):
    """Verify statutory 4 days off per month applies as default when guard requests off-days."""
    data = setup_supervisors_and_guards
    g1 = data["guard1"]
    admin_headers = get_admin_headers(client)

    # Submit off day request for guard 1 (2 days)
    today = date.today()
    start_d = today + timedelta(days=2)
    end_d = today + timedelta(days=3)
    resp = client.post(
        f"/api/v1/off-days/requests?guard_id={g1.id}",
        headers=admin_headers,
        json={
            "start_date": str(start_d),
            "end_date": str(end_d)
        }
    )
    assert resp.status_code == 201
    res_data = resp.json()
    assert res_data["guard_id"] == g1.id
    assert res_data["days_count"] == 2
    assert res_data["status"] == "PENDING_REVIEW"


def test_reliever_guards_system(client, setup_supervisors_and_guards):
    """Verify designated reliever guards can be filtered and identified."""
    admin_headers = get_admin_headers(client)

    resp = client.get("/api/v1/guards?is_reliever=true", headers=admin_headers)
    assert resp.status_code == 200
    relievers = resp.json()
    assert len(relievers) >= 1
    assert any(g["employee_number"] == "CS-REL-003" for g in relievers)
    assert all(g["is_reliever"] is True for g in relievers)
