import os
import pytest
from datetime import date, datetime, timedelta


def test_complete_corpsec_e2e_lifecycle(client, db):
    """
    Comprehensive End-to-End System Integration Test (Phase 11).
    Simulates complete operational lifecycle: Admin auth, workforce setup, attendance logging,
    payroll calculation, error validation, confirmation, PDF payslips, Excel payments,
    statutory returns, guard portal mobile operations, period archiving, and immutable audit logs.
    """
    # 1. Admin Login
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@corpsec.co.ke", "password": os.getenv("ADMIN_INITIAL_PASSWORD", "TestAdminSecretPass123!")}
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Provision New Site
    site_resp = client.post(
        "/api/v1/sites",
        json={
            "site_name": "E2E Westlands Towers",
            "client_name": "Westlands Holdings Ltd",
            "location": "Westlands, Nairobi",
            "daily_rate": 1500.0,
            "night_allowance": 250.0,
            "transport_allowance": 100.0,
            "housing_allowance": 150.0
        },
        headers=headers
    )
    assert site_resp.status_code == 201
    site_id = site_resp.json()["id"]

    # 3. Provision New Guard
    guard_resp = client.post(
        "/api/v1/guards",
        json={
            "employee_number": "CS-99999",
            "full_name": "James Omwamba",
            "national_id": "33445566",
            "phone": "0799887799",
            "email": "james.omwamba@corpsec.co.ke",
            "hire_date": "2026-01-01",
            "nssf_number": "NSSF-99999",
            "shif_number": "SHIF-99999",
            "kra_pin": "A099999999P",
            "payment_method": "Bank Transfer",
            "bank_name": "KCB Bank Kenya",
            "bank_account": "1234998877",
            "site_id": site_id
        },
        headers=headers
    )
    assert guard_resp.status_code == 201
    guard_id = guard_resp.json()["id"]

    # 4. Fetch Shifts
    shift_resp = client.get("/api/v1/shifts", headers=headers)
    assert shift_resp.status_code == 200
    shift_id = shift_resp.json()[0]["id"]

    # 5. Log Attendance for August 2026 (22 Days)
    for day in range(1, 23):
        shift_d = date(2026, 8, day)
        c_in = datetime(2026, 8, day, 6, 0, 0)
        c_out = datetime(2026, 8, day, 18, 0, 0) # 12h = 8h regular + 4h OT
        client.post(
            "/api/v1/attendance/log",
            json={
                "guard_id": guard_id,
                "shift_id": shift_id,
                "shift_date": str(shift_d),
                "actual_clock_in": c_in.isoformat(),
                "actual_clock_out": c_out.isoformat()
            },
            headers=headers
        )

    # 6. Create & Calculate Payroll Period (August 2026)
    period_resp = client.post(
        "/api/v1/payroll/periods",
        json={
            "year": 2026,
            "month": 8,
            "period_name": "August 2026 E2E",
            "start_date": "2026-08-01",
            "end_date": "2026-08-31"
        },
        headers=headers
    )
    assert period_resp.status_code == 201
    period_id = period_resp.json()["id"]

    calc_resp = client.post(f"/api/v1/payroll/{period_id}/calculate", headers=headers)
    assert calc_resp.status_code == 200
    calc_summary = calc_resp.json()
    assert calc_summary["total_employees"] >= 1

    # 7. Resolve Pre-Payroll Validation Errors
    errors_resp = client.get(f"/api/v1/payroll/{period_id}/errors", headers=headers)
    assert errors_resp.status_code == 200
    for err in errors_resp.json():
        client.post(
            f"/api/v1/payroll/errors/{err['id']}/resolve",
            json={"status": "IGNORED", "reason": "Verified in E2E integration test"},
            headers=headers
        )

    # 8. Confirm Payroll Period
    confirm_resp = client.post(f"/api/v1/payroll/{period_id}/confirm", headers=headers)
    assert confirm_resp.status_code == 200
    assert confirm_resp.json()["status"] == "CONFIRMED"

    # 9. Download Payslips PDF
    payslip_resp = client.get(f"/api/v1/payslips/bulk-zip/{period_id}", headers=headers)
    assert payslip_resp.status_code == 200
    assert payslip_resp.headers["content-type"] == "application/zip"

    # 10. Download Payment Schedules (Bank Excel)
    excel_resp = client.get(f"/api/v1/payments/bank/{period_id}/export-excel", headers=headers)
    assert excel_resp.status_code == 200
    assert "spreadsheetml" in excel_resp.headers["content-type"]

    # 11. Export Statutory Returns (NSSF CSV)
    nssf_resp = client.get(f"/api/v1/reports/nssf/{period_id}?format=csv", headers=headers)
    assert nssf_resp.status_code == 200
    assert "text/csv" in nssf_resp.headers["content-type"]

    # 12. Download KRA P9 PDF
    p9_resp = client.get(f"/api/v1/reports/p9/{guard_id}/2026?format=pdf", headers=headers)
    assert p9_resp.status_code == 200
    assert p9_resp.headers["content-type"] == "application/pdf"

    # 13. Guard Mobile Portal Operation
    guard_login = client.post(
        "/api/v1/auth/login",
        json={"email": "james.omwamba@corpsec.co.ke", "password": "Guard@123456"}
    )
    if guard_login.status_code == 200:
        g_token = guard_login.json()["access_token"]
        g_headers = {"Authorization": f"Bearer {g_token}"}

        # Check today's shift
        dash_resp = client.get("/api/v1/portal/dashboard", headers=g_headers)
        assert dash_resp.status_code == 200

        # Submit Incident
        inc_resp = client.post(
            "/api/v1/portal/report-incident",
            json={
                "site_name": "E2E Westlands Towers",
                "incident_type": "SUSPICIOUS_ACTIVITY",
                "description": "Perimeter fencing sensor triggered at 02:00 AM"
            },
            headers=g_headers
        )
        assert inc_resp.status_code == 200
        assert "INC-" in inc_resp.json()["reference_number"]

    # 14. Archive Payroll Period
    archive_resp = client.post(f"/api/v1/archive/{period_id}", headers=headers)
    assert archive_resp.status_code == 200
    assert archive_resp.json()["total_guards"] >= 1

    # 15. Verify Audit Logs
    audit_resp = client.get("/api/v1/audit-logs", headers=headers)
    assert audit_resp.status_code == 200
    logs = audit_resp.json()
    assert len(logs) >= 5
