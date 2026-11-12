import pytest
from datetime import date
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.core.security import get_password_hash


def get_supervisor_headers(client: TestClient, db: Session) -> dict:
    sup_email = "supervisor_restrict_test@corpsec.co.ke"
    sup = db.query(User).filter(User.email == sup_email).first()
    if not sup:
        sup = User(
            email=sup_email,
            password_hash=get_password_hash("SupervisorPass123!"),
            full_name="Restricted Supervisor",
            phone="0722001122",
            role=UserRole.SUPERVISOR.value,
            status=UserStatus.ACTIVE.value
        )
        db.add(sup)
        db.commit()

    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": sup_email, "password": "SupervisorPass123!"}
    )
    assert login_res.status_code == 200, f"Supervisor login failed: {login_res.text}"
    login_data = login_res.json()
    token = login_data.get("access_token")

    # If supervisor enforces OTP verification, complete 2FA verification step
    if not token and login_data.get("otp_required"):
        from application.backend.app.models.email_otp import EmailOTP
        otp_rec = (
            db.query(EmailOTP)
            .filter(EmailOTP.email == sup_email, EmailOTP.is_used == False)
            .order_by(EmailOTP.id.desc())
            .first()
        )
        assert otp_rec is not None
        verify_res = client.post(
            "/api/v1/auth/verify-otp",
            json={"email": sup_email, "otp_code": otp_rec.otp_code}
        )
        assert verify_res.status_code == 200
        token = verify_res.json()["access_token"]

    return {"Authorization": f"Bearer {token}"}


def test_supervisor_forbidden_from_reports_and_analytics(client: TestClient, db: Session):
    """Supervisors must be blocked (HTTP 403) from Performance Overview Analytics & Statutory Reports."""
    headers = get_supervisor_headers(client, db)

    # 1. Performance Overview Analytics
    res_analytics = client.get("/api/v1/reports/analytics", headers=headers)
    assert res_analytics.status_code == 403, f"Expected 403 Forbidden for analytics, got {res_analytics.status_code}"

    # 2. Statutory NSSF Return
    res_nssf = client.get("/api/v1/reports/nssf/1", headers=headers)
    assert res_nssf.status_code == 403, f"Expected 403 Forbidden for NSSF report, got {res_nssf.status_code}"

    # 3. Statutory SHIF Return
    res_shif = client.get("/api/v1/reports/shif/1", headers=headers)
    assert res_shif.status_code == 403, f"Expected 403 Forbidden for SHIF report, got {res_shif.status_code}"

    # 4. Statutory Housing Levy Return
    res_housing = client.get("/api/v1/reports/housing-levy/1", headers=headers)
    assert res_housing.status_code == 403, f"Expected 403 Forbidden for Housing Levy report, got {res_housing.status_code}"

    # 5. Statutory KRA P9 Tax Card
    res_p9 = client.get("/api/v1/reports/p9/1/2026", headers=headers)
    assert res_p9.status_code == 403, f"Expected 403 Forbidden for P9 report, got {res_p9.status_code}"


def test_supervisor_forbidden_from_salary_advances(client: TestClient, db: Session):
    """Supervisors must be blocked (HTTP 403) from Salary Advances management."""
    headers = get_supervisor_headers(client, db)

    # 1. List salary advances
    res_list = client.get("/api/v1/salary-advances", headers=headers)
    assert res_list.status_code == 403, f"Expected 403 Forbidden for salary advances list, got {res_list.status_code}"

    # 2. Issue salary advance
    res_create = client.post(
        "/api/v1/salary-advances",
        json={
            "advance_type": "GUARD",
            "guard_id": 1,
            "amount": 2000.0,
            "disbursement_date": "2026-11-15",
            "payment_method": "M-PESA",
            "reason": "Unauthorized test advance"
        },
        headers=headers
    )
    assert res_create.status_code == 403, f"Expected 403 Forbidden for creating salary advance, got {res_create.status_code}"

    # 3. Summary KPIs
    res_summary = client.get("/api/v1/salary-advances/summary", headers=headers)
    assert res_summary.status_code == 403, f"Expected 403 Forbidden for advances summary, got {res_summary.status_code}"


def test_frontend_supervisor_role_hiding_and_guardrails(client: TestClient):
    """Verify frontend logic completely hides and restricts reports and salary advances for supervisors."""
    res_js = client.get("/static/js/app.js")
    assert res_js.status_code == 200
    js = res_js.text

    # adminOnlyTabs must include both 'reports' and 'salary-advances'
    assert "'salary-advances'" in js
    assert "'reports'" in js

    # switchTab must deny supervisor for both 'reports' and 'salary-advances'
    assert "tabId === 'salary-advances'" in js
    assert "tabId === 'reports'" in js

    # Guard file rendering must check !isSupervisor for advances
    assert "!isSupervisor" in js
    assert "renderGuardAdvancesRows" in js

    # loadSalaryAdvances & loadAnalyticsData must abort if user.role === 'SUPERVISOR'
    assert "if (user && user.role === 'SUPERVISOR') return;" in js

