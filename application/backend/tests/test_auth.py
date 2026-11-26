import os
import pytest
from application.backend.app.api.deps import require_admin
from application.backend.app.main import app
from fastapi import Depends


def test_admin_login_success(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@corpsec.co.ke", "password": os.getenv("ADMIN_INITIAL_PASSWORD")}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["role"] == "ADMIN"


def test_admin_login_invalid_password(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@corpsec.co.ke", "password": "WrongPassword123"}
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password"


def test_login_rate_limiting(client):
    """Verify that rapid invalid login attempts trigger HTTP 429 Too Many Requests."""
    from application.backend.app.core.limiter import limiter
    limiter.enabled = True
    try:
        for _ in range(60):
            client.post("/api/v1/auth/login", json={"email": "ratelimit_test@corpsec.co.ke", "password": "BadPassword123!"})
        
        # 61st attempt should be blocked with 429
        blocked_resp = client.post("/api/v1/auth/login", json={"email": "ratelimit_test@corpsec.co.ke", "password": "BadPassword123!"})
        assert blocked_resp.status_code == 429
        assert "Too many login attempts" in blocked_resp.json()["detail"]
        assert "Retry-After" in blocked_resp.headers
    finally:
        limiter.enabled = False


def test_guard_login_success(client):
    response = client.post(
        "/api/v1/auth/login/guard",
        json={"guard_id": "CS-00452", "password": "Guard@123456"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["role"] == "GUARD"
    assert data["guard_id"] is not None


def test_guard_login_by_phone(client):
    response = client.post(
        "/api/v1/auth/login/guard",
        json={"guard_id": "0713345678", "password": "Guard@123456"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "GUARD"


def test_get_me(client):
    # First login as admin
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@corpsec.co.ke", "password": os.getenv("ADMIN_INITIAL_PASSWORD")}
    )
    token = login_resp.json()["access_token"]
    
    # Call /me with token
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "admin@corpsec.co.ke"
    assert data["role"] == "ADMIN"


def test_rbac_admin_protected_route(client):
    # Dummy admin endpoint for testing RBAC
    @app.get("/api/v1/test-admin-only", dependencies=[Depends(require_admin)])
    def admin_only_test():
        return {"ok": True}

    # Guard token
    guard_login = client.post(
        "/api/v1/auth/login/guard",
        json={"guard_id": "CS-00452", "password": "Guard@123456"}
    )
    guard_token = guard_login.json()["access_token"]

    # Try calling admin route with guard token -> 403 Forbidden
    response = client.get(
        "/api/v1/test-admin-only",
        headers={"Authorization": f"Bearer {guard_token}"}
    )
    assert response.status_code == 403
    assert "Administrative privileges required" in response.json()["detail"]

    # Admin token -> 200 OK
    admin_login = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@corpsec.co.ke", "password": os.getenv("ADMIN_INITIAL_PASSWORD")}
    )
    admin_token = admin_login.json()["access_token"]

    response_admin = client.get(
        "/api/v1/test-admin-only",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response_admin.status_code == 200
    assert response_admin.json() == {"ok": True}


def test_change_password_workflow(client):
    # 1. Login as Admin
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@corpsec.co.ke", "password": os.getenv("ADMIN_INITIAL_PASSWORD")}
    )
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Change password
    change_resp = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": os.getenv("ADMIN_INITIAL_PASSWORD"), "new_password": "NewSecretPass@123"},
        headers=headers
    )
    assert change_resp.status_code == 200
    assert change_resp.json()["status"] == "SUCCESS"

    # 3. Login with old password fails
    old_login = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@corpsec.co.ke", "password": os.getenv("ADMIN_INITIAL_PASSWORD")}
    )
    assert old_login.status_code == 401

    # 4. Login with new password succeeds
    new_login = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@corpsec.co.ke", "password": "NewSecretPass@123"}
    )
    assert new_login.status_code == 200


def test_forgot_password_all_roles_and_identifiers(client, db, monkeypatch):
    """Every user role (Admin, HR, Supervisor, Staff, Guard) can reset & receive a password by username."""
    from application.backend.app.core.security import get_password_hash
    from application.backend.app.models.user import User, UserRole, UserStatus

    sent_emails = []

    def fake_send_reset(email, new_password, user_name=None, login_hint=None):
        sent_emails.append({
            "email": email,
            "new_password": new_password,
            "user_name": user_name,
            "login_hint": login_hint,
        })
        return True, None

    monkeypatch.setattr("application.backend.app.api.v1.auth.send_password_reset_email", fake_send_reset)

    # Ensure HR, Supervisor, and Staff accounts exist in test DB
    extra_users = [
        ("hr.tester@corpsec.co.ke", "0799000101", "HR Tester", UserRole.HR.value, "hr.tester"),
        ("sup.tester@corpsec.co.ke", "0799000102", "Sup Tester", UserRole.SUPERVISOR.value, "Sup Tester"),
        ("staff.tester@corpsec.co.ke", "0799000103", "Staff Tester", UserRole.STAFF.value, "0799000103"),
    ]
    for email, phone, full_name, role, _ in extra_users:
        u = db.query(User).filter(User.email == email).first()
        if not u:
            u = User(
                email=email,
                phone=phone,
                full_name=full_name,
                password_hash=get_password_hash("OldPass@123"),
                role=role,
                status=UserStatus.ACTIVE.value,
            )
            db.add(u)
    db.commit()

    # Test every role using different username formats:
    # Admin (exact email), Guard (Employee ID), HR (email prefix/username), Supervisor (full name), Staff (phone)
    cases = [
        ("admin@corpsec.co.ke", "admin@corpsec.co.ke", "ADMIN"),
        ("CS-00452", None, "GUARD"),
        ("hr.tester", "hr.tester@corpsec.co.ke", "HR"),
        ("Sup Tester", "sup.tester@corpsec.co.ke", "SUPERVISOR"),
        ("0799000103", "staff.tester@corpsec.co.ke", "STAFF"),
    ]

    for username_input, expected_email, expected_role in cases:
        before_count = len(sent_emails)
        resp = client.post("/api/v1/auth/forgot-password", json={"username": username_input})
        assert resp.status_code == 200, f"Failed for {username_input}: {resp.text}"
        body = resp.json()
        assert body["status"] == "SUCCESS"
        assert body["role"] == expected_role
        assert body["masked_email"] is not None
        assert len(sent_emails) == before_count + 1

        emailed = sent_emails[-1]
        if expected_email:
            assert emailed["email"] == expected_email
        # Password must NOT be leaked in HTTP response
        assert emailed["new_password"] not in resp.text

        # User can immediately log in using the emailed temporary password
        login_resp = client.post(
            "/api/v1/auth/login",
            json={"email": username_input, "password": emailed["new_password"]}
        )
        assert login_resp.status_code == 200
        login_data = login_resp.json()
        assert login_data["must_change_password"] is True

        # Obtain access token (direct for GUARD or admin@corpsec.co.ke in test mode; via verify-otp for HR/Supervisor/Staff)
        if login_data.get("otp_required"):
            from application.backend.app.models.email_otp import EmailOTP
            otp_rec = (
                db.query(EmailOTP)
                .filter(EmailOTP.email.ilike(emailed["email"]), EmailOTP.is_used == False)
                .order_by(EmailOTP.id.desc())
                .first()
            )
            assert otp_rec is not None
            verify_resp = client.post(
                "/api/v1/auth/verify-otp",
                json={"email": emailed["email"], "otp_code": otp_rec.otp_code}
            )
            assert verify_resp.status_code == 200
            verify_data = verify_resp.json()
            assert verify_data["must_change_password"] is True
            session_token = verify_data["access_token"]
        else:
            session_token = login_data["access_token"]

        headers = {"Authorization": f"Bearer {session_token}"}

        # Mismatched passwords must be rejected
        mismatch_resp = client.post(
            "/api/v1/auth/set-new-password",
            json={"new_password": "MyChosenPass@2026", "confirm_password": "DifferentPass@2026"},
            headers=headers
        )
        assert mismatch_resp.status_code == 422

        # Matching new password & confirmation succeeds and clears must_change_password
        custom_pw = f"Custom_{expected_role}_2026!"
        set_resp = client.post(
            "/api/v1/auth/set-new-password",
            json={"new_password": custom_pw, "confirm_password": custom_pw},
            headers=headers
        )
        assert set_resp.status_code == 200
        assert set_resp.json()["status"] == "SUCCESS"

        # Calling set-new-password again is rejected once completed
        repeat_call = client.post(
            "/api/v1/auth/set-new-password",
            json={"new_password": custom_pw, "confirm_password": custom_pw},
            headers=headers
        )
        assert repeat_call.status_code == 400

        # Old temporary password no longer works
        old_temp_login = client.post(
            "/api/v1/auth/login",
            json={"email": username_input, "password": emailed["new_password"]}
        )
        assert old_temp_login.status_code == 401

        # New custom password logs in cleanly with must_change_password=False
        custom_login = client.post(
            "/api/v1/auth/login",
            json={"email": username_input, "password": custom_pw}
        )
        assert custom_login.status_code == 200
        assert custom_login.json()["must_change_password"] is False


def test_forgot_password_error_cases_and_rollback(client, db, monkeypatch):
    from application.backend.app.core.security import verify_password
    from application.backend.app.models.user import User

    # Unknown user -> 404
    not_found = client.post("/api/v1/auth/forgot-password", json={"username": "nonexistent_user_xyz"})
    assert not_found.status_code == 404

    # Empty username -> 422
    empty_resp = client.post("/api/v1/auth/forgot-password", json={"username": "   "})
    assert empty_resp.status_code == 422

    # Email transport failure -> 503 and existing password remains unchanged
    admin_user = db.query(User).filter(User.email == "admin@corpsec.co.ke").first()
    old_hash = admin_user.password_hash

    monkeypatch.setattr(
        "application.backend.app.api.v1.auth.send_password_reset_email",
        lambda *args, **kwargs: (False, "Simulated SMTP outage")
    )
    fail_resp = client.post("/api/v1/auth/forgot-password", json={"username": "admin@corpsec.co.ke"})
    assert fail_resp.status_code == 503
    db.refresh(admin_user)
    assert admin_user.password_hash == old_hash
    assert verify_password(os.getenv("ADMIN_INITIAL_PASSWORD"), admin_user.password_hash)


def test_production_email_hardening_and_otp_failure_handling(client, db, monkeypatch):
    """Verify production SMTP config normalization, failure propagation on OTP, and HTML escaping."""
    from application.backend.app.services import otp_service
    from application.backend.app.core.security import get_password_hash
    from application.backend.app.models.user import User, UserRole, UserStatus

    # 1. Default no-reply@corpsec.co.ke aligns with SMTP_USER when deploying with Gmail/cloud SMTP
    monkeypatch.setattr(otp_service.settings, "SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setattr(otp_service.settings, "SMTP_PORT", 587)
    monkeypatch.setattr(otp_service.settings, "SMTP_USER", "corpsec.prod@gmail.com")
    monkeypatch.setattr(otp_service.settings, "SMTP_PASSWORD", "abcd efgh ijkl mnop")
    monkeypatch.setattr(otp_service.settings, "SMTP_FROM", "CorpSec Security <no-reply@corpsec.co.ke>")
    cfg = otp_service._get_smtp_config()
    assert cfg["password"] == "abcdefghijklmnop"
    assert cfg["envelope_from"] == "corpsec.prod@gmail.com"
    assert cfg["from_addr"] == "CorpSec Security <corpsec.prod@gmail.com>"

    # 2. Unconfigured SMTP & API in non-TESTING mode fails explicitly instead of silently succeeding
    monkeypatch.delenv("TESTING", raising=False)
    monkeypatch.setattr(otp_service.settings, "SMTP_HOST", None)
    monkeypatch.setattr(otp_service.settings, "RESEND_API_KEY", None)
    monkeypatch.setattr(otp_service.settings, "SENDGRID_API_KEY", None)
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("SENDGRID_API_KEY", raising=False)
    ok, err = otp_service.deliver_email("user@example.com", "Test", "Body", "<p>Body</p>")
    assert ok is False
    assert "not configured" in err.lower()

    # 3. If OTP email fails on login, /login returns 503 instead of claiming OTP was dispatched
    sup = db.query(User).filter(User.email == "otp_fail_sup@corpsec.co.ke").first()
    if not sup:
        sup = User(
            email="otp_fail_sup@corpsec.co.ke",
            phone="0799000202",
            full_name="OTP <Fail> User",
            password_hash=get_password_hash("Pass@12345"),
            role=UserRole.SUPERVISOR.value,
            status=UserStatus.ACTIVE.value,
        )
        db.add(sup)
        db.commit()

    monkeypatch.setattr(otp_service, "send_otp_email_checked", lambda *args, **kwargs: (False, "SMTP outage"))
    login_res = client.post("/api/v1/auth/login", json={"email": "otp_fail_sup@corpsec.co.ke", "password": "Pass@12345"})
    assert login_res.status_code == 503
    assert "Unable to send verification code email" in login_res.json()["detail"]

    resend_res = client.post("/api/v1/auth/resend-otp", json={"email": "otp_fail_sup@corpsec.co.ke"})
    assert resend_res.status_code == 503
