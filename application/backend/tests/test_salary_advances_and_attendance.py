import pytest
from datetime import date, datetime
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.shift import Shift
from application.backend.app.models.attendance import Attendance
from application.backend.app.models.payroll import PayrollPeriod, PayrollRecord
from application.backend.app.models.salary_advance import SalaryAdvance
from application.backend.app.models.user import User, UserRole


import os

def get_admin_headers(client: TestClient) -> dict:
    pwd = os.getenv("ADMIN_INITIAL_PASSWORD", "TestAdminSecretPass123!")
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@corpsec.co.ke", "password": pwd}
    )
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_issue_salary_advance_for_guard_and_staff(client: TestClient, db: Session):
    headers = get_admin_headers(client)

    # 1. Setup Guard
    site = Site(
        site_name="Advance Test Site",
        location="Westlands",
        client_name="Advance Corp",
        daily_rate=700.0,
        basic_salary=18200.0
    )
    db.add(site)
    db.commit()

    guard = Guard(
        employee_number="CS-ADV01",
        full_name="Advance Guard One",
        national_id="99881122",
        phone="0799881122",
        hire_date=date(2026, 1, 1),
        primary_site_id=site.id,
        basic_salary=18200.0
    )
    db.add(guard)

    # Setup Staff User
    staff_user = User(
        email="supervisor_adv@corpsec.co.ke",
        password_hash="hashed_pwd",
        full_name="Operations Staff",
        role=UserRole.SUPERVISOR.value,
        phone="0711998877",
        status="ACTIVE"
    )
    db.add(staff_user)
    db.commit()

    # 2. Issue Guard Advance
    g_res = client.post(
        "/api/v1/salary-advances",
        json={
            "advance_type": "GUARD",
            "guard_id": guard.id,
            "amount": 3500.0,
            "disbursement_date": "2026-11-15",
            "payment_method": "M-PESA",
            "reference_number": "QK78912345",
            "reason": "Mid-month medical emergency",
            "notes": "Approved by Operations Manager"
        },
        headers=headers
    )
    assert g_res.status_code == 201, g_res.text
    g_data = g_res.json()
    assert g_data["advance_reference"].startswith("ADV-202611-")
    assert g_data["amount"] == 3500.0
    assert g_data["status"] == "APPROVED"
    assert g_data["recipient_name"] == "Advance Guard One"
    g_adv_id = g_data["id"]

    # 3. Issue Staff Advance
    s_res = client.post(
        "/api/v1/salary-advances",
        json={
            "advance_type": "STAFF",
            "staff_id": staff_user.id,
            "amount": 5000.0,
            "disbursement_date": "2026-11-15",
            "payment_method": "BANK",
            "reference_number": "FT261115001",
            "reason": "School fees advance",
            "notes": "Approved by HR"
        },
        headers=headers
    )
    assert s_res.status_code == 201, s_res.text
    s_data = s_res.json()
    assert s_data["amount"] == 5000.0
    assert s_data["recipient_name"] == "Operations Staff"

    # 4. Filter list endpoints
    list_all = client.get("/api/v1/salary-advances", headers=headers)
    assert list_all.status_code == 200
    assert len(list_all.json()) >= 2

    list_guards = client.get("/api/v1/salary-advances?advance_type=GUARD", headers=headers)
    assert list_guards.status_code == 200
    assert all(a["advance_type"] == "GUARD" for a in list_guards.json())

    # Summary KPI endpoint
    kpi_res = client.get("/api/v1/salary-advances/summary", headers=headers)
    assert kpi_res.status_code == 200
    kpi = kpi_res.json()
    assert kpi["total_advances_count"] >= 2
    assert kpi["total_amount_disbursed"] >= 8500.0


def test_salary_advance_automatic_payroll_deduction(client: TestClient, db: Session):
    headers = get_admin_headers(client)

    # 1. Setup Site, Guard & Period
    site = Site(
        site_name="Advance Deduction Site",
        location="Upper Hill",
        client_name="Advance Deduction Client",
        daily_rate=800.0,
        basic_salary=20800.0
    )
    db.add(site)
    db.commit()

    guard = Guard(
        employee_number="CS-ADV02",
        full_name="Deduction Guard",
        national_id="99882233",
        phone="0799882233",
        hire_date=date(2026, 1, 1),
        primary_site_id=site.id,
        basic_salary=20800.0
    )
    db.add(guard)

    period = PayrollPeriod(
        year=2026,
        month=12,
        period_name="December 2026",
        start_date=date(2026, 12, 1),
        end_date=date(2026, 12, 31),
        status="DRAFT"
    )
    db.add(period)
    db.commit()

    # 2. Issue Advance of 4,000 KES linked to this period
    adv = SalaryAdvance(
        advance_reference="ADV-202612-0001",
        advance_type="GUARD",
        guard_id=guard.id,
        payroll_period_id=period.id,
        amount=4000.0,
        disbursement_date=date(2026, 12, 15),
        payment_method="M-PESA",
        reference_number="MPESA12345",
        reason="Mid-month advance",
        status="APPROVED"
    )
    db.add(adv)
    db.commit()

    # 3. Calculate Payroll for period
    calc_res = client.post(f"/api/v1/payroll/{period.id}/calculate", headers=headers)
    assert calc_res.status_code == 200, calc_res.text

    # 4. Check Payroll Record has deducted advance
    rec = db.query(PayrollRecord).filter_by(payroll_period_id=period.id, guard_id=guard.id).first()
    assert rec is not None
    assert rec.salary_advance_deduction == 4000.0

    # 5. Check advance record is marked DEDUCTED
    db.refresh(adv)
    assert adv.status == "DEDUCTED"
    assert adv.deducted_at is not None

    # 6. Verify Gross-to-Net API includes salary_advance_deduction
    records_res = client.get(f"/api/v1/payroll/{period.id}/records", headers=headers)
    assert records_res.status_code == 200
    target_rec = next((r for r in records_res.json() if r["guard_id"] == guard.id), None)
    assert target_rec is not None
    assert target_rec["salary_advance_deduction"] == 4000.0


def test_attendance_and_excess_off_days_automatic_deduction(client: TestClient, db: Session):
    """
    Guards have 4 allowed days off in a month.
    If a guard worked 22 days in a 30-day month (missed 8 days),
    excess unworked days = 8 - 4 = 4 days.
    The system must automatically deduct: 4 * (basic_salary / 26.0).
    A guard who worked 26 days (missed 4 days) incurs 0 excess off-day deductions.
    """
    headers = get_admin_headers(client)

    site = Site(
        site_name="Attendance Site Alpha",
        location="Kilimani",
        client_name="Alpha Corp",
        daily_rate=600.0,
        basic_salary=15000.0
    )
    db.add(site)
    db.commit()

    shift = db.query(Shift).first()
    if not shift:
        shift = Shift(shift_name="Day Shift", start_time="06:00:00", end_time="18:00:00", duration_hours=12.0)
        db.add(shift)
        db.commit()

    # Guard 1: Works only 22 days (4 excess off days)
    guard1 = Guard(
        employee_number="CS-ATT01",
        full_name="Absentee Guard",
        national_id="77112233",
        phone="0777112233",
        hire_date=date(2026, 1, 1),
        primary_site_id=site.id,
        basic_salary=15000.0
    )
    # Guard 2: Works full 26 days (0 excess off days)
    guard2 = Guard(
        employee_number="CS-ATT02",
        full_name="Punctual Guard",
        national_id="77112244",
        phone="0777112244",
        hire_date=date(2026, 1, 1),
        primary_site_id=site.id,
        basic_salary=15000.0
    )
    db.add_all([guard1, guard2])
    db.commit()

    period = PayrollPeriod(
        year=2026,
        month=11,
        period_name="November 2026 Attendance Test",
        start_date=date(2026, 11, 1),
        end_date=date(2026, 11, 30),
        status="DRAFT"
    )
    db.add(period)
    db.commit()

    # Log 22 attendances for guard1 (Nov 1 to Nov 22)
    for day in range(1, 23):
        att = Attendance(
            guard_id=guard1.id,
            site_id=site.id,
            shift_id=shift.id,
            shift_date=date(2026, 11, day),
            status="PRESENT",
            regular_hours=12.0,
            overtime_hours=0.0
        )
        db.add(att)

    # Log 26 attendances for guard2 (Nov 1 to Nov 26)
    for day in range(1, 27):
        att = Attendance(
            guard_id=guard2.id,
            site_id=site.id,
            shift_id=shift.id,
            shift_date=date(2026, 11, day),
            status="PRESENT",
            regular_hours=12.0,
            overtime_hours=0.0
        )
        db.add(att)

    db.commit()

    # Calculate Payroll
    calc_res = client.post(f"/api/v1/payroll/{period.id}/calculate", headers=headers)
    assert calc_res.status_code == 200, calc_res.text

    rec1 = db.query(PayrollRecord).filter_by(payroll_period_id=period.id, guard_id=guard1.id).first()
    rec2 = db.query(PayrollRecord).filter_by(payroll_period_id=period.id, guard_id=guard2.id).first()

    assert rec1 is not None
    assert rec2 is not None

    # Guard 1: days_worked = 22, unworked = 30 - 22 = 8, excess = 8 - 4 = 4 days
    assert rec1.days_worked == 22
    expected_excess_deduction = round(4.0 * (15000.0 / 26.0), 2)  # 2307.69
    assert abs(rec1.off_day_deduction - expected_excess_deduction) <= 0.02
    assert rec1.net_pay < rec2.net_pay

    # Guard 2: days_worked = 26, unworked = 30 - 26 = 4, excess = 4 - 4 = 0 days
    assert rec2.days_worked == 26
    assert rec2.off_day_deduction == 0.0
