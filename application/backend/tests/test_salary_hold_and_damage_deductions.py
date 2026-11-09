import io
import openpyxl
import pytest
from datetime import date
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.shift import Shift
from application.backend.app.models.asset import AssetCategory, Asset, AssetAllocation, AssetDamageDeduction
from application.backend.app.models.payroll import PayrollPeriod, PayrollRecord
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


def test_property_damage_deduction_and_payroll_integration(client: TestClient, db: Session):
    headers = get_admin_headers(client)

    # 1. Use seeded guard
    guard = db.query(Guard).filter(Guard.employee_number == "CS-00452").first()
    assert guard is not None

    # 2. Record manual property damage deduction via POST /api/v1/assets/damage-deductions
    create_payload = {
        "guard_id": guard.id,
        "item_name": "Torn Combat Uniform & Broken Belt",
        "damage_description": "Uniform returned severely torn beyond repair",
        "deduction_amount": 1200.0,
        "incident_date": str(date.today()),
        "notes": "Assessed at stores checkout"
    }
    create_res = client.post("/api/v1/assets/damage-deductions", json=create_payload, headers=headers)
    assert create_res.status_code == 201, create_res.text
    ded_data = create_res.json()
    ded_id = ded_data["id"]
    assert ded_data["deduction_amount"] == 1200.0
    assert ded_data["status"] == "PENDING"

    # 3. List damage deductions
    list_res = client.get(f"/api/v1/assets/damage-deductions?guard_id={guard.id}", headers=headers)
    assert list_res.status_code == 200
    items = list_res.json()
    assert any(i["id"] == ded_id for i in items)

    # 4. Create Draft Payroll Period & Execute Payroll Calculation
    period_res = client.post(
        "/api/v1/payroll/periods",
        json={"month": 11, "year": 2026, "period_name": "November 2026", "start_date": "2026-11-01", "end_date": "2026-11-30"},
        headers=headers
    )
    assert period_res.status_code in [200, 201], period_res.text
    period_id = period_res.json()["id"]

    calc_res = client.post(f"/api/v1/payroll/{period_id}/calculate", headers=headers)
    assert calc_res.status_code == 200, calc_res.text

    # 5. Verify the damage deduction is reflected on the PayrollRecord and status updated to DEDUCTED
    records_res = client.get(f"/api/v1/payroll/{period_id}/records", headers=headers)
    assert records_res.status_code == 200
    records = records_res.json()
    guard_rec = next((r for r in records if r["guard_id"] == guard.id), None)
    assert guard_rec is not None, "Guard record should be in payroll records"

    # Verify damage deduction was subtracted
    assert guard_rec["damage_deduction"] == 1200.0

    # Verify AssetDamageDeduction is now DEDUCTED
    ded_in_db = db.query(AssetDamageDeduction).filter(AssetDamageDeduction.id == ded_id).first()
    assert ded_in_db.status == "DEDUCTED"


def test_asset_return_auto_damage_deduction(client: TestClient, db: Session):
    headers = get_admin_headers(client)

    guard = db.query(Guard).filter(Guard.employee_number == "CS-00452").first()
    assert guard is not None

    # Create or get category
    cat = db.query(AssetCategory).first()
    if not cat:
        cat = AssetCategory(name="Communications", code="COMM", description="Radios & Phones")
        db.add(cat)
        db.commit()

    # Create Asset
    asset = Asset(
        name="Motorola Walkie Talkie CP200",
        asset_tag="ASSET-WT-9988",
        category_id=cat.id,
        serial_number="SN-MOT-9988",
        purchase_date=date(2025, 1, 15),
        status="ALLOCATED",
        assigned_to_employee_id=guard.id
    )
    db.add(asset)
    db.commit()

    alloc = AssetAllocation(
        asset_id=asset.id,
        guard_id=guard.id,
        allocated_date=date.today(),
        condition_on_allocation="EXCELLENT",
        status="ACTIVE"
    )
    db.add(alloc)
    db.commit()

    # Return asset damaged with a penalty amount
    return_payload = {
        "return_date": str(date.today()),
        "condition_on_return": "DAMAGED",
        "notes": "Casing cracked and antenna snapped",
        "damage_deduction_amount": 2500.0,
        "damage_description": "Cracked casing and broken antenna"
    }
    ret_res = client.post(f"/api/v1/assets/allocations/{alloc.id}/return", json=return_payload, headers=headers)
    assert ret_res.status_code == 200, ret_res.text
    ret_data = ret_res.json()
    assert ret_data["status"] == "RETURNED"

    # Verify automatic damage deduction created
    ded = db.query(AssetDamageDeduction).filter(
        AssetDamageDeduction.allocation_id == alloc.id
    ).first()
    assert ded is not None
    assert ded.deduction_amount == 2500.0
    assert ded.status == "PENDING"
    assert "Cracked casing" in ded.damage_description


def test_salary_hold_and_excel_exclusion(client: TestClient, db: Session):
    headers = get_admin_headers(client)

    # 1. Create Draft Payroll Period & Execute Calculation
    period_res = client.post(
        "/api/v1/payroll/periods",
        json={"month": 11, "year": 2026, "period_name": "November 2026", "start_date": "2026-11-01", "end_date": "2026-11-30"},
        headers=headers
    )
    assert period_res.status_code in [200, 201]
    period_id = period_res.json()["id"]

    calc_res = client.post(f"/api/v1/payroll/{period_id}/calculate", headers=headers)
    assert calc_res.status_code == 200

    # Retrieve payroll records
    records_res = client.get(f"/api/v1/payroll/{period_id}/records", headers=headers)
    records = records_res.json()
    assert len(records) > 0

    target_rec = records[0]
    rec_id = target_rec["id"]
    guard_emp = target_rec["employee_number"]

    # 2. Place salary on hold with mandatory reason
    hold_payload = {
        "reason": "Pending property damage reconciliation and missing uniform return",
        "notes": "Hold placed by HR Manager"
    }
    hold_res = client.post(f"/api/v1/payments/records/{rec_id}/hold", json=hold_payload, headers=headers)
    assert hold_res.status_code == 200, hold_res.text
    h_data = hold_res.json()
    assert h_data["is_on_hold"] is True
    assert "missing uniform" in h_data["hold_reason"]

    # 3. Check reconciliation: record must be in held_items and NOT in bank/mpesa
    recon_res = client.get(f"/api/v1/payments/reconciliation/{period_id}", headers=headers)
    assert recon_res.status_code == 200
    recon = recon_res.json()

    assert recon["held_records_count"] >= 1
    assert recon["total_held_amount"] > 0
    held_ids = [h["payroll_record_id"] for h in recon["held_items"]]
    assert rec_id in held_ids

    bank_ids = [b["payroll_record_id"] for b in recon["bank_items"]]
    mpesa_ids = [m["payroll_record_id"] for m in recon["mpesa_items"]]
    assert rec_id not in bank_ids, "Held record MUST NOT be in bank_items"
    assert rec_id not in mpesa_ids, "Held record MUST NOT be in mpesa_items"

    # Financial reconciliation equation must hold: Total = Bank + Mpesa + Held + Unrouted
    expected_sum = recon["total_bank_amount"] + recon["total_mpesa_amount"] + recon["total_held_amount"] + recon["total_unrouted_amount"]
    assert abs(recon["total_payroll_net_pay"] - expected_sum) < 0.05
    assert recon["is_reconciled"] is True

    # 4. Export Bank Excel schedule & verify held employee is NOT present
    bank_export_res = client.get(f"/api/v1/payments/bank/{period_id}/export-excel", headers=headers)
    assert bank_export_res.status_code == 200
    wb = openpyxl.load_workbook(io.BytesIO(bank_export_res.content))
    ws = wb.active
    all_rows = list(ws.iter_rows(values_only=True))

    for row in all_rows:
        row_str = " ".join(str(c) for c in row if c is not None)
        assert guard_emp not in row_str, f"Held employee {guard_emp} MUST NOT be in Bank Excel export!"

    # 5. Release Hold
    release_payload = {
        "resolution_notes": "Employee returned missing belongings and damage fee resolved. Released for payment."
    }
    release_res = client.post(f"/api/v1/payments/records/{rec_id}/release", json=release_payload, headers=headers)
    assert release_res.status_code == 200, release_res.text
    r_data = release_res.json()
    assert r_data["is_on_hold"] is False

    # 6. Verify employee is restored to active disbursement schedules
    recon_res2 = client.get(f"/api/v1/payments/reconciliation/{period_id}", headers=headers)
    recon2 = recon_res2.json()
    held_ids2 = [h["payroll_record_id"] for h in recon2["held_items"]]
    assert rec_id not in held_ids2, "Released record should no longer be in held_items"


def test_waive_property_damage_deduction(client: TestClient, db: Session):
    headers = get_admin_headers(client)

    guard = db.query(Guard).filter(Guard.employee_number == "CS-00452").first()
    assert guard is not None

    # Create deduction
    create_res = client.post("/api/v1/assets/damage-deductions", json={
        "guard_id": guard.id,
        "item_name": "Accidentally cracked phone holder",
        "damage_description": "Holder cracked while on duty",
        "deduction_amount": 350.0,
        "incident_date": str(date.today())
    }, headers=headers)
    assert create_res.status_code == 201
    ded_id = create_res.json()["id"]

    # Waive deduction
    waive_res = client.post(f"/api/v1/assets/damage-deductions/{ded_id}/waive", headers=headers)
    assert waive_res.status_code == 200
    assert waive_res.json()["status"] == "WAIVED"

    # Check status
    ded = db.query(AssetDamageDeduction).filter(AssetDamageDeduction.id == ded_id).first()
    assert ded.status == "WAIVED"
