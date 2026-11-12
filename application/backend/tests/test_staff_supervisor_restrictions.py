import pytest
from application.backend.app.models.user import User, UserRole
from application.backend.app.models.guard import Guard
from application.backend.app.models.asset import Asset, AssetAllocation, InventoryItem, InventoryTransaction
from application.backend.app.models.payroll import PayrollRecord, PayrollPeriod
from application.backend.app.core.security import create_access_token, get_password_hash


def get_or_create_test_user(db, email: str, role: str, full_name: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            email=email,
            phone=f"+25470000{abs(hash(email)) % 10000:04d}",
            password_hash=get_password_hash("TestPass123!"),
            full_name=full_name,
            role=role,
            status="ACTIVE"
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


def test_supervisor_cannot_access_expenses(client, db):
    sup = get_or_create_test_user(db, "supervisor_test@corpsec.co.ke", "SUPERVISOR", "Alex Omondi")
    supervisor_token = create_access_token(subject=sup.id, role=sup.role)

    # Supervisor trying to list expenses
    res = client.get("/api/v1/expenses", headers={"Authorization": f"Bearer {supervisor_token}"})
    assert res.status_code == 403

    # Supervisor trying to access expenses summary
    res_sum = client.get("/api/v1/expenses/summary", headers={"Authorization": f"Bearer {supervisor_token}"})
    assert res_sum.status_code == 403


def test_supervisor_cannot_hold_salary(client, db):
    sup = get_or_create_test_user(db, "supervisor_test@corpsec.co.ke", "SUPERVISOR", "Alex Omondi")
    supervisor_token = create_access_token(subject=sup.id, role=sup.role)

    rec = db.query(PayrollRecord).first()
    if rec:
        res = client.post(
            f"/api/v1/payments/records/{rec.id}/hold",
            headers={"Authorization": f"Bearer {supervisor_token}"},
            json={"reason": "Testing supervisor hold restriction"}
        )
        assert res.status_code == 403


def test_hr_cannot_access_staff_files(client, db):
    hr = get_or_create_test_user(db, "hr_test@corpsec.co.ke", "HR", "Sarah HR")
    hr_token = create_access_token(subject=hr.id, role=hr.role)

    # HR trying to list staff
    res = client.get("/api/v1/staff", headers={"Authorization": f"Bearer {hr_token}"})
    assert res.status_code == 403

    # HR trying to access staff custody allocations
    admin = get_or_create_test_user(db, "admin@corpsec.co.ke", "ADMIN", "System Administrator")
    res_alloc = client.get(f"/api/v1/assets/allocations?staff_id={admin.id}", headers={"Authorization": f"Bearer {hr_token}"})
    assert res_alloc.status_code == 403

    # HR trying to access staff inventory transactions
    res_tx = client.get(f"/api/v1/assets/inventory/transactions?staff_id={admin.id}", headers={"Authorization": f"Bearer {hr_token}"})
    assert res_tx.status_code == 403

    # HR trying to access staff salary advances
    res_adv = client.get(f"/api/v1/salary-advances?staff_id={admin.id}", headers={"Authorization": f"Bearer {hr_token}"})
    assert res_adv.status_code == 403


def test_admin_can_access_staff_files(client, db):
    admin = get_or_create_test_user(db, "admin@corpsec.co.ke", "ADMIN", "System Administrator")
    admin_token = create_access_token(subject=admin.id, role=admin.role)

    # Admin can list staff
    res = client.get("/api/v1/staff", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    assert isinstance(res.json(), list)

    # Admin can view staff custody
    res_alloc = client.get(f"/api/v1/assets/allocations?staff_id={admin.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_alloc.status_code == 200


def test_supervisor_can_issue_inventory_to_guard(client, db):
    sup = get_or_create_test_user(db, "supervisor_test@corpsec.co.ke", "SUPERVISOR", "Alex Omondi")
    supervisor_token = create_access_token(subject=sup.id, role=sup.role)

    guard = db.query(Guard).filter(Guard.status == "ACTIVE").first()
    item = db.query(InventoryItem).filter(InventoryItem.current_stock > 0).first()

    if guard and item:
        payload = {
            "item_id": item.id,
            "transaction_type": "ISSUED",
            "quantity": 1,
            "issued_to_guard_id": guard.id,
            "reason_notes": "Supervisor duty issuance test"
        }
        res = client.post(
            "/api/v1/assets/inventory/transact",
            headers={"Authorization": f"Bearer {supervisor_token}"},
            json=payload
        )
        assert res.status_code == 200
        data = res.json()
        assert data["processed_by_name"] is not None

        # Verify transaction in db
        tx = db.query(InventoryTransaction).filter(InventoryTransaction.id == data["id"]).first()
        assert tx.processed_by_user_id == sup.id
        assert tx.issued_to_guard_id == guard.id

        # Verify querying transactions by supervisor user id
        res_disp = client.get(
            f"/api/v1/assets/inventory/transactions?processed_by_user_id={sup.id}&transaction_type=ISSUED",
            headers={"Authorization": f"Bearer {supervisor_token}"}
        )
        assert res_disp.status_code == 200
        disp_data = res_disp.json()
        assert any(t["id"] == tx.id for t in disp_data)


def test_login_records_gps_location_and_user_session(client, db):
    from application.backend.app.models.user_session import UserSession
    from application.backend.app.models.audit import AuditLog

    sup = get_or_create_test_user(db, "supervisor_gps@corpsec.co.ke", "SUPERVISOR", "Alex GPS")

    payload = {
        "email": "supervisor_gps@corpsec.co.ke",
        "password": "TestPass123!",
        "latitude": -1.286389,
        "longitude": 36.817223,
        "accuracy": 15.5,
        "location_name": "Nairobi CBD Office"
    }

    res = client.post("/api/v1/auth/login", json=payload)
    assert res.status_code == 200
    data = res.json()

    # If supervisor requires OTP, complete 2FA verification step with coordinates
    if data.get("otp_required"):
        db.commit()
        from application.backend.app.models.email_otp import EmailOTP
        otp_rec = (
            db.query(EmailOTP)
            .filter(EmailOTP.user_id == sup.id, EmailOTP.is_used == False)
            .order_by(EmailOTP.id.desc())
            .first()
        )
        assert otp_rec is not None
        res_v = client.post("/api/v1/auth/verify-otp", json={
            "email": "supervisor_gps@corpsec.co.ke",
            "otp_code": otp_rec.otp_code,
            "latitude": payload["latitude"],
            "longitude": payload["longitude"],
            "accuracy": payload["accuracy"],
            "location_name": payload["location_name"]
        })
        assert res_v.status_code == 200
        data = res_v.json()

    assert "access_token" in data
    assert "session_id" in data
    sess_id = data["session_id"]
    assert sess_id is not None

    # Verify UserSession in db
    sess = db.query(UserSession).filter(UserSession.id == sess_id).first()
    assert sess is not None
    assert sess.user_id == sup.id
    assert abs(sess.latitude - (-1.286389)) < 0.001
    assert abs(sess.longitude - 36.817223) < 0.001
    assert sess.location_name == "Nairobi CBD Office"
    assert sess.is_active is True

    # Verify AuditLog in db
    audit = db.query(AuditLog).filter(
        AuditLog.user_id == sup.id,
        AuditLog.action.in_(["LOGIN_SUCCESS", "LOGIN_OTP_VERIFIED"])
    ).order_by(AuditLog.id.desc()).first()
    assert audit is not None
    assert "Nairobi CBD Office" in (audit.reason or "") or "GPS" in (audit.reason or "")


def test_session_heartbeat_tracks_duration(client, db):
    from application.backend.app.models.user_session import UserSession

    admin = get_or_create_test_user(db, "admin@corpsec.co.ke", "ADMIN", "System Administrator")
    admin_token = create_access_token(subject=admin.id, role=admin.role)

    # Create session
    sess = UserSession(
        user_id=admin.id,
        session_token="test_token_hb",
        latitude=-1.28,
        longitude=36.82,
        is_active=True,
        duration_seconds=60
    )
    db.add(sess)
    db.commit()
    db.refresh(sess)

    # Ping heartbeat
    hb_res = client.post(
        "/api/v1/auth/heartbeat",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"session_id": sess.id, "active_seconds": 60}
    )
    assert hb_res.status_code == 200
    hb_data = hb_res.json()
    assert hb_data["duration_seconds"] >= 120

    # Refresh from db
    db.refresh(sess)
    assert sess.duration_seconds >= 120


def test_staff_monitoring_admin_only(client, db):
    admin = get_or_create_test_user(db, "admin@corpsec.co.ke", "ADMIN", "System Administrator")
    admin_token = create_access_token(subject=admin.id, role=admin.role)

    hr = get_or_create_test_user(db, "hr_test@corpsec.co.ke", "HR", "Sarah HR")
    hr_token = create_access_token(subject=hr.id, role=hr.role)

    sup = get_or_create_test_user(db, "supervisor_test@corpsec.co.ke", "SUPERVISOR", "Alex Omondi")
    sup_token = create_access_token(subject=sup.id, role=sup.role)

    # 1. Admin can access overview
    res_admin = client.get("/api/v1/staff/monitoring/overview", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_admin.status_code == 200
    assert isinstance(res_admin.json(), list)

    # HR is strictly forbidden (403)
    res_hr = client.get("/api/v1/staff/monitoring/overview", headers={"Authorization": f"Bearer {hr_token}"})
    assert res_hr.status_code == 403

    # Supervisor is strictly forbidden (403)
    res_sup = client.get("/api/v1/staff/monitoring/overview", headers={"Authorization": f"Bearer {sup_token}"})
    assert res_sup.status_code == 403


def test_staff_sessions_admin_only(client, db):
    admin = get_or_create_test_user(db, "admin@corpsec.co.ke", "ADMIN", "System Administrator")
    admin_token = create_access_token(subject=admin.id, role=admin.role)

    hr = get_or_create_test_user(db, "hr_test@corpsec.co.ke", "HR", "Sarah HR")
    hr_token = create_access_token(subject=hr.id, role=hr.role)

    sup = get_or_create_test_user(db, "supervisor_test@corpsec.co.ke", "SUPERVISOR", "Alex Omondi")

    # Admin can view sessions
    res_admin = client.get(f"/api/v1/staff/{sup.id}/sessions", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_admin.status_code == 200
    assert isinstance(res_admin.json(), list)

    # HR cannot view sessions
    res_hr = client.get(f"/api/v1/staff/{sup.id}/sessions", headers={"Authorization": f"Bearer {hr_token}"})
    assert res_hr.status_code == 403


def test_staff_daily_hours_admin_only(client, db):
    admin = get_or_create_test_user(db, "admin@corpsec.co.ke", "ADMIN", "System Administrator")
    admin_token = create_access_token(subject=admin.id, role=admin.role)

    hr = get_or_create_test_user(db, "hr_test@corpsec.co.ke", "HR", "Sarah HR")
    hr_token = create_access_token(subject=hr.id, role=hr.role)

    sup = get_or_create_test_user(db, "supervisor_test@corpsec.co.ke", "SUPERVISOR", "Alex Omondi")

    # Admin can view daily hours
    res_admin = client.get(f"/api/v1/staff/{sup.id}/daily-hours", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_admin.status_code == 200
    assert isinstance(res_admin.json(), list)

    # HR cannot view daily hours
    res_hr = client.get(f"/api/v1/staff/{sup.id}/daily-hours", headers={"Authorization": f"Bearer {hr_token}"})
    assert res_hr.status_code == 403


def test_staff_activity_admin_only(client, db):
    admin = get_or_create_test_user(db, "admin@corpsec.co.ke", "ADMIN", "System Administrator")
    admin_token = create_access_token(subject=admin.id, role=admin.role)

    hr = get_or_create_test_user(db, "hr_test@corpsec.co.ke", "HR", "Sarah HR")
    hr_token = create_access_token(subject=hr.id, role=hr.role)

    sup = get_or_create_test_user(db, "supervisor_test@corpsec.co.ke", "SUPERVISOR", "Alex Omondi")

    # Admin can view activity audit trail
    res_admin = client.get(f"/api/v1/staff/{sup.id}/activity", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_admin.status_code == 200
    assert isinstance(res_admin.json(), list)

    # HR cannot view activity trail
    res_hr = client.get(f"/api/v1/staff/{sup.id}/activity", headers={"Authorization": f"Bearer {hr_token}"})
    assert res_hr.status_code == 403

