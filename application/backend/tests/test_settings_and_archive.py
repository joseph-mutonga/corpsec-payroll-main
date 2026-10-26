import os
import pytest
from application.backend.app.models.audit import AuditLog
from application.backend.app.models.payroll import PayrollPeriod
from application.backend.app.models.archive import ArchivePayroll


def get_admin_headers(client):
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@corpsec.co.ke", "password": os.getenv("ADMIN_INITIAL_PASSWORD", "TestAdminSecretPass123!")}
    )
    token = login_resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_get_and_update_settings(client, db):
    headers = get_admin_headers(client)

    # Fetch settings
    get_resp = client.get("/api/v1/settings", headers=headers)
    assert get_resp.status_code == 200
    settings_list = get_resp.json()
    assert len(settings_list) >= 5

    # Update setting
    put_resp = client.put(
        "/api/v1/settings",
        json={"settings": {"company_name": "CorpSec Security Services Ltd", "shif_floor": "350.0"}},
        headers=headers
    )
    assert put_resp.status_code == 200
    updated = put_resp.json()
    shif_item = next(s for s in updated if s["key"] == "shif_floor")
    assert shif_item["value"] == "350.0"

    # Verify audit log entry
    audit = db.query(AuditLog).filter(AuditLog.action == "UPDATE_SYSTEM_SETTINGS").first()
    assert audit is not None


def test_archive_payroll_period(client, db):
    headers = get_admin_headers(client)

    # 1. Create and calculate period
    p_resp = client.post(
        "/api/v1/payroll/periods",
        json={
            "year": 2026,
            "month": 11,
            "period_name": "November 2026",
            "start_date": "2026-11-01",
            "end_date": "2026-11-30"
        },
        headers=headers
    )
    period_id = p_resp.json()["id"]

    client.post(f"/api/v1/payroll/{period_id}/calculate", headers=headers)

    # Resolve any errors
    errors_resp = client.get(f"/api/v1/payroll/{period_id}/errors", headers=headers)
    for err in errors_resp.json():
        client.post(
            f"/api/v1/payroll/errors/{err['id']}/resolve",
            json={"status": "IGNORED", "reason": "Test resolve"},
            headers=headers
        )

    # Confirm period
    client.post(f"/api/v1/payroll/{period_id}/confirm", headers=headers)

    # 2. Archive Period
    archive_resp = client.post(f"/api/v1/archive/{period_id}", headers=headers)
    assert archive_resp.status_code == 200
    arc_data = archive_resp.json()
    assert arc_data["period_name"] == "November 2026"
    assert arc_data["total_guards"] >= 1

    # Verify period status is CLOSED
    db.expire_all()
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
    assert period.status == "CLOSED"

    # 3. Attempting to recalculate closed period should fail with 400
    recalc_resp = client.post(f"/api/v1/payroll/{period_id}/calculate", headers=headers)
    assert recalc_resp.status_code == 400
    assert "Closed" in recalc_resp.json()["detail"]

    # 4. Fetch list of archives
    list_arc_resp = client.get("/api/v1/archive", headers=headers)
    assert list_arc_resp.status_code == 200
    assert len(list_arc_resp.json()) >= 1
