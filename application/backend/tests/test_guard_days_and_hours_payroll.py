import datetime
import pytest
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient

from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.shift import Shift
from application.backend.app.models.attendance import Attendance
from application.backend.app.models.payroll import PayrollPeriod, PayrollRecord
from application.backend.app.services.payroll_engine import calculate_guard_payroll
from application.backend.app.core.security import get_password_hash, create_access_token


def test_calculate_guard_payroll_days_and_hours_math():
    """
    Direct math test on calculate_guard_payroll:
    Basic salary: 18,720 KES
    26 days * 12 hours = 312 hours
    Daily rate: 18,720 / 26 = 720.00 KES
    Hourly rate: 18,720 / 312 = 60.00 KES
    """
    basic_salary = 18720.0
    expected_hourly_rate = 60.0
    expected_daily_rate = 720.0

    # 1. Full 26 days * 12 hours = 312 hours
    res_full = calculate_guard_payroll(
        basic_salary=basic_salary,
        days_worked=26,
        regular_hours=312.0
    )
    assert res_full["basic_pay"] == 18720.0

    # 2. 20 full shifts * 12 hours = 240 hours
    res_20_days = calculate_guard_payroll(
        basic_salary=basic_salary,
        days_worked=20,
        regular_hours=240.0
    )
    # 240 * 60 = 14,400.00 (or 20 * 720 = 14,400.00)
    assert res_20_days["basic_pay"] == 14400.0

    # 3. 20 full shifts (240h) + 1 partial shift of 6 hours = 246 hours
    res_partial = calculate_guard_payroll(
        basic_salary=basic_salary,
        days_worked=21,
        regular_hours=246.0
    )
    # 246 * 60 = 14,760.00 (or 20.5 days * 720 = 14,760.00)
    assert res_partial["basic_pay"] == 14760.0

    # 4. Overtime hours test: 20 regular hours overtime @ 1.5x
    res_ot = calculate_guard_payroll(
        basic_salary=basic_salary,
        regular_hours=312.0,
        overtime_hours=20.0
    )
    # OT Pay = 20 * (60.0 * 1.5) = 20 * 90 = 1,800.00
    assert res_ot["overtime_pay"] == 1800.0


def test_payroll_period_calculation_hours_and_days(db: Session, client: TestClient):
    """
    Integration test: calculate a payroll period where guards have different combinations
    of attended days and attended hours (including a partial shift of 6 hours instead of 12).
    """
    admin = db.query(User).filter(User.role == "ADMIN").first()
    if not admin:
        admin = User(
            email="admin.hours.test@corpsec.co.ke",
            phone="+254700111222",
            password_hash=get_password_hash("AdminPass123!"),
            full_name="Admin Hours Tester",
            role=UserRole.ADMIN.value,
            status=UserStatus.ACTIVE.value
        )
        db.add(admin)
        db.commit()
    token = create_access_token(data={"sub": admin.email, "role": "ADMIN"})
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Site with basic salary 26,000 KES (Daily = 1,000 KES, Hourly = 83.3333 KES)
    site = Site(
        site_name=f"Site Hours Test {int(datetime.datetime.now().timestamp())}",
        location="Westlands",
        client_name="Hours Test Corp",
        basic_salary=26000.0
    )
    db.add(site)
    db.commit()

    # Guard with site salary (26,000)
    guard = Guard(
        employee_number=f"CS-H{int(datetime.datetime.now().timestamp()) % 10000:04d}",
        full_name="Guard Partial Hours Test",
        national_id=f"ID-H{int(datetime.datetime.now().timestamp()) % 1000000:06d}",
        phone="+254722998877",
        email=f"guard.h{int(datetime.datetime.now().timestamp())}@corpsec.co.ke",
        hire_date=datetime.date(2025, 1, 1),
        primary_site_id=site.id,
        shift_id=1,
        status="ACTIVE"
    )
    db.add(guard)
    db.commit()

    # 2. Create Payroll Period (November 2027: 30 days)
    period = PayrollPeriod(
        year=2027,
        month=11,
        period_name="November 2027 Hours Test",
        start_date=datetime.date(2027, 11, 1),
        end_date=datetime.date(2027, 11, 30),
        status="OPEN"
    )
    db.add(period)
    db.commit()

    # 3. Create attendance:
    # 20 full 12-hour shifts + 1 partial 6-hour shift (total 21 shifts, 246 hours)
    for day in range(1, 21):
        att = Attendance(
            guard_id=guard.id,
            shift_id=1,
            site_id=site.id,
            shift_date=datetime.date(2027, 11, day),
            status="PRESENT",
            regular_hours=12.0
        )
        db.add(att)

    # 21st shift: only 6 hours worked
    att_partial = Attendance(
        guard_id=guard.id,
        shift_id=1,
        site_id=site.id,
        shift_date=datetime.date(2027, 11, 21),
        status="PRESENT",
        regular_hours=6.0
    )
    db.add(att_partial)
    db.commit()

    # 4. Trigger calculate payroll
    calc_res = client.post(f"/api/v1/payroll/{period.id}/calculate", headers=headers)
    assert calc_res.status_code == 200, calc_res.text

    # 5. Check guard payroll record
    rec = db.query(PayrollRecord).filter(
        PayrollRecord.payroll_period_id == period.id,
        PayrollRecord.guard_id == guard.id
    ).first()
    assert rec is not None
    assert rec.days_worked == 21
    assert rec.regular_hours == 246.0

    # With 26,000 monthly salary:
    # Daily rate = 26,000 / 26 = 1,000.00 KES
    # 30-day month with 4 allowed off days:
    # Contractual target = 26 working days (312 hours)
    # The guard worked 246 hours = 20.5 days
    # Shortfall = 5.5 days (5 days unworked + 0.5 day partial shift shortfall)
    # Deduction = 5.5 * 1000 = 5,500.00 KES
    assert rec.off_day_deduction == pytest.approx(5500.00, 0.05)
    # Gross basic after deduction = 26,000 - 5,500 = 20,500 KES (20.5 days * 1,000 = 20,500 KES!)
    effective_net_basic = rec.basic_pay - rec.off_day_deduction
    assert effective_net_basic == pytest.approx(20500.00, 0.05)
