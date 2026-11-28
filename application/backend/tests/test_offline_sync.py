import io
import uuid
from datetime import datetime, timedelta, date
import pytest

from application.backend.app.core.config import settings
from application.backend.app.core.security import create_access_token
from application.backend.app.models.user import User, UserRole
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.attendance import Attendance
from application.backend.app.models.incident import Incident
from application.backend.app.models.payroll import PayrollPeriod, PayrollRecord
from application.backend.app.services.erp_analytics_service import AttendanceAnalyticsService


def _get_guard_and_admin_tokens(db):
    admin = db.query(User).filter(User.role == UserRole.ADMIN.value).first()
    guard_user = db.query(User).filter(
        User.role == UserRole.GUARD.value,
        User.guard_id.isnot(None)
    ).first()
    other_guard_user = db.query(User).filter(
        User.role == UserRole.GUARD.value,
        User.guard_id.isnot(None),
        User.id != guard_user.id
    ).first()

    admin_token = create_access_token(data={"sub": str(admin.id), "role": admin.role})
    guard_token = create_access_token(data={"sub": str(guard_user.id), "role": guard_user.role})
    other_token = create_access_token(data={"sub": str(other_guard_user.id), "role": other_guard_user.role})
    return (
        guard_user,
        {"Authorization": f"Bearer {guard_token}"},
        {"Authorization": f"Bearer {other_token}"},
        {"Authorization": f"Bearer {admin_token}"},
    )


def test_offline_clock_in_and_out_idempotency_and_timestamps(client, db):
    guard_user, guard_headers, _, _ = _get_guard_and_admin_tokens(db)
    guard = db.query(Guard).filter(Guard.id == guard_user.guard_id).first()
    site = db.query(Site).filter(Site.id == guard.primary_site_id).first()
    in_uuid = f"uuid-in-{uuid.uuid4().hex}"
    out_uuid = f"uuid-out-{uuid.uuid4().hex}"
    dev_in = (datetime.now() - timedelta(minutes=10)).replace(microsecond=0)
    dev_out = (datetime.now() - timedelta(minutes=2)).replace(microsecond=0)

    payload_in = {
        "client_uuid": in_uuid,
        "device_timestamp": dev_in.isoformat(),
        "clock_skew_ms": 1200,
        "latitude": site.latitude if site else None,
        "longitude": site.longitude if site else None,
        "submitted_offline": True,
    }
    res1 = client.post("/api/v1/attendance/clock-in", json=payload_in, headers=guard_headers)
    assert res1.status_code == 200
    data1 = res1.json()
    assert data1["client_uuid"] == in_uuid
    assert data1["submitted_offline"] is True
    assert data1["needs_supervisor_review"] is False
    assert data1["clock_skew_ms"] == 1200
    assert data1["device_clock_in_at"] is not None
    assert data1["server_clock_in_received_at"] is not None
    # Verify clock_skew_ms did NOT silently alter actual_clock_in away from raw device_timestamp
    assert data1["actual_clock_in"] == dev_in.isoformat()

    # Duplicate submission with same client_uuid returns 200 and does NOT create a second record
    res2 = client.post("/api/v1/attendance/clock-in", json=payload_in, headers=guard_headers)
    assert res2.status_code == 200
    assert res2.json()["id"] == data1["id"]
    count = db.query(Attendance).filter(Attendance.client_uuid == in_uuid).count()
    assert count == 1

    # Idempotent offline clock-out linked to parent_clock_in_uuid
    payload_out = {
        "client_uuid": out_uuid,
        "parent_clock_in_uuid": in_uuid,
        "device_timestamp": dev_out.isoformat(),
        "clock_skew_ms": 1200,
        "submitted_offline": True,
    }
    out1 = client.post("/api/v1/attendance/clock-out", json=payload_out, headers=guard_headers)
    assert out1.status_code == 200
    out_data = out1.json()
    assert out_data["id"] == data1["id"]
    assert out_data["clock_out_client_uuid"] == out_uuid
    assert out_data["actual_clock_out"] == dev_out.isoformat()

    out2 = client.post("/api/v1/attendance/clock-out", json=payload_out, headers=guard_headers)
    assert out2.status_code == 200
    assert out2.json()["id"] == data1["id"]


def test_offline_late_sync_clock_skew_and_geofence_flagged_for_review(client, db):
    guard_user, guard_headers, _, admin_headers = _get_guard_and_admin_tokens(db)
    guard = db.query(Guard).filter(Guard.id == guard_user.guard_id).first()
    site = db.query(Site).filter(Site.id == guard.primary_site_id).first()
    site.latitude = -1.2921
    site.longitude = 36.8219
    site.geofence_radius = 200.0
    db.commit()

    # 1. Offline clock-in: 45 minutes late (>30m threshold), 8-minute clock skew (>5m limit), and 1.5km outside geofence
    late_ts = (datetime.now() - timedelta(minutes=45)).replace(microsecond=0)
    res = client.post(
        "/api/v1/attendance/clock-in",
        json={
            "client_uuid": f"uuid-late-{uuid.uuid4().hex}",
            "device_timestamp": late_ts.isoformat(),
            "clock_skew_ms": 8 * 60 * 1000,  # 8 minutes skew
            "latitude": -1.3050,             # ~1.4 km away
            "longitude": 36.8219,
            "submitted_offline": True,
        },
        headers=guard_headers,
    )
    # Must NOT auto-reject offline geofence failure — must record and flag for supervisor review
    assert res.status_code == 200
    att = res.json()
    assert att["submitted_offline"] is True
    assert att["needs_supervisor_review"] is True
    assert "Late offline sync" in att["review_reason"]
    assert "Clock skew exceeds" in att["review_reason"]
    assert "Offline geofence mismatch" in att["review_reason"]

    # 2. Filter via Admin API (?needs_supervisor_review=true)
    flagged_list = client.get("/api/v1/attendance?needs_supervisor_review=true", headers=admin_headers)
    assert flagged_list.status_code == 200
    ids = [r["id"] for r in flagged_list.json()]
    assert att["id"] in ids

    # 3. Approve review via Admin endpoint
    approve_res = client.post(
        f"/api/v1/attendance/{att['id']}/approve-review",
        json={"notes": "Verified gate logbook with site supervisor"},
        headers=admin_headers,
    )
    assert approve_res.status_code == 200
    approved = approve_res.json()
    assert approved["needs_supervisor_review"] is False
    assert approved["reviewed_by"] is not None
    assert approved["reviewed_at"] is not None


def test_orphaned_clock_out_does_not_crash_or_miscount_payroll_and_reports(client, db):
    guard_user, guard_headers, _, admin_headers = _get_guard_and_admin_tokens(db)
    orphan_uuid = f"uuid-orphan-{uuid.uuid4().hex}"
    dev_out = (datetime.now() - timedelta(minutes=5)).replace(microsecond=0)

    # No preceding clock-in exists; offline clock-out arrives with orphaned_clock_in_reason
    res = client.post(
        "/api/v1/attendance/clock-out",
        json={
            "client_uuid": orphan_uuid,
            "orphaned_clock_in_reason": "Parent clock-in failed validation",
            "device_timestamp": dev_out.isoformat(),
            "submitted_offline": True,
        },
        headers=guard_headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["actual_clock_in"] is None
    assert data["actual_clock_out"] == dev_out.isoformat()
    assert data["status"] == "PENDING_REVIEW"
    assert data["needs_supervisor_review"] is True
    assert "Orphaned offline clock-out" in data["review_reason"]
    assert data["regular_hours"] == 0.0

    # 1. Verify Admin Attendance endpoint & Pre-Payroll Anomaly Scanner do not crash
    today_str = date.today().isoformat()
    anom_res = client.get(
        f"/api/v1/attendance/anomalies?start_date={today_str}&end_date={today_str}",
        headers=admin_headers,
    )
    assert anom_res.status_code == 200
    anom_types = [a["anomaly_type"] for a in anom_res.json() if a["guard_id"] == guard_user.guard_id]
    assert "MISSING_CLOCK_IN" in anom_types

    # 2. Verify ERP AttendanceAnalyticsService report does not crash and counts it as incomplete
    report = AttendanceAnalyticsService.get_attendance_report(db, target_date=date.today())
    assert report["incomplete_records_count"] >= 1

    # 3. Verify Payroll calculation does NOT count PENDING_REVIEW orphaned clock-out as a paid PRESENT day
    today = date.today()
    # Add a normal PRESENT shift for another guard so period_has_attendance is True
    other_guard = db.query(Guard).filter(Guard.id != guard_user.guard_id, Guard.status == "ACTIVE").first()
    db.add(Attendance(
        guard_id=other_guard.id,
        shift_id=1,
        site_id=1,
        shift_date=today,
        actual_clock_in=datetime.now() - timedelta(hours=8),
        actual_clock_out=datetime.now(),
        regular_hours=8.0,
        overtime_hours=0.0,
        status="PRESENT",
    ))
    period = PayrollPeriod(
        year=today.year,
        month=today.month,
        period_name=f"Test Period {today.strftime('%b %Y')}",
        start_date=date(today.year, today.month, 1),
        end_date=today,
        status="DRAFT",
    )
    db.add(period)
    db.commit()
    db.refresh(period)

    calc_res = client.post(f"/api/v1/payroll/{period.id}/calculate", headers=admin_headers)
    assert calc_res.status_code == 200
    guard_rec = db.query(PayrollRecord).filter(
        PayrollRecord.payroll_period_id == period.id,
        PayrollRecord.guard_id == guard_user.guard_id,
    ).first()
    assert guard_rec is not None
    assert guard_rec.days_worked == 0


def test_offline_incident_idempotency_future_timestamp_flag_and_photo_upload(client, db, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "INCIDENT_PHOTO_UPLOAD_DIR", str(tmp_path))
    guard_user, guard_headers, other_guard_headers, admin_headers = _get_guard_and_admin_tokens(db)

    inc_uuid = f"uuid-inc-{uuid.uuid4().hex}"
    future_ts = (datetime.now() + timedelta(minutes=15)).replace(microsecond=0)  # >5m future limit

    payload = {
        "incident_type": "Security Breach",
        "description": "Perimeter fence sensor triggered at North Gate during storm.",
        "client_uuid": inc_uuid,
        "device_timestamp": future_ts.isoformat(),
        "clock_skew_ms": 500,
        "latitude": -1.2921,
        "longitude": 36.8219,
        "submitted_offline": True,
    }
    res1 = client.post("/api/v1/guard-portal/incidents", json=payload, headers=guard_headers)
    assert res1.status_code == 200
    inc1 = res1.json()
    assert inc1["client_uuid"] == inc_uuid
    assert inc1["submitted_offline"] is True
    assert inc1["needs_supervisor_review"] is True
    assert "future" in inc1["review_reason"]

    # Duplicate submission with same client_uuid returns existing incident
    res2 = client.post("/api/v1/guard-portal/incidents", json=payload, headers=guard_headers)
    assert res2.status_code == 200
    assert res2.json()["id"] == inc1["id"]
    assert db.query(Incident).filter(Incident.client_uuid == inc_uuid).count() == 1

    inc_id = inc1["id"]

    # Photo validation 1: Other guard cannot upload photo to this incident (owner-only -> 403)
    valid_jpeg = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xd9"
    forbidden_res = client.post(
        f"/api/v1/guard-portal/incidents/{inc_id}/photo",
        files={"file": ("evidence.jpg", io.BytesIO(valid_jpeg), "image/jpeg")},
        headers=other_guard_headers,
    )
    assert forbidden_res.status_code == 403

    # Photo validation 2: Invalid magic bytes (e.g. text/exe masquerading as image/jpeg -> 400)
    bad_magic_res = client.post(
        f"/api/v1/guard-portal/incidents/{inc_id}/photo",
        files={"file": ("fake.jpg", io.BytesIO(b"not-a-real-jpeg-file"), "image/jpeg")},
        headers=guard_headers,
    )
    assert bad_magic_res.status_code == 400
    assert "magic bytes" in bad_magic_res.json()["detail"].lower()

    # Photo validation 3: Exceeds max size -> 413
    monkeypatch.setattr(settings, "INCIDENT_PHOTO_MAX_BYTES", 64)
    too_large_res = client.post(
        f"/api/v1/guard-portal/incidents/{inc_id}/photo",
        files={"file": ("large.jpg", io.BytesIO(valid_jpeg + (b"\x00" * 100)), "image/jpeg")},
        headers=guard_headers,
    )
    assert too_large_res.status_code == 413
    monkeypatch.setattr(settings, "INCIDENT_PHOTO_MAX_BYTES", 5 * 1024 * 1024)

    # Photo validation 4: Valid JPEG upload succeeds with server-generated filename
    ok_photo = client.post(
        f"/api/v1/guard-portal/incidents/{inc_id}/photo",
        files={"file": ("user_named.jpg", io.BytesIO(valid_jpeg), "image/jpeg")},
        headers=guard_headers,
    )
    assert ok_photo.status_code == 200
    photo_path = ok_photo.json()["photo_path"]
    assert photo_path.startswith("/uploads/incidents/inc_")
    assert "user_named" not in photo_path

    # Photo validation 5: Second photo upload to same incident is rejected (409 one photo per incident)
    dup_photo = client.post(
        f"/api/v1/guard-portal/incidents/{inc_id}/photo",
        files={"file": ("second.jpg", io.BytesIO(valid_jpeg), "image/jpeg")},
        headers=guard_headers,
    )
    assert dup_photo.status_code == 409

    # Admin can filter flagged incidents and approve review
    admin_flagged = client.get("/api/v1/incidents?needs_supervisor_review=true", headers=admin_headers)
    assert admin_flagged.status_code == 200
    assert any(i["id"] == inc_id for i in admin_flagged.json())

    approve_inc = client.post(
        f"/api/v1/incidents/{inc_id}/approve-review",
        json={"notes": "Reviewed photo and gate log"},
        headers=admin_headers,
    )
    assert approve_inc.status_code == 200
    assert approve_inc.json()["needs_supervisor_review"] is False
