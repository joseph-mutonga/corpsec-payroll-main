import pytest
from application.backend.app.core.security import create_access_token, get_password_hash
from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.site import Site
from application.backend.app.models.invoice import SiteInvoice


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


def test_invoices_rbac(client, db):
    admin = get_or_create_user(db, "admin@corpsec.co.ke", UserRole.ADMIN, "System Administrator")
    hr = get_or_create_user(db, "hr@corpsec.co.ke", UserRole.HR, "HR Manager")
    sup = get_or_create_user(db, "supervisor@corpsec.co.ke", UserRole.SUPERVISOR, "Field Supervisor")

    admin_token = create_access_token(data={"sub": str(admin.id)})
    hr_token = create_access_token(data={"sub": str(hr.id)})
    sup_token = create_access_token(data={"sub": str(sup.id)})

    # Admin has access
    res = client.get("/api/v1/invoices", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200

    # HR has access
    res = client.get("/api/v1/invoices", headers={"Authorization": f"Bearer {hr_token}"})
    assert res.status_code == 200

    # Supervisor is forbidden
    res = client.get("/api/v1/invoices", headers={"Authorization": f"Bearer {sup_token}"})
    assert res.status_code == 403


def test_generate_amend_download_invoice(client, db):
    admin = get_or_create_user(db, "admin@corpsec.co.ke", UserRole.ADMIN, "System Administrator")
    hr = get_or_create_user(db, "hr@corpsec.co.ke", UserRole.HR, "HR Manager")

    admin_token = create_access_token(data={"sub": str(admin.id)})
    hr_token = create_access_token(data={"sub": str(hr.id)})

    site = db.query(Site).first()
    assert site is not None, "At least one site must exist"

    # 1. Generate Site Invoice
    gen_payload = {
        "site_id": site.id,
        "billing_period": "November 2026",
        "tax_rate": 16.0,
        "include_supervision": True
    }
    res = client.post(
        "/api/v1/invoices/generate",
        json=gen_payload,
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res.status_code == 201
    data = res.json()
    invoice_id = data["id"]
    assert data["site_name"] == site.site_name
    assert len(data["items"]) >= 1

    # 2. Amend Invoice (by HR)
    amend_payload = {
        "notes": "Amended terms for corporate client.",
        "status": "ISSUED",
        "items": [
            {
                "item_name": "Static Security Guarding",
                "description": "Deployment of 4 guards",
                "quantity": 4.0,
                "unit_price": 20000.0,
                "tax_rate": 16.0,
                "amount": 80000.0
            }
        ]
    }
    res_amend = client.put(
        f"/api/v1/invoices/{invoice_id}",
        json=amend_payload,
        headers={"Authorization": f"Bearer {hr_token}"}
    )
    assert res_amend.status_code == 200
    amended = res_amend.json()
    assert amended["subtotal"] == 80000.0
    assert amended["total_amount"] == 92800.0

    # 3. Download PDF (Admin & HR)
    res_pdf_admin = client.get(
        f"/api/v1/invoices/{invoice_id}/pdf",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res_pdf_admin.status_code == 200
    assert res_pdf_admin.headers.get("content-type") == "application/pdf"
    assert len(res_pdf_admin.content) > 1000

    res_pdf_hr = client.get(
        f"/api/v1/invoices/{invoice_id}/pdf",
        headers={"Authorization": f"Bearer {hr_token}"}
    )
    assert res_pdf_hr.status_code == 200

    # 4. Update status
    res_st = client.post(
        f"/api/v1/invoices/{invoice_id}/status?new_status=PAID",
        headers={"Authorization": f"Bearer {hr_token}"}
    )
    assert res_st.status_code == 200

    # 5. Delete invoice
    res_del = client.delete(
        f"/api/v1/invoices/{invoice_id}",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert res_del.status_code == 200
