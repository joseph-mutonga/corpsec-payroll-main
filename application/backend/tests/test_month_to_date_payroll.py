import pytest
from datetime import date
from application.backend.app.services.payroll_engine import (
    calculate_month_to_date_guard_pay,
    format_pay_period_label,
)
from application.backend.app.services.payment_service import build_payment_schedules_and_reconciliation
from application.backend.app.models.guard import Guard
from application.backend.app.models.payroll import PayrollPeriod, PayrollRecord


def test_format_pay_period_label():
    """Verifies human-readable billing period formatting for schedules."""
    # Mid-month label
    lbl1 = format_pay_period_label(date(2026, 11, 1), date(2026, 11, 20))
    assert lbl1 == "1st Nov – 20th Nov 2026"

    # Day 1 label
    lbl2 = format_pay_period_label(date(2026, 11, 1), date(2026, 11, 1))
    assert lbl2 == "1st Nov – 1st Nov 2026"

    # Full month label
    lbl3 = format_pay_period_label(date(2026, 11, 1), date(2026, 11, 30))
    assert lbl3 == "1st Nov – 30th Nov 2026"


def test_mid_month_check_with_full_offdays():
    """
    Scenario 1: Mid-month check (Date 20) with 16 days worked and 4 off-days.
    Total elapsed calendar days: 20
    Valid off-days: 4 (capped at 4)
    Total payable days: 16 + 4 = 20 (100% of elapsed days)
    """
    res = calculate_month_to_date_guard_pay(
        monthly_salary=15000.0,
        days_worked=16,
        off_days_taken=4,
        period_start=date(2026, 11, 1),
        period_end=date(2026, 11, 30),
        as_of_date=date(2026, 11, 20),
    )

    assert res["elapsed_calendar_days"] == 20
    assert res["days_worked"] == 16
    assert res["off_days_used"] == 4
    assert res["off_days_remaining"] == 0
    assert res["total_payable_days"] == 20
    # 15,000 / 30 * 20 = 10,000.00
    assert res["accrued_amount"] == pytest.approx(10000.00, 0.01)


def test_mid_month_check_with_missed_days():
    """
    Scenario 2: Mid-month check (Date 20) with 14 days worked and 4 off-days.
    Guard missed 2 days unexcused (14 worked + 4 off = 18 payable days out of 20 elapsed).
    Accrued pay should prorate for 18 days.
    """
    res = calculate_month_to_date_guard_pay(
        monthly_salary=15000.0,
        days_worked=14,
        off_days_taken=4,
        period_start=date(2026, 11, 1),
        period_end=date(2026, 11, 30),
        as_of_date=date(2026, 11, 20),
    )

    assert res["elapsed_calendar_days"] == 20
    assert res["days_worked"] == 14
    assert res["off_days_used"] == 4
    assert res["off_days_remaining"] == 0
    assert res["total_payable_days"] == 18
    # 15000 / 30 * 18 = 9,000.00
    assert res["accrued_amount"] == pytest.approx(9000.00, 0.01)


def test_first_day_of_month():
    """
    Scenario 3: First day of the month (Date 1).
    Guard worked Day 1.
    Elapsed days = 1, payable days = 1.
    Accrued = 15000 / 30 * 1 = 500.00
    """
    res = calculate_month_to_date_guard_pay(
        monthly_salary=15000.0,
        days_worked=1,
        off_days_taken=0,
        has_explicit_off_days=True,
        period_start=date(2026, 11, 1),
        period_end=date(2026, 11, 30),
        as_of_date=date(2026, 11, 1),
    )

    assert res["elapsed_calendar_days"] == 1
    assert res["days_worked"] == 1
    assert res["off_days_used"] == 0
    assert res["off_days_remaining"] == 4
    assert res["total_payable_days"] == 1
    assert res["accrued_amount"] == pytest.approx(500.00, 0.01)


def test_last_day_of_30_day_month():
    """
    Scenario 4: Last day of the month (Nov 30).
    Guard worked 26 days and took 4 off-days = 30 days total.
    Guard receives 100% full monthly salary.
    """
    res = calculate_month_to_date_guard_pay(
        monthly_salary=15000.0,
        days_worked=26,
        off_days_taken=4,
        period_start=date(2026, 11, 1),
        period_end=date(2026, 11, 30),
        as_of_date=date(2026, 11, 30),
    )

    assert res["elapsed_calendar_days"] == 30
    assert res["total_payable_days"] == 30
    assert res["accrued_amount"] == pytest.approx(15000.00, 0.01)


def test_last_day_of_28_day_month():
    """
    Scenario 5: Last day of a 28-day month (February).
    Guard worked 24 days + 4 off-days = 28 days.
    Proration factor is 1.0 (100% full salary).
    """
    res = calculate_month_to_date_guard_pay(
        monthly_salary=18000.0,
        days_worked=24,
        off_days_taken=4,
        period_start=date(2026, 2, 1),
        period_end=date(2026, 2, 28),
        as_of_date=date(2026, 2, 28),
    )

    assert res["elapsed_calendar_days"] == 28
    assert res["total_payable_days"] == 28
    assert res["accrued_amount"] == pytest.approx(18000.00, 0.01)


def test_last_day_of_31_day_month():
    """
    Scenario 6: Last day of a 31-day month (October).
    Guard worked 27 days + 4 off-days = 31 days.
    Proration factor is 1.0 (100% full salary).
    """
    res = calculate_month_to_date_guard_pay(
        monthly_salary=20000.0,
        days_worked=27,
        off_days_taken=4,
        period_start=date(2026, 10, 1),
        period_end=date(2026, 10, 31),
        as_of_date=date(2026, 10, 31),
    )

    assert res["elapsed_calendar_days"] == 31
    assert res["total_payable_days"] == 31
    assert res["accrued_amount"] == pytest.approx(20000.00, 0.01)


def test_implicit_offday_calculation():
    """
    Scenario 7: Implicit off-day deduction formula.
    Daily Rate = Monthly Salary / (Total Days in Month - 4)
    Accrued Pay = Daily Rate * Days Worked
    For 30 days, expected working days = 30 - 4 = 26.
    Salary = 26,000 -> Daily Rate = 1,000.00.
    Worked 16 days -> 16,000.00.
    """
    res = calculate_month_to_date_guard_pay(
        monthly_salary=26000.0,
        days_worked=16,
        off_days_taken=0,
        has_explicit_off_days=False,
        period_start=date(2026, 11, 1),
        period_end=date(2026, 11, 30),
        as_of_date=date(2026, 11, 20),
    )

    assert res["daily_rate"] == pytest.approx(1000.00, 0.01)
    assert res["accrued_amount"] == pytest.approx(16000.00, 0.01)
    assert res["calculation_method"] == "IMPLICIT_WORKING_DAYS"


def test_reconciliation_month_to_date_attributes(db):
    """
    Scenario 8: Integration test verifying build_payment_schedules_and_reconciliation
    attaches MTD indicators and billing period to response data.
    """
    # Create test period
    period = PayrollPeriod(
        period_name="November 2026",
        year=2026,
        month=11,
        start_date=date(2026, 11, 1),
        end_date=date(2026, 11, 30),
        status="CALCULATED",
    )
    db.add(period)
    db.commit()

    import uuid
    uid = uuid.uuid4().hex[:6]
    # Create test guard
    guard = Guard(
        full_name="John Kamau MTD",
        employee_number=f"CS-MTD-{uid}",
        national_id=f"ID-MTD-{uid}",
        phone=f"07{uid[:8].zfill(8)}",
        hire_date=date(2025, 1, 1),
        payment_method="Bank Transfer",
        bank_name="KCB Bank",
        bank_account=f"ACC-{uid}",
        basic_salary=15000.0,
        status="ACTIVE",
    )
    db.add(guard)
    db.commit()

    # Create payroll record with MTD data
    record = PayrollRecord(
        payroll_period_id=period.id,
        guard_id=guard.id,
        basic_pay=15000.0,
        gross_pay=15000.0,
        net_pay=10000.0,
        days_worked=16,
        off_days_taken=4,
        off_days_remaining=0,
        total_payable_days=20,
        accrued_payable=10000.0,
        calculation_cutoff_date=date(2026, 11, 20),
        is_on_hold=False,
    )
    db.add(record)
    db.commit()

    recon = build_payment_schedules_and_reconciliation(
        db,
        period.id,
        as_of_date=date(2026, 11, 20)
    )

    assert "billing_period" in recon
    assert "is_month_to_date" in recon
    assert "elapsed_calendar_days" in recon
    assert recon["is_month_to_date"] is True
    assert recon["billing_period"] == "1st Nov – 20th Nov 2026"

    # Check bank items
    assert len(recon["bank_items"]) == 1
    bank_item = recon["bank_items"][0]
    assert bank_item["guard_name"] == "John Kamau MTD"
    assert bank_item["days_worked"] == 16
    assert bank_item["off_days_used"] == 4
    assert bank_item["off_days_remaining"] == 0
    assert bank_item["total_payable_days"] == 20
    assert bank_item["accrued_amount"] == 10000.0
    assert bank_item["billing_period"] == "1st Nov – 20th Nov 2026"
