import os
from fastapi.testclient import TestClient
from application.backend.app.main import app

client = TestClient(app)


def test_serve_guard_portal_route():
    """Verify GET /portal returns portal.html with status 200 OK."""
    response = client.get("/portal")
    assert response.status_code == 200
    assert "Guard Mobile Portal" in response.text
    assert "portal.js" in response.text


def test_guard_portal_login_flow():
    """Verify Guard login with email, guard ID, or phone."""
    # Peter Otieno login by email
    resp1 = client.post("/api/v1/auth/login", json={"email": "peter.otieno@corpsec.co.ke", "password": "Guard@123456"})
    assert resp1.status_code == 200
    assert resp1.json()["role"] == "GUARD"

    # Guard login by Employee ID
    resp2 = client.post("/api/v1/auth/login", json={"email": "CS-00452", "password": "Guard@123456"})
    assert resp2.status_code == 200
    assert resp2.json()["role"] == "GUARD"

    # Admin login check
    resp_admin = client.post("/api/v1/auth/login", json={"email": "admin@corpsec.co.ke", "password": os.getenv("ADMIN_INITIAL_PASSWORD", "TestAdminSecretPass123!")})
    assert resp_admin.status_code == 200
    assert resp_admin.json()["role"] == "ADMIN"
