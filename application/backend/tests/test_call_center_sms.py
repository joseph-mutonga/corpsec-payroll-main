import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from application.backend.app.main import app
from application.backend.app.core.security import create_access_token
from application.backend.app.models.user import User, UserRole
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.call_center import GuardSMSMessage, GuardSMSRecipient
from application.backend.app.services.sms_service import GuardSMSService


@pytest.fixture
def auth_headers(db: Session):
    admin = db.query(User).filter(User.role == UserRole.ADMIN).first()
    if not admin:
        admin = User(
            email="admin_sms_test@corpsec.co.ke",
            full_name="Admin SMS Dispatcher",
            phone="+254700009999",
            role=UserRole.ADMIN,
            is_active=True
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

    role_str = admin.role.value if hasattr(admin.role, "value") else str(admin.role)
    token = create_access_token(data={"sub": str(admin.id), "role": role_str})
    return {"Authorization": f"Bearer {token}"}


def test_get_guards_for_sms_selector(db: Session, auth_headers: dict):
    client = TestClient(app)
    res = client.get("/api/v1/call-center/sms/guards", headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) > 0
    first_guard = data[0]
    assert "id" in first_guard
    assert "full_name" in first_guard
    assert "employee_number" in first_guard
    assert "phone" in first_guard
    assert "phone_formatted" in first_guard


def test_send_sms_broadcast_to_all_guards(db: Session, auth_headers: dict):
    client = TestClient(app)
    payload = {
        "message_text": "URGENT MUSTER: All personnel report to your duty post immediately for physical turnout muster.",
        "recipient_type": "ALL",
        "category": "EMERGENCY"
    }
    res = client.post("/api/v1/call-center/sms/send", headers=auth_headers, json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["recipient_type"] == "ALL"
    assert data["total_recipients"] > 0
    assert data["delivered_count"] == data["total_recipients"]
    assert data["status"] == "SENT"
    assert data["message_reference"].startswith("SMS-")


def test_send_sms_to_specified_guards(db: Session, auth_headers: dict):
    client = TestClient(app)
    guards = db.query(Guard).filter(Guard.status == "ACTIVE").limit(2).all()
    assert len(guards) == 2
    target_ids = [g.id for g in guards]

    payload = {
        "message_text": "Personal notice: Report to Central Dispatch office at 14:00 hrs.",
        "recipient_type": "SPECIFIED",
        "guard_ids": target_ids,
        "category": "DISPATCH"
    }
    res = client.post("/api/v1/call-center/sms/send", headers=auth_headers, json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["recipient_type"] == "SPECIFIED"
    assert data["total_recipients"] == 2
    assert data["delivered_count"] == 2

    # Check recipient detail endpoint
    sms_id = data["message_id"]
    rec_res = client.get(f"/api/v1/call-center/sms/{sms_id}/recipients", headers=auth_headers)
    assert rec_res.status_code == 200
    rec_data = rec_res.json()
    assert len(rec_data["recipients"]) == 2
    rec_guard_ids = [r["guard_id"] for r in rec_data["recipients"]]
    assert set(rec_guard_ids) == set(target_ids)


def test_send_sms_to_site_guards(db: Session, auth_headers: dict):
    client = TestClient(app)
    guard = db.query(Guard).filter(Guard.status == "ACTIVE", Guard.primary_site_id.isnot(None)).first()
    if guard:
        site_id = guard.primary_site_id
        site_guard_count = db.query(Guard).filter(Guard.status == "ACTIVE", Guard.primary_site_id == site_id).count()

        payload = {
            "message_text": "Site inspection announcement: Regional supervisor will conduct a routine muster today.",
            "recipient_type": "SITE",
            "site_id": site_id,
            "category": "SHIFT"
        }
        res = client.post("/api/v1/call-center/sms/send", headers=auth_headers, json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["recipient_type"] == "SITE"
        assert data["total_recipients"] == site_guard_count


def test_sms_validation_failures(db: Session, auth_headers: dict):
    client = TestClient(app)

    # Empty text
    res1 = client.post("/api/v1/call-center/sms/send", headers=auth_headers, json={
        "message_text": "   ",
        "recipient_type": "ALL"
    })
    assert res1.status_code == 400

    # SPECIFIED without guard_ids
    res2 = client.post("/api/v1/call-center/sms/send", headers=auth_headers, json={
        "message_text": "Hello guard",
        "recipient_type": "SPECIFIED",
        "guard_ids": []
    })
    assert res2.status_code == 400

    # SITE without site_id
    res3 = client.post("/api/v1/call-center/sms/send", headers=auth_headers, json={
        "message_text": "Hello site",
        "recipient_type": "SITE",
        "site_id": None
    })
    assert res3.status_code == 400


def test_sms_history_and_overview(db: Session, auth_headers: dict):
    client = TestClient(app)
    res_hist = client.get("/api/v1/call-center/sms/history?limit=10", headers=auth_headers)
    assert res_hist.status_code == 200
    hist = res_hist.json()
    assert isinstance(hist, list)

    res_ov = client.get("/api/v1/call-center/sms/overview", headers=auth_headers)
    assert res_ov.status_code == 200
    ov = res_ov.json()
    assert "total_messages_sent" in ov
    assert "total_guard_deliveries" in ov
    assert "delivery_success_rate" in ov
    assert "active_guards_registered" in ov
