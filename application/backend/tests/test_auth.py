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
        for _ in range(5):
            client.post("/api/v1/auth/login", json={"email": "ratelimit_test@corpsec.co.ke", "password": "BadPassword123!"})
        
        # 6th attempt should be blocked with 429
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
