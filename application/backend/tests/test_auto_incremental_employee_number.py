import datetime
import pytest
from fastapi.testclient import TestClient
from application.backend.app.main import app
from application.backend.app.core.database import SessionLocal
from application.backend.app.core.security import get_password_hash, create_access_token
from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.guard import Guard
from application.backend.app.api.v1.guards import (
    compute_next_candidate,
    generate_next_employee_number,
    calculate_next_pure_number
)


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture(scope="module")
def admin_headers():
    db = SessionLocal()
    admin = db.query(User).filter(User.role == UserRole.ADMIN.value).first()
    if not admin:
        admin = User(
            email="admin_auto_emp_test@corpsec.co.ke",
            phone="+254700999001",
            password_hash=get_password_hash("CorpSec2026!"),
            role=UserRole.ADMIN.value,
            status=UserStatus.ACTIVE.value,
            full_name="Admin Auto Emp Tester"
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
    token = create_access_token(data={"sub": str(admin.id), "role": admin.role})
    db.close()
    return {"Authorization": f"Bearer {token}"}


def test_compute_next_candidate_logic():
    """Unit test the core calculation logic for incremental strings."""
    # 1. 001 -> 002
    p, v, w = compute_next_candidate("001")
    assert f"{p}{v:0{w}d}" == "002"

    # 2. 002 -> 003
    p, v, w = compute_next_candidate("002")
    assert f"{p}{v:0{w}d}" == "003"

    # 3. 009 -> 010
    p, v, w = compute_next_candidate("009")
    assert f"{p}{v:0{w}d}" == "010"

    # 4. 099 -> 100
    p, v, w = compute_next_candidate("099")
    assert f"{p}{v:0{w}d}" == "100"

    # 5. CS-001 -> CS-002
    p, v, w = compute_next_candidate("CS-001")
    assert f"{p}{v:0{w}d}" == "CS-002"

    # 6. CS-00461 -> CS-00462
    p, v, w = compute_next_candidate("CS-00461")
    assert f"{p}{v:0{w}d}" == "CS-00462"

    # 7. Single digit '1' -> '002' (minimum 3 digits padding)
    p, v, w = compute_next_candidate("1")
    assert f"{p}{v:0{w}d}" == "002"


def test_next_employee_number_unauthenticated(client):
    res = client.get("/api/v1/guards/next-employee-number")
    assert res.status_code == 401


def test_next_employee_number_authenticated(client, admin_headers):
    res = client.get("/api/v1/guards/next-employee-number", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()
    assert "next_employee_number" in data
    assert "previous_employee_number" in data
    assert "suggested_pure_number" in data
    assert len(data["next_employee_number"]) > 0


def test_incremental_registration_sequence_001_to_002(client, admin_headers):
    """
    Verifies the user's explicit requirement:
    'if the previous registered Employee Number was 001 the next should be 002. and it should be automatic.'
    """
    db = SessionLocal()
    # Clean up any test guards with 001, 002, 003 if they exist
    for test_no in ["001", "002", "003", "004"]:
        existing = db.query(Guard).filter(Guard.employee_number == test_no).first()
        if existing:
            # Delete any user account with this email/phone
            db.query(User).filter(User.phone == existing.phone).delete()
            db.delete(existing)
    db.commit()
    db.close()

    # Step 1: Register Guard with Employee Number '001'
    res1 = client.post(
        "/api/v1/guards",
        headers=admin_headers,
        json={
            "employee_number": "001",
            "full_name": "Test Guard Zero One",
            "national_id": "91000001",
            "phone": "+254791000001",
            "hire_date": "2026-11-01",
            "initial_password": "password123"
        }
    )
    assert res1.status_code == 201, res1.text
    assert res1.json()["employee_number"] == "001"

    # Step 2: Query next-employee-number: previous is '001', next MUST be '002'
    next_res1 = client.get("/api/v1/guards/next-employee-number", headers=admin_headers)
    assert next_res1.status_code == 200
    next_data1 = next_res1.json()
    assert next_data1["previous_employee_number"] == "001"
    assert next_data1["next_employee_number"] == "002"

    # Step 3: Automatically create next guard WITHOUT providing employee_number (empty/omitted)
    res2 = client.post(
        "/api/v1/guards",
        headers=admin_headers,
        json={
            "full_name": "Test Guard Zero Two",
            "national_id": "91000002",
            "phone": "+254791000002",
            "hire_date": "2026-11-01",
            "initial_password": "password123"
        }
    )
    assert res2.status_code == 201, res2.text
    # Must have automatically been assigned '002'
    assert res2.json()["employee_number"] == "002"

    # Step 4: Query next-employee-number again: previous is now '002', next MUST be '003'
    next_res2 = client.get("/api/v1/guards/next-employee-number", headers=admin_headers)
    assert next_res2.status_code == 200
    next_data2 = next_res2.json()
    assert next_data2["previous_employee_number"] == "002"
    assert next_data2["next_employee_number"] == "003"

    # Step 5: Automatically create third guard without employee_number
    res3 = client.post(
        "/api/v1/guards",
        headers=admin_headers,
        json={
            "full_name": "Test Guard Zero Three",
            "national_id": "91000003",
            "phone": "+254791000003",
            "hire_date": "2026-11-01",
            "initial_password": "password123"
        }
    )
    assert res3.status_code == 201, res3.text
    # Must have automatically been assigned '003'
    assert res3.json()["employee_number"] == "003"

    # Clean up test guards created during this test
    db = SessionLocal()
    for test_no in ["001", "002", "003"]:
        g = db.query(Guard).filter(Guard.employee_number == test_no).first()
        if g:
            db.query(User).filter(User.phone == g.phone).delete()
            db.delete(g)
    db.commit()
    db.close()

