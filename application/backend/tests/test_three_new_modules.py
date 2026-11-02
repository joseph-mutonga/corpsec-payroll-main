import pytest
from datetime import date, timedelta
from application.backend.app.core.security import create_access_token, get_password_hash
from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.asset import AssetCategory, Asset, InventoryItem
from application.backend.app.models.client_contract import Client, ClientContract


def get_or_create_user(db, email: str, role: UserRole, full_name: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            email=email,
            phone=f"+25470000{abs(hash(email)) % 10000:04d}",
            password_hash=get_password_hash("TestPass123!"),
            full_name=full_name,
            role=role.value,
            status=UserStatus.ACTIVE.value
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def test_three_modules_rbac(client, db):
    admin = get_or_create_user(db, "admin@corpsec.co.ke", UserRole.ADMIN, "System Administrator")
    hr = get_or_create_user(db, "hr@corpsec.co.ke", UserRole.HR, "HR Manager")
    sup = get_or_create_user(db, "supervisor@corpsec.co.ke", UserRole.SUPERVISOR, "Field Supervisor")

    admin_token = create_access_token(data={"sub": str(admin.id)})
    hr_token = create_access_token(data={"sub": str(hr.id)})
    sup_token = create_access_token(data={"sub": str(sup.id)})

    # Test Assets Router
    res_adm = client.get("/api/v1/assets/", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_adm.status_code == 200

    res_hr = client.get("/api/v1/assets/", headers={"Authorization": f"Bearer {hr_token}"})
    assert res_hr.status_code == 200

    res_sup = client.get("/api/v1/assets/", headers={"Authorization": f"Bearer {sup_token}"})
    assert res_sup.status_code == 403

    # Test Clients Router
    res_adm = client.get("/api/v1/clients/", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_adm.status_code == 200

    res_hr = client.get("/api/v1/clients/", headers={"Authorization": f"Bearer {hr_token}"})
    assert res_hr.status_code == 200

    res_sup = client.get("/api/v1/clients/", headers={"Authorization": f"Bearer {sup_token}"})
    assert res_sup.status_code == 403

    # Test Company History Router
    res_adm = client.get("/api/v1/company/profile", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_adm.status_code == 200

    res_hr = client.get("/api/v1/company/profile", headers={"Authorization": f"Bearer {hr_token}"})
    assert res_hr.status_code == 200

    res_sup = client.get("/api/v1/company/profile", headers={"Authorization": f"Bearer {sup_token}"})
    assert res_sup.status_code == 403


def test_assets_lifecycle_and_depreciation(client, db):
    admin = get_or_create_user(db, "admin@corpsec.co.ke", UserRole.ADMIN, "System Administrator")
    admin_token = create_access_token(data={"sub": str(admin.id)})
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Categories
    cat_res = client.get("/api/v1/assets/categories", headers=headers)
    assert cat_res.status_code == 200
    categories = cat_res.json()
    if not categories:
        # Create category
        create_cat = client.post("/api/v1/assets/categories", headers=headers, json={"name": "Tactical Vehicles", "code": "VEH"})
        assert create_cat.status_code in [200, 201]
        cat_id = create_cat.json()["id"]
    else:
        cat_id = categories[0]["id"]

    # 2. Register Asset with Depreciation
    asset_payload = {
        "asset_code": "AST-PATROL-99",
        "name": "Rapid Response Cruiser",
        "category_id": cat_id,
        "serial_number": "VIN-99887766",
        "make": "Toyota",
        "model": "Land Cruiser 79",
        "purchase_date": str(date.today()),
        "purchase_price": 5000000.00,
        "salvage_value": 500000.00,
        "useful_life_months": 60,
        "depreciation_method": "STRAIGHT_LINE",
        "depreciation_rate": 20.0,
        "condition": "EXCELLENT",
        "current_location": "Nairobi Central Command"
    }

    create_ast = client.post("/api/v1/assets/", headers=headers, json=asset_payload)
    assert create_ast.status_code in [200, 201]
    asset_data = create_ast.json()
    asset_id = asset_data["id"]
    assert asset_data["asset_code"] == "AST-PATROL-99"
    assert asset_data["status"] in ["AVAILABLE", "IN_STOCK"]
    assert float(asset_data["current_value"]) == 5000000.00

    # 3. Allocate Asset to Guard
    guard = db.query(Guard).first()
    alloc_payload = {
        "asset_id": asset_id,
        "allocation_type": "EMPLOYEE",
        "guard_id": guard.id if guard else None,
        "allocated_date": str(date.today()),
        "condition_at_handover": "EXCELLENT",
        "notes": "Handover to team leader with full patrol equipment"
    }
    alloc_res = client.post("/api/v1/assets/allocations", headers=headers, json=alloc_payload)
    assert alloc_res.status_code == 200

    # Verify asset is now ASSIGNED
    get_ast = client.get(f"/api/v1/assets/{asset_id}", headers=headers)
    assert get_ast.status_code == 200
    assert get_ast.json()["status"] in ["ALLOCATED", "ASSIGNED"]

    # 4. Return Asset
    ret_payload = {
        "return_date": str(date.today()),
        "condition_at_return": "GOOD",
        "return_notes": "Returned clean, full fuel tank"
    }
    ret_res = client.post(f"/api/v1/assets/{asset_id}/return", headers=headers, json=ret_payload)
    assert ret_res.status_code == 200
    assert ret_res.json()["status"] == "RETURNED"
    check_ast = client.get(f"/api/v1/assets/{asset_id}", headers=headers)
    assert check_ast.json()["status"] in ["AVAILABLE", "IN_STOCK"]
    assert ret_res.json()["condition"] == "GOOD"

    # 5. Log Maintenance
    maint_payload = {
        "asset_id": asset_id,
        "maintenance_type": "PREVENTATIVE",
        "maintenance_date": str(date.today()),
        "service_provider": "Toyota Kenya Ltd",
        "cost": 45000.00,
        "next_maintenance_date": str(date.today()),
        "description": "5,000km scheduled service: synthetic engine oil, oil filter, air filter check.",
        "invoice_or_receipt_no": "INV-TK-8899",
        "status": "COMPLETED"
    }
    maint_res = client.post("/api/v1/assets/maintenance", headers=headers, json=maint_payload)
    assert maint_res.status_code == 200
    assert maint_res.json()["cost"] == 45000.00


def test_inventory_and_stock_movements(client, db):
    admin = get_or_create_user(db, "admin@corpsec.co.ke", UserRole.ADMIN, "System Administrator")
    admin_token = create_access_token(data={"sub": str(admin.id)})
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Create Consumable Item
    item_payload = {
        "item_code": "TACT-TORCH-LED",
        "item_name": "Rechargeable High-Lumen Tactical Flashlight",
        "category": "TACTICAL",
        "unit_of_measure": "Pcs",
        "unit_cost": 2500.00,
        "current_stock": 20,
        "min_stock_level": 5,
        "reorder_quantity": 15,
        "storage_location": "Armoury Bay C"
    }
    create_res = client.post("/api/v1/assets/inventory", headers=headers, json=item_payload)
    assert create_res.status_code in [200, 201]
    item_data = create_res.json()
    item_id = item_data["id"]
    assert item_data["current_stock"] == 20
    assert item_data["total_valuation"] == 50000.00

    # 2. Stock Intake (STOCK_IN)
    stock_in_payload = {
        "item_id": item_id,
        "transaction_type": "STOCK_IN",
        "quantity": 10,
        "unit_cost": 2500.00,
        "reference_number": "PO-2026-0044",
        "notes": "Direct batch intake from supplier"
    }
    tx_in_res = client.post("/api/v1/assets/inventory/transactions", headers=headers, json=stock_in_payload)
    assert tx_in_res.status_code == 200
    assert tx_in_res.json()["current_stock"] == 30

    # 3. Stock Out (STOCK_OUT)
    guard = db.query(Guard).first()
    stock_out_payload = {
        "item_id": item_id,
        "transaction_type": "STOCK_OUT",
        "quantity": 5,
        "guard_id": guard.id if guard else None,
        "reference_number": "REQ-7788",
        "notes": "Issued to night patrol shift"
    }
    tx_out_res = client.post("/api/v1/assets/inventory/transactions", headers=headers, json=stock_out_payload)
    assert tx_out_res.status_code == 200
    assert tx_out_res.json()["current_stock"] == 25

    # 4. Stock Out with Insufficient Stock should fail with 400
    excessive_out = {
        "item_id": item_id,
        "transaction_type": "STOCK_OUT",
        "quantity": 100,
        "notes": "Attempting to take more than available"
    }
    fail_res = client.post("/api/v1/assets/inventory/transactions", headers=headers, json=excessive_out)
    assert fail_res.status_code == 400
    assert "Insufficient stock" in fail_res.json()["detail"]


def test_client_and_contract_management_with_renewal(client, db):
    admin = get_or_create_user(db, "admin@corpsec.co.ke", UserRole.ADMIN, "System Administrator")
    admin_token = create_access_token(data={"sub": str(admin.id)})
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Register Client
    client_payload = {
        "name": "Standard Chartered Bank Kenya PLC",
        "client_type": "CORPORATE",
        "industry": "Banking & Financial Services",
        "tax_pin": "P051122334Z",
        "physical_address": "48 Westlands Rd, Standard Chartered HQ",
        "city": "Nairobi",
        "primary_contact_name": "Mark Kariuki",
        "primary_contact_designation": "Head of Corporate Security",
        "primary_contact_phone": "+254711998877",
        "primary_contact_email": "mark.kariuki@sc.com",
        "notes": "VIP corporate account with high-security armed guard requirements"
    }
    client_res = client.post("/api/v1/clients/", headers=headers, json=client_payload)
    assert client_res.status_code in [200, 201]
    c_data = client_res.json()
    client_id = c_data["id"]
    assert c_data["client_code"].startswith("CLT-")
    assert c_data["name"] == "Standard Chartered Bank Kenya PLC"

    # 2. Create Initial Contract (v1)
    ctr_payload = {
        "client_id": client_id,
        "contract_reference": "CTR-SCB-2026-01",
        "title": "Headquarters 24/7 Security & Rapid Response SLA",
        "contract_type": "ANNUAL",
        "start_date": "2026-01-01",
        "end_date": "2026-12-31",
        "total_contract_value": 7200000.00,
        "monthly_service_charge": 600000.00,
        "billing_frequency": "MONTHLY",
        "guards_required": 8,
        "payment_terms": "Net 30 Days",
        "special_terms_and_conditions": "Guards must have valid PSRA licenses and first-aid certification"
    }
    ctr_res = client.post("/api/v1/clients/contracts", headers=headers, json=ctr_payload)
    assert ctr_res.status_code in [200, 201]
    ctr_data = ctr_res.json()
    contract_id = ctr_data["id"]
    assert ctr_data["version"] == 1
    assert ctr_data["status"] == "ACTIVE"

    # 3. Renew Contract (Preserves History)
    renew_payload = {
        "new_start_date": "2027-01-01",
        "new_end_date": "2027-12-31",
        "new_monthly_charge": 650000.00,
        "new_total_value": 7800000.00,
        "guards_required": 10,
        "payment_terms": "Net 30 Days",
        "special_terms_and_conditions": "Annual renewal with 2 additional perimeter night guards"
    }
    renew_res = client.post(f"/api/v1/clients/contracts/{contract_id}/renew", headers=headers, json=renew_payload)
    assert renew_res.status_code == 200
    v2_data = renew_res.json()
    assert v2_data["version"] == 2
    assert v2_data["previous_contract_id"] == contract_id
    assert v2_data["monthly_service_charge"] == 650000.00

    # Verify old contract v1 is now RENEWED
    old_ctr = db.query(ClientContract).filter(ClientContract.id == contract_id).first()
    assert old_ctr.status == "RENEWED"

    # 4. View Client Profile Hub
    profile_res = client.get(f"/api/v1/clients/{client_id}/profile", headers=headers)
    assert profile_res.status_code == 200
    prof = profile_res.json()
    assert prof["client"]["id"] == client_id
    assert len(prof["contracts"]) == 2  # Both v1 (RENEWED) and v2 (ACTIVE) are preserved


def test_company_profile_history_and_analytics(client, db):
    admin = get_or_create_user(db, "admin@corpsec.co.ke", UserRole.ADMIN, "System Administrator")
    admin_token = create_access_token(data={"sub": str(admin.id)})
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Company Profile Get & Update
    get_prof = client.get("/api/v1/company/profile", headers=headers)
    assert get_prof.status_code == 200
    prof_data = get_prof.json()

    update_payload = {
        "company_name": "CORPSEC SECURITY SERVICES LIMITED",
        "trading_brand_name": "CorpSec Kenya Elite Protection",
        "psra_license_number": "PSRA/2026/A-0042",
        "registration_number": "CPR/2018/887766",
        "tax_pin": "P051234567X",
        "primary_email": "operations@corpsec.co.ke",
        "primary_phone": "+254 700 123 456",
        "website": "https://www.corpsec.co.ke",
        "headquarters_address": "Upper Hill Cathedral Rd, Nairobi",
        "mission_statement": "To provide uncompromising security, safety and peace of mind.",
        "vision_statement": "To be East Africa's most technologically advanced and dependable security partner.",
        "core_values": "Integrity, Vigilance, Professionalism, Accountability"
    }
    put_prof = client.put("/api/v1/company/profile", headers=headers, json=update_payload)
    assert put_prof.status_code == 200
    assert put_prof.json()["trading_brand_name"] == "CorpSec Kenya Elite Protection"

    # 2. Founding History
    found_res = client.get("/api/v1/company/founding", headers=headers)
    assert found_res.status_code == 200
    assert found_res.json()["founding_date"] is not None

    # 3. Add Milestone
    mile_payload = {
        "title": "Establishment of Kisumu Lake Region Detachment",
        "milestone_date": "2026-05-15",
        "category": "EXPANSION",
        "location": "Kisumu City",
        "description": "Opened Western Kenya regional office to protect key logistics ports and commercial banks.",
        "significance": "Added 80 security officers and 4 rapid response vehicles"
    }
    mile_res = client.post("/api/v1/company/milestones", headers=headers, json=mile_payload)
    assert mile_res.status_code in [200, 201]
    assert mile_res.json()["title"] == "Establishment of Kisumu Lake Region Detachment"

    # Query chronological timeline
    timeline_res = client.get("/api/v1/company/milestones", headers=headers)
    assert timeline_res.status_code == 200
    milestones = timeline_res.json()
    assert len(milestones) >= 1

    # 4. Governance & Ownership Record
    own_payload = {
        "person_or_entity_name": "Dr. Beatrice Wanjiku, OGW",
        "role_title": "NON_EXEC_DIRECTOR",
        "shareholding_percentage": 15.00,
        "number_of_shares": 150000,
        "appointment_date": "2021-03-01",
        "board_resolution_ref": "BR-2021-04",
        "status": "ACTIVE"
    }
    own_res = client.post("/api/v1/company/ownership", headers=headers, json=own_payload)
    assert own_res.status_code in [200, 201]
    assert own_res.json()["shareholding_percentage"] == 15.00

    # Query ownership register
    gov_res = client.get("/api/v1/company/ownership", headers=headers)
    assert gov_res.status_code == 200
    assert len(gov_res.json()) >= 1

    # 5. Live DB Growth Analytics
    anal_res = client.get("/api/v1/company/analytics", headers=headers)
    assert anal_res.status_code == 200
    analytics = anal_res.json()
    assert "active_guards_count" in analytics
    assert "active_sites_count" in analytics
    assert "total_assets_count" in analytics
    assert "total_assets_book_value" in analytics
    assert "monthly_contract_run_rate" in analytics

def test_three_modules_full_crud_and_lifecycle(client, db):
    admin = get_or_create_user(db, "admin@corpsec.co.ke", UserRole.ADMIN, "System Administrator")
    admin_token = create_access_token(data={"sub": str(admin.id)})
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Asset CRUD
    cat_res = client.get("/api/v1/assets/categories", headers=headers)
    categories = cat_res.json()
    if not categories:
        create_cat = client.post("/api/v1/assets/categories", headers=headers, json={"name": "Tactical Vehicles", "code": "VEH"})
        assert create_cat.status_code in [200, 201]
        cat_id = create_cat.json()["id"]
    else:
        cat_id = categories[0]["id"]
    ast_res = client.post("/api/v1/assets", headers=headers, json={
        "asset_code": "AST-TEST-CRUD-01",
        "name": "Initial Asset Name",
        "category_id": cat_id,
        "purchase_date": str(date.today()),
        "purchase_price": 120000.0,
        "condition": "EXCELLENT"
    })
    assert ast_res.status_code in [200, 201]
    ast_id = ast_res.json()["id"]

    # Update Asset
    upd_ast = client.put(f"/api/v1/assets/{ast_id}", headers=headers, json={
        "name": "Updated Asset Name",
        "condition": "GOOD",
        "current_location": "Mombasa Port Depot"
    })
    assert upd_ast.status_code == 200
    assert upd_ast.json()["name"] == "Updated Asset Name"

    # Delete Asset
    del_ast = client.delete(f"/api/v1/assets/{ast_id}", headers=headers)
    assert del_ast.status_code == 200

    # 2. Inventory Item CRUD
    inv_res = client.post("/api/v1/assets/inventory", headers=headers, json={
        "item_code": "TEST-SKU-99",
        "item_name": "Test Security Baton",
        "category": "TACTICAL",
        "unit_of_measure": "Pcs",
        "unit_cost": 1500.0,
        "initial_stock": 20
    })
    assert inv_res.status_code in [200, 201]
    inv_id = inv_res.json()["id"]

    # Update Inventory Item
    upd_inv = client.put(f"/api/v1/assets/inventory/items/{inv_id}", headers=headers, json={
        "name": "Heavy Duty Expandable Security Baton",
        "unit_cost": 1800.0,
        "min_stock_level": 5
    })
    assert upd_inv.status_code == 200

    # Delete Inventory Item
    del_inv = client.delete(f"/api/v1/assets/inventory/items/{inv_id}", headers=headers)
    assert del_inv.status_code == 200

    # 3. Client CRUD
    cl_res = client.post("/api/v1/clients", headers=headers, json={
        "name": "Apex Towers Management Ltd",
        "client_type": "COMMERCIAL",
        "physical_address": "Upper Hill, Nairobi",
        "city": "Nairobi",
        "primary_contact_name": "James Omondi",
        "primary_contact_phone": "+254700112233",
        "primary_contact_email": "jomondi@apextowers.co.ke"
    })
    assert cl_res.status_code in [200, 201]
    cl_id = cl_res.json()["id"]

    # Update Client
    upd_cl = client.put(f"/api/v1/clients/{cl_id}", headers=headers, json={
        "name": "Apex Commercial Towers PLC",
        "status": "ACTIVE",
        "primary_contact_phone": "+254722334455"
    })
    assert upd_cl.status_code == 200
    assert upd_cl.json()["name"] == "Apex Commercial Towers PLC"

    # 4. Contract CRUD
    ctr_res = client.post("/api/v1/clients/contracts", headers=headers, json={
        "client_id": cl_id,
        "contract_reference": "CTR-APEX-2026-01",
        "title": "Apex Commercial Manned Guarding SLA",
        "start_date": str(date.today()),
        "end_date": str(date.today() + timedelta(days=365)),
        "monthly_service_charge": 150000.0,
        "total_contract_value": 1800000.0,
        "guards_required": 4
    })
    assert ctr_res.status_code in [200, 201]
    ctr_id = ctr_res.json()["id"]

    # Update Contract
    upd_ctr = client.put(f"/api/v1/clients/contracts/{ctr_id}", headers=headers, json={
        "title": "Apex Commercial 24/7 Rapid Response & Manned Guarding",
        "monthly_charge": 175000.0,
        "guards_required": 5
    })
    assert upd_ctr.status_code == 200

    # Delete Contract
    del_ctr = client.delete(f"/api/v1/clients/contracts/{ctr_id}", headers=headers)
    assert del_ctr.status_code == 200

    # Delete Client
    del_cl = client.delete(f"/api/v1/clients/{cl_id}", headers=headers)
    assert del_cl.status_code == 200

    # 5. Founding Heritage Update
    found_upd = client.put("/api/v1/company/founding", headers=headers, json={
        "founder_names": "Col. (Rtd) David Kimani & Major Sarah Wambui",
        "initial_guards_count": 25,
        "original_location": "Nairobi Industrial Area HQ",
        "background_story": "Founded in 2018 to pioneer high-tech disciplined private security operations across East Africa."
    })
    assert found_upd.status_code == 200

    # 6. Milestone Create & Delete
    m_res = client.post("/api/v1/company/milestones", headers=headers, json={
        "title": "Temporary Award Milestone",
        "milestone_date": str(date.today()),
        "category": "AWARD",
        "description": "Recognized with Top Security Service Provider Award"
    })
    assert m_res.status_code in [200, 201]
    m_id = m_res.json()["id"]

    del_m = client.delete(f"/api/v1/company/milestones/{m_id}", headers=headers)
    assert del_m.status_code == 200

    # 7. Governance Record Create & Delete
    own_res = client.post("/api/v1/company/ownership", headers=headers, json={
        "person_or_entity_name": "Temporary Director",
        "role_title": "DIRECTOR",
        "shareholding_percentage": 5.0,
        "number_of_shares": 50000,
        "appointment_date": str(date.today())
    })
    assert own_res.status_code in [200, 201]
    own_id = own_res.json()["id"]

    del_own = client.delete(f"/api/v1/company/ownership/{own_id}", headers=headers)
    assert del_own.status_code == 200


def test_personnel_custody_awards_and_returns(client, db):
    admin = get_or_create_user(db, "admin@corpsec.co.ke", UserRole.ADMIN, "System Administrator")
    admin_token = create_access_token(data={"sub": str(admin.id)})
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Ensure category exists
    cat_res = client.get("/api/v1/assets/categories", headers=headers).json()
    if not cat_res:
        c_res = client.post("/api/v1/assets/categories", headers=headers, json={"name": "Tactical Comms", "code": "COMMS"})
        cat_id = c_res.json()["id"]
    else:
        cat_id = cat_res[0]["id"]

    # Ensure guard exists
    guard = db.query(Guard).first()
    if not guard:
        guard = Guard(
            employee_number="GD-TEST-9999",
            first_name="Samson",
            last_name="Ouma",
            national_id="11223344",
            phone="+254711998877",
            status="ACTIVE"
        )
        db.add(guard)
        db.commit()
        db.refresh(guard)

    # 1. Register an asset for custody tracking
    asset_res = client.post("/api/v1/assets", headers=headers, json={
        "name": "Motorola GP340 VHF Radio",
        "category_id": cat_id,
        "purchase_date": str(date.today()),
        "purchase_cost": 30000.0,
        "serial_number": "MOT-GP340-9988",
        "condition": "EXCELLENT"
    })
    assert asset_res.status_code in [200, 201]
    asset_id = asset_res.json()["id"]

    # 2. Award / allocate asset to Guard
    alloc_guard = client.post(f"/api/v1/assets/{asset_id}/allocate", headers=headers, json={
        "asset_id": asset_id,
        "allocation_type": "EMPLOYEE",
        "guard_id": guard.id,
        "allocated_date": str(date.today()),
        "condition_on_allocation": "EXCELLENT",
        "notes": "Awarded for outstanding duty vigilance"
    })
    assert alloc_guard.status_code == 200
    alloc1_data = alloc_guard.json()
    alloc1_id = alloc1_data["id"]
    assert alloc1_data["status"] == "ACTIVE"
    assert alloc1_data["guard_id"] == guard.id

    # 3. Check Guard custody list
    guard_allocs = client.get(f"/api/v1/assets/allocations?guard_id={guard.id}", headers=headers).json()
    assert any(a["id"] == alloc1_id and a["status"] == "ACTIVE" for a in guard_allocs)

    # 4. Return item from Guard
    ret_guard = client.post(f"/api/v1/assets/allocations/{alloc1_id}/return", headers=headers, json={
        "return_date": str(date.today()),
        "condition_on_return": "GOOD",
        "notes": "Returned upon post reassignment, full inspection passed"
    })
    assert ret_guard.status_code == 200
    assert ret_guard.json()["status"] == "RETURNED"
    assert ret_guard.json()["condition_on_return"] == "GOOD"

    # Verify Guard custody list now indicates RETURNED
    guard_allocs_after = client.get(f"/api/v1/assets/allocations?guard_id={guard.id}", headers=headers).json()
    returned_record = next(a for a in guard_allocs_after if a["id"] == alloc1_id)
    assert returned_record["status"] == "RETURNED"
    assert returned_record["return_date"] == str(date.today())

    # 5. Award / allocate asset to Corporate Staff Member (User)
    alloc_staff = client.post(f"/api/v1/assets/{asset_id}/allocate", headers=headers, json={
        "asset_id": asset_id,
        "allocation_type": "STAFF",
        "staff_id": admin.id,
        "allocated_date": str(date.today()),
        "condition_on_allocation": "GOOD",
        "notes": "Issued to Operations Manager for site audit"
    })
    assert alloc_staff.status_code == 200
    alloc2_data = alloc_staff.json()
    alloc2_id = alloc2_data["id"]
    assert alloc2_data["status"] == "ACTIVE"
    assert alloc2_data["staff_id"] == admin.id

    # 6. Check Staff custody list
    staff_allocs = client.get(f"/api/v1/assets/allocations?staff_id={admin.id}", headers=headers).json()
    assert any(a["id"] == alloc2_id and a["status"] == "ACTIVE" for a in staff_allocs)

    # 7. Return item from Staff
    ret_staff = client.post(f"/api/v1/assets/allocations/{alloc2_id}/return", headers=headers, json={
        "return_date": str(date.today()),
        "condition_on_return": "GOOD",
        "notes": "Returned in store following completion of site audit"
    })
    assert ret_staff.status_code == 200
    assert ret_staff.json()["status"] == "RETURNED"

    # Verify Staff custody list now indicates RETURNED
    staff_allocs_after = client.get(f"/api/v1/assets/allocations?staff_id={admin.id}", headers=headers).json()
    staff_returned_record = next(a for a in staff_allocs_after if a["id"] == alloc2_id)
    assert staff_returned_record["status"] == "RETURNED"
