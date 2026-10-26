import os
import pytest
from datetime import date
from application.backend.app.services.payroll_engine import (
    calculate_nssf,
    calculate_shif,
    calculate_housing_levy,
    calculate_paye,
    calculate_guard_payroll,
)


def get_admin_headers(client):
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@corpsec.co.ke", "password": os.getenv("ADMIN_INITIAL_PASSWORD", "TestAdminSecretPass123!")}
    )
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_nssf_calculation():
    # Tier I (540) + Tier II (360) = 900
    assert calculate_nssf(15000.0) == 900.0
    # Tier I (540) + Tier II (2,460) = 3,000
    assert calculate_nssf(50000.0) == 3000.0
    # High salary capped at Tier II max (9k @ 6% + 99k @ 6% = 6,480)
    assert calculate_nssf(120000.0) == 6480.0


def test_shif_floor_and_rate():
    # Low salary KES 5,000 -> 2.75% = 137.50 -> gets KES 300 floor
    assert calculate_shif(5000.0) == 300.0
    # KES 10,000 -> 2.75% = 275.00 -> gets KES 300 floor
    assert calculate_shif(10000.0) == 300.0
    # KES 20,000 -> 2.75% = 550.00
    assert calculate_shif(20000.0) == 550.0


def test_housing_levy_calculation():
    # 1.5% of 18,300 = 274.50
    assert calculate_housing_levy(18300.0) == 274.50


def test_paye_progressive_bands():
    # Taxable pay KES 20,000 (Band 1 10% = 2,000 - 2,400 relief) -> 0.0
    assert calculate_paye(20000.0) == 0.0

    # Taxable pay KES 30,000:
    # Band 1: 24,000 @ 10% = 2,400
    # Band 2: 6,000 @ 25% = 1,500
    # Total tax = 3,900 - 2,400 relief = 1,500.0
    assert calculate_paye(30000.0) == 1500.0


def test_paye_breakdown_details():
    from application.backend.app.services.payroll_engine import calculate_paye_details

    # 1. Single band below relief (Taxable KES 14,100)
    b1 = calculate_paye_details(14100.0)
    assert b1["taxable_income"] == 14100.0
    assert b1["tax_before_relief"] == 1410.0
    assert b1["personal_relief_applied"] == 1410.0  # Capped at tax_before_relief
    assert b1["final_paye"] == 0.0
    assert "10%" in b1["which_band"]
    assert len(b1["bands_applied"]) == 1

    # 2. Multi-band high income (Taxable KES 47,000 -> touches 10%, 25%, 30%)
    b2 = calculate_paye_details(47000.0)
    assert b2["taxable_income"] == 47000.0
    # Band 1: 2,400, Band 2: 2,083.25, Band 3: 4,400.10 -> Sum = 8,883.35
    assert b2["tax_before_relief"] == 8883.35
    assert b2["personal_relief_applied"] == 2400.0
    assert b2["final_paye"] == 6483.35
    assert "10%" in b2["which_band"] and "25%" in b2["which_band"] and "30%" in b2["which_band"]
    assert len(b2["bands_applied"]) == 3


def test_guard_payroll_full_calculation():
    # Daily rate KES 1,350 -> Hourly rate = KES 168.75
    # Regular 160h, Overtime 20h (@ 1.5x = 253.125/h)
    # Basic = 160 * 168.75 = 27,000
    # OT Pay = 20 * 253.125 = 5,062.50
    calc = calculate_guard_payroll(
        daily_rate=1350.0,
        regular_hours=160.0,
        overtime_hours=20.0,
        night_shifts_count=10,
        night_allowance_rate=200.0
    )

    assert calc["basic_pay"] == 27000.0
    assert calc["overtime_pay"] == 5062.50
    assert calc["allowances"] == 2000.0  # 10 night shifts * 200
    assert calc["gross_pay"] == 34062.50
    assert calc["nssf_deduction"] == 2043.75  # 6% of 34062.50
    assert calc["shif_deduction"] == 936.72   # 2.75% of 34062.50
    assert calc["housing_levy_deduction"] == 510.94  # 1.5% of 34062.50
    assert calc["net_pay"] > 0.0
    assert calc["net_pay"] < calc["gross_pay"]


def test_zero_hours_calculation():
    calc = calculate_guard_payroll(daily_rate=1350.0, regular_hours=0.0, overtime_hours=0.0)
    assert calc["gross_pay"] == 0.0
    assert calc["net_pay"] == 0.0
    assert calc["shif_deduction"] == 0.0


def test_calculate_payroll_api(client, db):
    headers = get_admin_headers(client)

    # 1. Create Period
    period_resp = client.post(
        "/api/v1/payroll/periods",
        json={
            "year": 2026,
            "month": 8,
            "period_name": "August 2026",
            "start_date": "2026-08-01",
            "end_date": "2026-08-31"
        },
        headers=headers
    )
    assert period_resp.status_code == 201
    period_id = period_resp.json()["id"]

    # 2. Trigger Guided Calculation
    calc_resp = client.post(f"/api/v1/payroll/{period_id}/calculate", headers=headers)
    assert calc_resp.status_code == 200
    summary = calc_resp.json()
    assert summary["total_employees"] >= 4
    assert summary["status"] == "CALCULATED"

    # 3. Fetch Records Table
    records_resp = client.get(f"/api/v1/payroll/{period_id}/records", headers=headers)
    assert records_resp.status_code == 200
    records = records_resp.json()
    assert len(records) >= 4

    # 4. Fetch Errors Table
    errors_resp = client.get(f"/api/v1/payroll/{period_id}/errors", headers=headers)
    assert errors_resp.status_code == 200
