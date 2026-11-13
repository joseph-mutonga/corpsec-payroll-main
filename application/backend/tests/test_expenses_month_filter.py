import pytest
from datetime import date, timedelta
from application.backend.app.core.security import create_access_token, get_password_hash
from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.expense import Expense, PettyCashTransaction


def get_or_create_user(db, email, role, full_name):
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


def test_expenses_post_empty_fields_no_422(client, db):
    admin = get_or_create_user(db, "admin@corpsec.co.ke", UserRole.ADMIN, "System Administrator")
    admin_token = create_access_token(data={"sub": str(admin.id)})
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Test payload with empty strings for dates, receipt, descriptions, titles - which previously triggered 422
    payload = {
        "title": "",
        "category": "Office Supplies & Admin",
        "expense_type": "FIRM_OPERATING",
        "payee": "Nairobi Stationery Store",
        "amount": 2850.0,
        "payment_method": "CASH",
        "receipt_number": "",
        "description": "",
        "expense_date": "",
        "is_recurring": False,
        "recurrence_interval": "",
        "next_due_date": ""
    }

    res = client.post("/api/v1/expenses/", json=payload, headers=headers)
    assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
    data = res.json()
    assert data["amount"] == 2850.0
    assert data["payee"] == "Nairobi Stationery Store"
    assert data["category"].upper() == "OFFICE SUPPLIES & ADMIN"
    assert data["expense_date"] == str(date.today())
    assert data["title"] is not None and len(data["title"]) > 0


def test_expenses_month_filtering_and_summary(client, db):
    admin = get_or_create_user(db, "admin@corpsec.co.ke", UserRole.ADMIN, "System Administrator")
    admin_token = create_access_token(data={"sub": str(admin.id)})
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Test Summary default (this_month)
    res_summary_this = client.get("/api/v1/expenses/summary", headers=headers)
    assert res_summary_this.status_code == 200
    s_this = res_summary_this.json()
    assert "total_expenses_this_month" in s_this
    assert "total_expenses_last_month" in s_this
    assert "available_months" in s_this
    assert s_this["selected_month"] == "this_month"

    # 2. Test Summary for last_month
    res_summary_last = client.get("/api/v1/expenses/summary?month=last_month", headers=headers)
    assert res_summary_last.status_code == 200
    s_last = res_summary_last.json()
    assert s_last["selected_month"] == "last_month"
    assert "selected_month_total" in s_last

    # 3. Test Expenses list filtering
    res_list_this = client.get("/api/v1/expenses/?month=this_month", headers=headers)
    assert res_list_this.status_code == 200
    this_items = res_list_this.json()
    assert isinstance(this_items, list)

    res_list_last = client.get("/api/v1/expenses/?month=last_month", headers=headers)
    assert res_list_last.status_code == 200
    last_items = res_list_last.json()
    assert isinstance(last_items, list)

    res_list_all = client.get("/api/v1/expenses/", headers=headers)
    assert res_list_all.status_code == 200
    all_items = res_list_all.json()
    assert len(all_items) >= len(this_items)


def test_supervisor_forbidden_from_expenses(client, db):
    sup = get_or_create_user(db, "supervisor@corpsec.co.ke", UserRole.SUPERVISOR, "Field Supervisor")
    sup_token = create_access_token(data={"sub": str(sup.id)})
    headers = {"Authorization": f"Bearer {sup_token}"}

    res_list = client.get("/api/v1/expenses/", headers=headers)
    assert res_list.status_code == 403

    res_summary = client.get("/api/v1/expenses/summary", headers=headers)
    assert res_summary.status_code == 403

    res_rec = client.get("/api/v1/expenses/recurring", headers=headers)
    assert res_rec.status_code == 403


def test_top_up_petty_cash_float_saved_in_database(client, db):
    admin = get_or_create_user(db, "admin@corpsec.co.ke", UserRole.ADMIN, "System Administrator")
    admin_token = create_access_token(data={"sub": str(admin.id)})
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Record Float Top-Up
    payload = {
        "amount": 10000.0,
        "source": "Bank Withdrawal (Standard Chartered)",
        "voucher_ref": "CHQ-77821",
        "reference_number": "CHQ-77821",
        "reason": "Mid-month petty cash replenishment",
        "notes": "Mid-month petty cash replenishment"
    }

    res = client.post("/api/v1/expenses/petty-cash/top-up", json=payload, headers=headers)
    assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
    data = res.json()
    assert data["amount"] == 10000.0
    assert data["transaction_type"] == "TOP_UP"
    assert data["voucher_ref"] == "CHQ-77821"

    # 2. Retrieve from database via GET /expenses/petty-cash
    res_pc = client.get("/api/v1/expenses/petty-cash", headers=headers)
    assert res_pc.status_code == 200
    pc_data = res_pc.json()
    assert "transactions" in pc_data
    assert any(t["voucher_ref"] == "CHQ-77821" and t["amount"] == 10000.0 for t in pc_data["transactions"])


def test_recurring_expenditure_crud_and_payment_tracking(client, db):
    admin = get_or_create_user(db, "admin@corpsec.co.ke", UserRole.ADMIN, "System Administrator")
    admin_token = create_access_token(data={"sub": str(admin.id)})
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Admin/HR creates a recurring obligation (Add recurrent expenditure)
    add_payload = {
        "title": "KPLC Substation Electricity Bill",
        "category": "Utilities & Electricity",
        "payee": "Kenya Power & Lighting Co",
        "amount": 18500.0,
        "recurrence_interval": "MONTHLY",
        "next_due_date": "2026-12-05",
        "payment_method": "MPESA",
        "status": "ACTIVE",
        "description": "Meter No: 44109283 - HQ Compound"
    }
    res_add = client.post("/api/v1/expenses/recurring", json=add_payload, headers=headers)
    assert res_add.status_code == 201, f"Expected 201, got {res_add.status_code}: {res_add.text}"
    rec_item = res_add.json()
    rec_id = rec_item["id"]
    assert rec_item["payee"] == "Kenya Power & Lighting Co"
    assert rec_item["amount"] == 18500.0

    # 2. Retrieve recurring list and verify payee ("to whom") and amount
    res_list = client.get("/api/v1/expenses/recurring", headers=headers)
    assert res_list.status_code == 200
    all_rec = res_list.json()
    found = next((r for r in all_rec if r["id"] == rec_id), None)
    assert found is not None
    assert found["payee"] == "Kenya Power & Lighting Co"
    assert found["amount"] == 18500.0

    # 3. Admin/HR edits recurrent expenditure (Edit recurrent expenditure)
    update_payload = {
        "amount": 19200.0,
        "description": "Meter No: 44109283 - HQ Compound (Updated Tariff)"
    }
    res_up = client.put(f"/api/v1/expenses/recurring/{rec_id}", json=update_payload, headers=headers)
    assert res_up.status_code == 200
    updated_rec = res_up.json()
    assert updated_rec["amount"] == 19200.0

    # 4. Record payment for this recurring obligation ("when were paid and to whom")
    pay_payload = {
        "payment_date": "2026-11-13",
        "amount": 19200.0,
        "payment_method": "MPESA",
        "receipt_number": "KPLC-NOV-99812",
        "description": "November 2026 Electricity Bill Payment",
        "advance_next_due_date": True
    }
    res_pay = client.post(f"/api/v1/expenses/recurring/{rec_id}/pay", json=pay_payload, headers=headers)
    assert res_pay.status_code == 201, f"Expected 201, got {res_pay.status_code}: {res_pay.text}"
    pay_data = res_pay.json()
    assert pay_data["recurring_obligation"]["last_paid_date"] == "2026-11-13"
    assert pay_data["recurring_obligation"]["payee"] == "Kenya Power & Lighting Co"
    assert "2027" in str(pay_data["recurring_obligation"]["next_due_date"]) or "2026-12" in str(pay_data["recurring_obligation"]["next_due_date"]) or "2027-01" in str(pay_data["recurring_obligation"]["next_due_date"])

    # 5. Verify payment audit history ("identify when were paid and to whom")
    res_detail = client.get(f"/api/v1/expenses/recurring/{rec_id}", headers=headers)
    assert res_detail.status_code == 200
    detail = res_detail.json()
    assert detail["last_paid_date"] == "2026-11-13"
    assert detail["payee"] == "Kenya Power & Lighting Co"
    assert detail["payment_count"] >= 1
    assert any(p["receipt_number"] == "KPLC-NOV-99812" and p["payee"] == "Kenya Power & Lighting Co" for p in detail["payments_history"])

    # 6. Admin/HR removes recurrent expenditure (Remove recurrent expenditure)
    res_del = client.delete(f"/api/v1/expenses/recurring/{rec_id}", headers=headers)
    assert res_del.status_code == 200

    # 7. Verify it is removed from recurring list
    res_after = client.get("/api/v1/expenses/recurring", headers=headers)
    assert not any(r["id"] == rec_id for r in res_after.json())


