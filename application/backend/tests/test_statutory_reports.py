import os
import pytest
from application.backend.app.models.audit import AuditLog


def get_admin_headers(client):
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@corpsec.co.ke", "password": os.getenv("ADMIN_INITIAL_PASSWORD", "TestAdminSecretPass123!")}
    )
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def calculated_period(client):
    headers = get_admin_headers(client)
    p_resp = client.post(
        "/api/v1/payroll/periods",
        json={
            "year": 2026,
            "month": 10,
            "period_name": "October 2026",
            "start_date": "2026-10-01",
            "end_date": "2026-10-31"
        },
        headers=headers
    )
    period_id = p_resp.json()["id"]
    client.post(f"/api/v1/payroll/{period_id}/calculate", headers=headers)
    return period_id


def test_nssf_report_json_and_csv(client, calculated_period):
    headers = get_admin_headers(client)

    # JSON
    json_resp = client.get(f"/api/v1/reports/nssf/{calculated_period}", headers=headers)
    assert json_resp.status_code == 200
    data = json_resp.json()
    assert "total_employee_nssf" in data
    assert "grand_total_nssf" in data

    # CSV
    csv_resp = client.get(f"/api/v1/reports/nssf/{calculated_period}?format=csv", headers=headers)
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["content-type"]
    assert "NSSF No" in csv_resp.text


def test_shif_report_json_and_csv(client, calculated_period):
    headers = get_admin_headers(client)

    # JSON
    json_resp = client.get(f"/api/v1/reports/shif/{calculated_period}", headers=headers)
    assert json_resp.status_code == 200
    data = json_resp.json()
    assert "total_shif_deduction" in data

    # CSV
    csv_resp = client.get(f"/api/v1/reports/shif/{calculated_period}?format=csv", headers=headers)
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["content-type"]
    assert "SHIF No" in csv_resp.text


def test_housing_levy_report_json_and_csv(client, calculated_period):
    headers = get_admin_headers(client)

    # JSON
    json_resp = client.get(f"/api/v1/reports/housing-levy/{calculated_period}", headers=headers)
    assert json_resp.status_code == 200
    data = json_resp.json()
    assert "grand_total_housing_levy" in data

    # CSV
    csv_resp = client.get(f"/api/v1/reports/housing-levy/{calculated_period}?format=csv", headers=headers)
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["content-type"]
    assert "Employer Levy" in csv_resp.text


def test_kra_p9_pdf_export(client, calculated_period):
    headers = get_admin_headers(client)

    # Fetch JSON P9 Form
    json_resp = client.get("/api/v1/reports/p9/1/2026", headers=headers)
    assert json_resp.status_code == 200
    data = json_resp.json()
    assert "monthly_rows" in data
    assert len(data["monthly_rows"]) == 12

    # Fetch PDF P9 Form
    pdf_resp = client.get("/api/v1/reports/p9/1/2026?format=pdf", headers=headers)
    assert pdf_resp.status_code == 200
    assert pdf_resp.headers["content-type"] == "application/pdf"
    assert pdf_resp.content.startswith(b"%PDF")


def test_audit_logs_viewer(client, db):
    headers = get_admin_headers(client)

    # Generate an audit entry by performing an action
    client.post(
        "/api/v1/guards",
        json={
            "employee_number": "CS-00994",
            "full_name": "Audit Test Guard",
            "national_id": "99887744",
            "phone": "0799887744",
            "hire_date": "2024-01-01",
            "basic_salary": 16000.0,
            "payment_method": "M-Pesa"
        },
        headers=headers
    )

    # Query audit logs
    logs_resp = client.get("/api/v1/audit-logs?limit=50", headers=headers)
    assert logs_resp.status_code == 200
    logs = logs_resp.json()
    assert len(logs) >= 1
    assert any(log["action"] == "CREATE_GUARD" for log in logs)
