import pytest
import os
from datetime import date
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from application.backend.app.models.guard import Guard
from application.backend.app.models.asset import Asset, AssetCategory, AssetAllocation, InventoryItem, InventoryTransaction


def get_admin_headers(client: TestClient) -> dict:
    pwd = os.getenv("ADMIN_INITIAL_PASSWORD", "TestAdminSecretPass123!")
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@corpsec.co.ke", "password": pwd}
    )
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    token = login_res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_asset_and_inventory_item_return_endpoints(client: TestClient, db: Session):
    """Test that items issued to guards can be marked returned via backend endpoints."""
    headers = get_admin_headers(client)

    # 1. Setup Category, Asset, InventoryItem & Guard
    cat = db.query(AssetCategory).first()
    if not cat:
        cat = AssetCategory(name="Security Gear", code="SEC", description="Security equipment")
        db.add(cat)
        db.commit()

    guard = Guard(
        employee_number="CS-RET01",
        full_name="Return Test Guard",
        national_id="88990011",
        phone="0788990011",
        hire_date=date(2026, 1, 1),
        basic_salary=15000.0
    )
    db.add(guard)
    db.commit()

    asset = Asset(
        asset_tag="SEC-RET-001",
        name="VHF Two-Way Radio Handset",
        category_id=cat.id,
        purchase_date=date(2026, 1, 1),
        purchase_cost=8500.0,
        status="IN_USE",
        condition="GOOD"
    )
    inv_item = InventoryItem(
        item_code="UNI-BOOT-01",
        item_name="Tactical Combat Boots",
        category="UNIFORM",
        current_stock=10,
        unit_of_measure="PAIR",
        unit_cost=2500.0
    )
    db.add_all([asset, inv_item])
    db.commit()

    # 2. Allocate asset to guard
    alloc = AssetAllocation(
        asset_id=asset.id,
        guard_id=guard.id,
        allocation_type="GUARD",
        allocated_date=date(2026, 11, 1),
        condition_on_allocation="EXCELLENT",
        status="ACTIVE"
    )
    db.add(alloc)
    db.commit()

    # Issue inventory to guard
    issue_tx = InventoryTransaction(
        item_id=inv_item.id,
        transaction_type="ISSUED",
        quantity=1,
        issued_to_guard_id=guard.id,
        reference_no="ISSUE-001",
        reason_notes="Standard guard uniform issue"
    )
    db.add(issue_tx)
    inv_item.current_stock -= 1
    db.commit()

    # 3. Mark asset returned
    ret_asset_res = client.post(
        f"/api/v1/assets/allocations/{alloc.id}/return",
        json={
            "return_date": "2026-11-05",
            "condition_on_return": "GOOD",
            "notes": "Handed over in complete working condition"
        },
        headers=headers
    )
    assert ret_asset_res.status_code == 200, ret_asset_res.text
    ret_asset_data = ret_asset_res.json()
    assert ret_asset_data["status"] == "RETURNED"
    assert ret_asset_data["return_date"] == "2026-11-05"

    db.refresh(asset)
    assert asset.status == "AVAILABLE"

    # 4. Mark inventory item returned to stock
    ret_inv_res = client.post(
        "/api/v1/assets/inventory/transactions",
        json={
            "item_id": inv_item.id,
            "transaction_type": "RETURNED",
            "quantity": 1,
            "guard_id": guard.id,
            "reference_no": "RET-20261105",
            "reason_notes": "Surrendered upon site rotation [Condition: GOOD]"
        },
        headers=headers
    )
    assert ret_inv_res.status_code in [200, 201], ret_inv_res.text
    ret_inv_data = ret_inv_res.json()
    assert ret_inv_data["transaction_type"] == "RETURNED"

    db.refresh(inv_item)
    assert inv_item.current_stock == 10  # Stock replenished!


def test_guard_file_item_return_ui_elements_and_js(client: TestClient):
    """Verify that the guard file has the item return section and JavaScript handlers."""
    res_index = client.get("/")
    assert res_index.status_code == 200
    html = res_index.text

    assert 'id="modal-return-custody-item"' in html
    assert 'id="return-custody-select-container"' in html
    assert 'id="return-custody-item-select"' in html
    assert 'id="return-custody-info-box"' in html
    assert 'id="return-custody-condition"' in html

    res_js = client.get("/static/js/app.js")
    assert res_js.status_code == 200
    js = res_js.text

    assert "Issued Equipment, Uniforms & Item Returns Log" in js
    assert "openQuickReturnItemModal" in js
    assert "onReturnItemSelectChange" in js
    assert "openReturnCustodyModal" in js
    assert "handleReturnCustodySubmit" in js
    assert "🔄 Mark Item as Returned" in js
    assert "🔄 Mark as Returned" in js
    assert "RETURNED TO STORES" in js

