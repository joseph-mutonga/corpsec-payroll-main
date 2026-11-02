import pytest
import re
from fastapi.testclient import TestClient
from application.backend.app.core.security import create_access_token
from application.backend.app.models.user import User


def test_dashboard_html_elements_and_kpis(client: TestClient, db):
    # Fetch index.html
    res = client.get("/")
    assert res.status_code == 200
    html = res.text

    assert 'id="panel-dashboard"' in html, "Dashboard panel #panel-dashboard must exist"

    # Verify all 8 KPI cards
    expected_ids = [
        'id="metric-guards-count"',
        'id="metric-sites-count"',
        'id="metric-dashboard-mrr"',
        'id="metric-gross-payroll"',
        'id="metric-dashboard-invoices"',
        'id="metric-dashboard-assets"',
        'id="metric-anomalies-count"',
        'id="metric-leave-pending-count"',
    ]
    for eid in expected_ids:
        assert eid in html, f"Dashboard metric {eid} must exist in HTML"

    # Verify Dashboard tables and feeds
    assert 'id="dashboard-deployment-body"' in html
    assert 'id="dashboard-activity-body"' in html
    assert 'id="dashboard-leave-body"' in html
    assert 'id="dashboard-incidents-feed"' in html
    assert 'id="dash-live-shift-badge"' in html
    assert 'id="dash-quick-actions-admin"' in html
    assert 'id="dash-quick-actions-supervisor"' in html


def test_dashboard_api_endpoints_data_retrieval(client: TestClient, db):
    admin = db.query(User).filter(User.role == "ADMIN").first()
    token = create_access_token(subject=admin.id, role="ADMIN")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Guards
    res = client.get("/api/v1/guards", headers=headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)

    # 2. Sites
    res = client.get("/api/v1/sites", headers=headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)

    # 3. Analytics (MRR, Active Clients, Assets)
    res = client.get("/api/v1/company/analytics", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "monthly_contract_run_rate" in data
    assert "active_guards_count" in data
    assert "active_sites_count" in data
    assert "total_assets_book_value" in data

    # 4. Assets KPI summary
    res = client.get("/api/v1/assets/summary/kpis", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert "total_assets" in data
    assert "total_asset_value" in data

    # 5. Invoices
    res = client.get("/api/v1/invoices", headers=headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)

    # 6. Incidents
    res = client.get("/api/v1/incidents", headers=headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)

    # 7. Leave
    res = client.get("/api/v1/leave", headers=headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)

    # 8. Attendance
    res = client.get("/api/v1/attendance", headers=headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)
