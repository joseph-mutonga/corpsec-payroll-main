import datetime
from fastapi.testclient import TestClient
import pytest

from application.backend.app.main import app
from application.backend.app.core.database import SessionLocal
from application.backend.app.core.security import get_password_hash
from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.guard import Guard
from application.backend.app.models.email_otp import EmailOTP
from application.backend.app.services.otp_service import (
    requiresOTPVerification,
    generateSecureOTP,
    sendOTPEmail,
    verifyOTPCode,
)


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture(scope="module")
def test_users():
    db = SessionLocal()
    test_password = "SecurePassword2026!"
    hashed_pwd = get_password_hash(test_password)

    # 1. Admin User
    admin = db.query(User).filter(User.email == "otp_admin_test@corpsec.co.ke").first()
    if not admin:
        admin = User(
            email="otp_admin_test@corpsec.co.ke",
            phone="+254700000001",
            password_hash=hashed_pwd,
            role=UserRole.ADMIN.value,
            status=UserStatus.ACTIVE.value,
            full_name="Admin Test User"
        )
        db.add(admin)
    else:
        admin.password_hash = hashed_pwd
        admin.status = UserStatus.ACTIVE.value

    # 2. Supervisor User
    supervisor = db.query(User).filter(User.email == "otp_supervisor_test@corpsec.co.ke").first()
    if not supervisor:
        supervisor = User(
            email="otp_supervisor_test@corpsec.co.ke",
            phone="+254700000002",
            password_hash=hashed_pwd,
            role=UserRole.SUPERVISOR.value,
            status=UserStatus.ACTIVE.value,
            full_name="Supervisor Test User"
        )
        db.add(supervisor)
    else:
        supervisor.password_hash = hashed_pwd
        supervisor.status = UserStatus.ACTIVE.value

    # 3. Staff / HR User
    staff = db.query(User).filter(User.email == "otp_staff_test@corpsec.co.ke").first()
    if not staff:
        staff = User(
            email="otp_staff_test@corpsec.co.ke",
            phone="+254700000003",
            password_hash=hashed_pwd,
            role=UserRole.HR.value,
            status=UserStatus.ACTIVE.value,
            full_name="Staff HR Test User"
        )
        db.add(staff)
    else:
        staff.password_hash = hashed_pwd
        staff.status = UserStatus.ACTIVE.value

    # 4. Guard User
    guard_emp = db.query(Guard).filter(
        (Guard.employee_number == "CS-TEST-OTP") | (Guard.national_id == "99887766")
    ).first()
    if not guard_emp:
        guard_emp = Guard(
            employee_number="CS-TEST-OTP",
            full_name="Guard Test User",
            national_id="99887766",
            phone="+254700000004",
            email="otp_guard_test@corpsec.co.ke",
            hire_date=datetime.date(2025, 1, 1),
            status="ACTIVE"
        )
        db.add(guard_emp)
        db.commit()
        db.refresh(guard_emp)

    guard_user = db.query(User).filter(User.email == "otp_guard_test@corpsec.co.ke").first()
    if not guard_user:
        guard_user = User(
            email="otp_guard_test@corpsec.co.ke",
            phone="+254700000004",
            password_hash=hashed_pwd,
            role=UserRole.GUARD.value,
            status=UserStatus.ACTIVE.value,
            guard_id=guard_emp.id,
            full_name="Guard Test User"
        )
        db.add(guard_user)
    else:
        guard_user.password_hash = hashed_pwd
        guard_user.status = UserStatus.ACTIVE.value
        guard_user.guard_id = guard_emp.id

    db.commit()
    db.close()

    return {
        "password": test_password,
        "admin_email": "otp_admin_test@corpsec.co.ke",
        "supervisor_email": "otp_supervisor_test@corpsec.co.ke",
        "staff_email": "otp_staff_test@corpsec.co.ke",
        "guard_email": "otp_guard_test@corpsec.co.ke",
    }


def test_role_check_function_logic():
    """Verify compliance of requiresOTPVerification function against all role constraints."""
    # MUST bypass OTP for Guard
    assert requiresOTPVerification("GUARD") is False
    assert requiresOTPVerification("guard") is False
    assert requiresOTPVerification(UserRole.GUARD.value) is False
    assert requiresOTPVerification("SECURITY GUARD") is False

    # MUST enforce OTP for System Admin, Supervisor, and Staff
    assert requiresOTPVerification("ADMIN") is True
    assert requiresOTPVerification("admin") is True
    assert requiresOTPVerification("System Admin") is True
    assert requiresOTPVerification("SUPERVISOR") is True
    assert requiresOTPVerification("Field Supervisor") is True
    assert requiresOTPVerification("STAFF") is True
    assert requiresOTPVerification("HR") is True
    assert requiresOTPVerification("HR Manager") is True
    assert requiresOTPVerification(None) is True  # Fail secure


def test_csprng_otp_generation():
    """Verify cryptographic security and properties of generated numeric OTP."""
    otp = generateSecureOTP(6)
    assert len(otp) == 6
    assert otp.isdigit()

    # Generate a sample set to verify high entropy / uniqueness
    sample = {generateSecureOTP(6) for _ in range(50)}
    assert len(sample) == 50  # No immediate collisions in small random sample


def test_guard_login_bypasses_otp(client, test_users):
    """
    Role Constraint: MUST BYPASS OTP verification for the role: 'Guard'.
    Guards must login immediately with just username and password.
    """
    res = client.post(
        "/api/v1/auth/login",
        json={"email": test_users["guard_email"], "password": test_users["password"]}
    )
    assert res.status_code == 200
    data = res.json()
    assert data.get("otp_required") is False
    assert data.get("access_token") is not None
    assert len(data.get("access_token")) > 20
    assert data.get("role") == "GUARD"


def test_admin_login_triggers_otp(client, test_users):
    """
    Role Constraint: MUST enforce OTP verification for role: 'System Admin'.
    Primary login should pause flow and return otp_required=True without issuing token.
    """
    res = client.post(
        "/api/v1/auth/login",
        json={"email": test_users["admin_email"], "password": test_users["password"]}
    )
    assert res.status_code == 200
    data = res.json()
    assert data.get("otp_required") is True
    assert not data.get("access_token")
    assert data.get("email") == test_users["admin_email"]

    # Check that EmailOTP was recorded in the database
    db = SessionLocal()
    otp_record = (
        db.query(EmailOTP)
        .filter(EmailOTP.email == test_users["admin_email"], EmailOTP.is_used == False)
        .order_by(EmailOTP.id.desc())
        .first()
    )
    assert otp_record is not None
    assert len(otp_record.otp_code) == 6
    assert otp_record.otp_code.isdigit()
    assert otp_record.expires_at > datetime.datetime.now()
    db.close()


def test_supervisor_login_triggers_otp(client, test_users):
    """
    Role Constraint: MUST enforce OTP verification for role: 'Supervisor'.
    """
    res = client.post(
        "/api/v1/auth/login",
        json={"email": test_users["supervisor_email"], "password": test_users["password"]}
    )
    assert res.status_code == 200
    data = res.json()
    assert data.get("otp_required") is True
    assert not data.get("access_token")
    assert data.get("role") == "SUPERVISOR"


def test_staff_login_triggers_otp(client, test_users):
    """
    Role Constraint: MUST enforce OTP verification for role: 'Staff' / 'HR'.
    """
    res = client.post(
        "/api/v1/auth/login",
        json={"email": test_users["staff_email"], "password": test_users["password"]}
    )
    assert res.status_code == 200
    data = res.json()
    assert data.get("otp_required") is True
    assert not data.get("access_token")


def test_verify_valid_otp_issues_session_token(client, test_users):
    """
    Functional Flow: Validate correct OTP and issue final JWT session token.
    """
    # Trigger fresh OTP
    res_init = client.post(
        "/api/v1/auth/login",
        json={"email": test_users["admin_email"], "password": test_users["password"]}
    )
    assert res_init.json().get("otp_required") is True

    # Retrieve dispatched OTP from DB
    db = SessionLocal()
    active_otp = (
        db.query(EmailOTP)
        .filter(EmailOTP.email == test_users["admin_email"], EmailOTP.is_used == False)
        .order_by(EmailOTP.id.desc())
        .first()
    )
    code = active_otp.otp_code
    db.close()

    # Submit valid OTP
    res_verify = client.post(
        "/api/v1/auth/verify-otp",
        json={"email": test_users["admin_email"], "otp_code": code}
    )
    assert res_verify.status_code == 200
    data = res_verify.json()
    assert data.get("access_token") is not None
    assert data.get("otp_required") is False
    assert data.get("role") == "ADMIN"
    assert data.get("session_id") is not None


def test_invalid_otp_code_rejected(client, test_users):
    """
    Security check: Submitting incorrect OTP is rejected with 400.
    """
    client.post(
        "/api/v1/auth/login",
        json={"email": test_users["admin_email"], "password": test_users["password"]}
    )
    res_fail = client.post(
        "/api/v1/auth/verify-otp",
        json={"email": test_users["admin_email"], "otp_code": "000000"}
    )
    assert res_fail.status_code == 400
    assert "Incorrect verification code" in res_fail.json().get("detail", "")


def test_otp_one_time_use_enforcement(client, test_users):
    """
    Security check: Ensure an OTP cannot be reused after initial successful verification.
    """
    client.post(
        "/api/v1/auth/login",
        json={"email": test_users["supervisor_email"], "password": test_users["password"]}
    )

    db = SessionLocal()
    active_otp = (
        db.query(EmailOTP)
        .filter(EmailOTP.email == test_users["supervisor_email"], EmailOTP.is_used == False)
        .order_by(EmailOTP.id.desc())
        .first()
    )
    code = active_otp.otp_code
    db.close()

    # First verification: Success
    res1 = client.post(
        "/api/v1/auth/verify-otp",
        json={"email": test_users["supervisor_email"], "otp_code": code}
    )
    assert res1.status_code == 200

    # Second verification with identical code: MUST FAIL
    res2 = client.post(
        "/api/v1/auth/verify-otp",
        json={"email": test_users["supervisor_email"], "otp_code": code}
    )
    assert res2.status_code == 400
    assert "Invalid or expired" in res2.json().get("detail", "")


def test_expired_otp_code_rejected(client, test_users):
    """
    Security check: Expired OTPs (> 5 minutes) are deactivated and rejected.
    """
    client.post(
        "/api/v1/auth/login",
        json={"email": test_users["staff_email"], "password": test_users["password"]}
    )

    db = SessionLocal()
    otp_record = (
        db.query(EmailOTP)
        .filter(EmailOTP.email == test_users["staff_email"], EmailOTP.is_used == False)
        .order_by(EmailOTP.id.desc())
        .first()
    )
    # Manually backdate expiration timestamp
    otp_record.expires_at = datetime.datetime.now() - datetime.timedelta(minutes=10)
    db.commit()
    code = otp_record.otp_code
    db.close()

    res = client.post(
        "/api/v1/auth/verify-otp",
        json={"email": test_users["staff_email"], "otp_code": code}
    )
    assert res.status_code == 400
    assert "expired" in res.json().get("detail", "").lower()


def test_otp_input_sanitization(client, test_users):
    """
    Security check: Sanitizes OTP input against non-numeric and injection vectors.
    """
    # Alphabetical injection
    res1 = client.post(
        "/api/v1/auth/verify-otp",
        json={"email": test_users["admin_email"], "otp_code": "ABCDEF"}
    )
    assert res1.status_code == 400

    # Short code
    res2 = client.post(
        "/api/v1/auth/verify-otp",
        json={"email": test_users["admin_email"], "otp_code": "123"}
    )
    assert res2.status_code == 422  # Pydantic schema validation

    # Long injection attempt
    res3 = client.post(
        "/api/v1/auth/verify-otp",
        json={"email": test_users["admin_email"], "otp_code": "1234567890"}
    )
    assert res3.status_code == 422


def test_resend_otp_endpoint(client, test_users):
    """
    Functional check: Resending OTP issues a fresh code and deactivates the previous code.
    """
    client.post(
        "/api/v1/auth/login",
        json={"email": test_users["admin_email"], "password": test_users["password"]}
    )

    db = SessionLocal()
    first_otp = (
        db.query(EmailOTP)
        .filter(EmailOTP.email == test_users["admin_email"], EmailOTP.is_used == False)
        .order_by(EmailOTP.id.desc())
        .first()
    )
    first_code = first_otp.otp_code
    db.close()

    # Request resend
    res_resend = client.post(
        "/api/v1/auth/resend-otp",
        json={"email": test_users["admin_email"]}
    )
    assert res_resend.status_code == 200
    assert res_resend.json().get("status") == "SUCCESS"

    db = SessionLocal()
    # Check that previous code is deactivated
    old_record = db.query(EmailOTP).filter(EmailOTP.otp_code == first_code).first()
    assert old_record.is_used is True

    # Check new active code
    new_otp = (
        db.query(EmailOTP)
        .filter(EmailOTP.email == test_users["admin_email"], EmailOTP.is_used == False)
        .order_by(EmailOTP.id.desc())
        .first()
    )
    assert new_otp is not None
    assert new_otp.otp_code != first_code
    db.close()
