import os
import pytest
from datetime import date
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from application.backend.app.models.region import Region
from application.backend.app.models.site import Site
from application.backend.app.models.guard import Guard
from application.backend.app.models.off_day import OffDayAllowance, OffDayRequest, RelieverAssignment
from application.backend.app.models.payroll import PayrollPeriod, PayrollRecord


def get_admin_headers(client: TestClient) -> dict:
    pwd = os.getenv("ADMIN_INITIAL_PASSWORD", "TestAdminSecretPass123!")
    resp = client.post("/api/v1/auth/login", json={"email": "admin@corpsec.co.ke", "password": pwd})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ===================================================================
# PART A TESTS: REGIONS, SITES WITH SALARIES, PER-GUARD OVERRIDES
# ===================================================================

def test_region_crud(client: TestClient):
    headers = get_admin_headers(client)

    # 1. Create region
    res = client.post("/api/v1/regions/", json={"name": "Coast Region"}, headers=headers)
    assert res.status_code in [200, 201], res.text
    region_data = res.json()
    assert region_data["name"] == "Coast Region"
    region_id = region_data["id"]

    # 2. List regions
    res = client.get("/api/v1/regions/", headers=headers)
    assert res.status_code == 200
    regions = res.json()
    assert any(r["id"] == region_id for r in regions)


def test_site_salary_and_guard_override(client: TestClient, db: Session):
    headers = get_admin_headers(client)

    # Create Region
    reg_res = client.post("/api/v1/regions/", json={"name": "Rift Valley"}, headers=headers)
    region_id = reg_res.json()["id"]

    # Create Site with region_id and basic_salary
    site_res = client.post(
        "/api/v1/sites/",
        json={
            "site_name": "Eldoret Depot",
            "location": "Eldoret Town",
            "client_name": "Rift Logistics",
            "daily_rate": 750.0,
            "basic_salary": 18000.0,
            "region_id": region_id
        },
        headers=headers
    )
    assert site_res.status_code in [200, 201], site_res.text
    site = site_res.json()
    site_id = site["id"]
    assert site["basic_salary"] == 18000.0
    assert site["region_id"] == region_id

    # Create Guard without basic_salary (Null -> inherits Site basic salary)
    guard1_res = client.post(
        "/api/v1/guards/",
        json={
            "employee_number": "CS-00801",
            "full_name": "James Kipchoge",
            "national_id": "99988877",
            "phone": "0799888777",
            "hire_date": "2026-01-15",
            "site_id": site_id,
            "basic_salary": None,
            "is_reliever": False
        },
        headers=headers
    )
    assert guard1_res.status_code in [200, 201], guard1_res.text
    g1 = guard1_res.json()
    assert g1["basic_salary"] is None
    assert g1["resolved_basic_salary"] == 18000.0

    # Create Guard with basic_salary override
    guard2_res = client.post(
        "/api/v1/guards/",
        json={
            "employee_number": "CS-00802",
            "full_name": "Supervisor Kip",
            "national_id": "99988876",
            "phone": "0799888776",
            "hire_date": "2026-01-15",
            "site_id": site_id,
            "basic_salary": 25000.0,
            "is_reliever": False
        },
        headers=headers
    )
    assert guard2_res.status_code in [200, 201], guard2_res.text
    g2 = guard2_res.json()
    assert g2["basic_salary"] == 25000.0
    assert g2["resolved_basic_salary"] == 25000.0


def test_overtime_hourly_rate_basis(db: Session):
    # Verify OT rate formula basis: effective_basic_salary / 26 / 12
    # Standard 15,000 salary: 15,000 / 26 / 12 = 48.076923...
    site = Site(
        site_name="Test Site Alpha",
        location="Nairobi HQ",
        client_name="Test Client Corp",
        daily_rate=600.0,
        basic_salary=15000.0
    )
    db.add(site)
    db.commit()

    guard = Guard(
        employee_number="CS-T001",
        full_name="Test Guard",
        national_id="11122233",
        phone="0711222333",
        hire_date=date(2026, 1, 1),
        primary_site_id=site.id,
        basic_salary=None
    )
    db.add(guard)
    db.commit()

    # Null guard.basic_salary inherits site's 15,000 basic_salary
    assert guard.effective_basic_salary == 15000.0
    ot_rate = round(guard.effective_basic_salary / 26.0 / 12.0, 2)
    assert ot_rate == round(15000.0 / 26.0 / 12.0, 2)  # 48.08

    # Guard with override 26,000 salary: 26,000 / 26 / 12 = 83.333... -> 83.33
    guard.basic_salary = 26000.0
    db.commit()
    assert guard.effective_basic_salary == 26000.0
    ot_rate_override = round(guard.effective_basic_salary / 26.0 / 12.0, 2)
    assert ot_rate_override == round(26000.0 / 26.0 / 12.0, 2)


# ===================================================================
# PART B TESTS: OFF DAYS, RELIEVERS, PAYROLL TRANSFER & ROSTER
# ===================================================================

def test_off_day_allowance_and_request_validation(client: TestClient, db: Session):
    headers = get_admin_headers(client)

    # Get a guard from db
    guard = db.query(Guard).filter(Guard.is_reliever == False).first()
    assert guard is not None

    # 1. Set allowance for 2026-10 (e.g. 2 off days)
    allowance_res = client.post(
        "/api/v1/off-days/allowances",
        json={"guard_id": guard.id, "year": 2026, "month": 10, "days_allowed": 2},
        headers=headers
    )
    assert allowance_res.status_code in [200, 201], allowance_res.text
    assert allowance_res.json()["days_allowed"] == 2

    # 2. Submit off request exceeding allowance (3 days when allowance is 2)
    bad_req_res = client.post(
        f"/api/v1/off-days/requests?guard_id={guard.id}",
        json={
            "start_date": "2026-10-05",
            "end_date": "2026-10-07"
        },
        headers=headers
    )
    assert bad_req_res.status_code == 400
    assert "exceed" in bad_req_res.json()["detail"].lower() or "allowance" in bad_req_res.json()["detail"].lower()

    # 3. Submit valid off request (2 days)
    valid_req_res = client.post(
        f"/api/v1/off-days/requests?guard_id={guard.id}",
        json={
            "start_date": "2026-10-05",
            "end_date": "2026-10-06"
        },
        headers=headers
    )
    assert valid_req_res.status_code in [200, 201], valid_req_res.text
    req_data = valid_req_res.json()
    assert req_data["status"] == "PENDING_REVIEW"
    assert req_data["days_count"] == 2


def test_off_day_approval_requires_relievers(client: TestClient, db: Session):
    headers = get_admin_headers(client)

    site = db.query(Site).first()
    guard = db.query(Guard).filter(Guard.primary_site_id == site.id, Guard.is_reliever == False).first()
    reliever = db.query(Guard).filter(Guard.is_reliever == True).first()

    if not reliever:
        # Create a reliever guard
        reliever_res = client.post(
            "/api/v1/guards/",
            json={
                "employee_number": "CS-REL88",
                "full_name": "Reliever One",
                "national_id": "88877766",
                "phone": "0788777666",
                "hire_date": "2026-01-01",
                "site_id": None,
                "is_reliever": True
            },
            headers=headers
        )
        assert reliever_res.status_code in [200, 201], reliever_res.text
        reliever_id = reliever_res.json()["id"]
    else:
        reliever_id = reliever.id

    # Set allowance for guard
    client.post(
        "/api/v1/off-days/allowances",
        json={"guard_id": guard.id, "year": 2026, "month": 10, "days_allowed": 4},
        headers=headers
    )

    # Create request for Oct 10 - Oct 11 (2 days)
    req_res = client.post(
        f"/api/v1/off-days/requests?guard_id={guard.id}",
        json={
            "start_date": "2026-10-10",
            "end_date": "2026-10-11"
        },
        headers=headers
    )
    assert req_res.status_code in [200, 201], req_res.text
    req_id = req_res.json()["id"]

    # Attempt to approve WITHOUT relievers -> HTTP 400 or 422
    no_reliever_app = client.post(
        f"/api/v1/off-days/requests/{req_id}/approve",
        json={"reliever_assignments": []},
        headers=headers
    )
    assert no_reliever_app.status_code in [400, 422]

    # Attempt to approve WITH partial relievers (missing 2026-10-11) -> HTTP 400
    partial_app = client.post(
        f"/api/v1/off-days/requests/{req_id}/approve",
        json={
            "reliever_assignments": [
                {
                    "shift_date": "2026-10-10",
                    "reliever_guard_id": reliever_id,
                    "site_id": site.id,
                    "shift_id": 1
                }
            ]
        },
        headers=headers
    )
    assert partial_app.status_code == 400
    assert "cover" in partial_app.json()["detail"].lower() or "missing" in partial_app.json()["detail"].lower()

    # Approve WITH full coverage -> HTTP 200
    full_app = client.post(
        f"/api/v1/off-days/requests/{req_id}/approve",
        json={
            "reliever_assignments": [
                {
                    "shift_date": "2026-10-10",
                    "reliever_guard_id": reliever_id,
                    "site_id": site.id,
                    "shift_id": 1
                },
                {
                    "shift_date": "2026-10-11",
                    "reliever_guard_id": reliever_id,
                    "site_id": site.id,
                    "shift_id": 1
                }
            ]
        },
        headers=headers
    )
    assert full_app.status_code == 200, full_app.text
    assert full_app.json()["status"] == "APPROVED"


def test_payroll_reconciliation_and_off_day_transfer(client: TestClient, db: Session):
    headers = get_admin_headers(client)

    # 1. Setup Site & Guards
    site = Site(
        site_name="Reconcile Site Nov",
        location="Mombasa",
        client_name="Coast Security Ltd",
        daily_rate=600.0,
        basic_salary=15000.0
    )
    db.add(site)
    db.commit()

    reg_guard = Guard(
        employee_number="CS-REG01",
        full_name="Regular Guard",
        national_id="12312312",
        phone="0712312312",
        hire_date=date(2026, 1, 1),
        primary_site_id=site.id,
        is_reliever=False
    )
    reliever_guard = Guard(
        employee_number="CS-REL01",
        full_name="Reliever Guard",
        national_id="32132132",
        phone="0732132132",
        hire_date=date(2026, 1, 1),
        primary_site_id=None,
        is_reliever=True
    )
    db.add_all([reg_guard, reliever_guard])
    db.commit()

    # 2. Setup Period
    period = PayrollPeriod(
        year=2026,
        month=11,
        period_name="November 2026",
        start_date=date(2026, 11, 1),
        end_date=date(2026, 11, 30),
        status="DRAFT"
    )
    db.add(period)
    db.commit()

    # Set allowance for Nov 2026 for reg_guard
    client.post(
        "/api/v1/off-days/allowances",
        json={"guard_id": reg_guard.id, "year": 2026, "month": 11, "days_allowed": 4},
        headers=headers
    )

    # Submit 2 off days for reg_guard
    req_res = client.post(
        f"/api/v1/off-days/requests?guard_id={reg_guard.id}",
        json={
            "start_date": "2026-11-05",
            "end_date": "2026-11-06"
        },
        headers=headers
    )
    assert req_res.status_code in [200, 201], req_res.text
    req_id = req_res.json()["id"]

    # Approve with reliever_guard covering both days
    app_res = client.post(
        f"/api/v1/off-days/requests/{req_id}/approve",
        json={
            "reliever_assignments": [
                {
                    "shift_date": "2026-11-05",
                    "reliever_guard_id": reliever_guard.id,
                    "site_id": site.id,
                    "shift_id": 1
                },
                {
                    "shift_date": "2026-11-06",
                    "reliever_guard_id": reliever_guard.id,
                    "site_id": site.id,
                    "shift_id": 1
                }
            ]
        },
        headers=headers
    )
    assert app_res.status_code == 200, app_res.text

    # Calculate Payroll for period
    calc_res = client.post(f"/api/v1/payroll/{period.id}/calculate", headers=headers)
    assert calc_res.status_code == 200, calc_res.text

    # Inspect records
    reg_rec = db.query(PayrollRecord).filter_by(payroll_period_id=period.id, guard_id=reg_guard.id).first()
    rel_rec = db.query(PayrollRecord).filter_by(payroll_period_id=period.id, guard_id=reliever_guard.id).first()

    assert reg_rec is not None
    assert rel_rec is not None

    # Off day deduction for regular guard = 2 days * (15000.0 / 26.0) = 1153.85 (or 1153.84)
    expected_deduction = round(2.0 * (15000.0 / 26.0), 2)
    assert abs(reg_rec.off_day_deduction - expected_deduction) <= 0.02

    # Reliever earnings for reliever guard = 2 shifts * (15000.0 / 26.0)
    assert abs(rel_rec.reliever_earnings - expected_deduction) <= 0.02

    # Perfect financial transfer: deduction on regular = earnings on reliever
    assert reg_rec.off_day_deduction == rel_rec.reliever_earnings


def test_period_locking_for_off_days(client: TestClient, db: Session):
    headers = get_admin_headers(client)

    # 1. Create a CONFIRMED period (Sept 2026)
    period = PayrollPeriod(
        year=2026,
        month=9,
        period_name="September 2026 Locked",
        start_date=date(2026, 9, 1),
        end_date=date(2026, 9, 30),
        status="CONFIRMED"
    )
    db.add(period)
    db.commit()

    guard = db.query(Guard).filter(Guard.is_reliever == False).first()

    # 2. Attempt to create off-day request for a date in Sept 2026 -> HTTP 400
    res = client.post(
        f"/api/v1/off-days/requests?guard_id={guard.id}",
        json={
            "start_date": "2026-09-15",
            "end_date": "2026-09-15"
        },
        headers=headers
    )
    assert res.status_code == 400
    assert "locked" in res.json()["detail"].lower() or "confirmed" in res.json()["detail"].lower() or "closed" in res.json()["detail"].lower()
