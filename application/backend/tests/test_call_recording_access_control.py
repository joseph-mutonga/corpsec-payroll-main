import datetime
import pytest
from application.backend.app.core.security import create_access_token, get_password_hash
from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.call_center import CallLog


def get_or_create_user(db, role: str, email: str, name: str) -> tuple[User, str]:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            email=email,
            phone=f"+254700{abs(hash(email)) % 1000000:06d}",
            password_hash=get_password_hash("TestPass123!"),
            full_name=name,
            role=role,
            status=UserStatus.ACTIVE.value
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    token = create_access_token(data={"sub": str(user.id)})
    return user, token


def create_sample_call_log(db, audio_bytes: bytes = b"MOCK_WAV_BINARY_STREAM_CALL_CENTER_SECURE") -> CallLog:
    call = CallLog(
        call_sid="TEST-CALL-SECURE-AUD-01",
        direction="INBOUND",
        caller_number="+254799000111",
        caller_name="Security Testing Client",
        recipient_number="+254207900001",
        status="COMPLETED",
        duration_seconds=55,
        recording_data=audio_bytes,
        recording_content_type="audio/wav",
        recording_url="/api/v1/call-center/recordings/1/stream",
        disposition="Billing Query",
        created_at=datetime.datetime.now()
    )
    db.add(call)
    db.commit()
    db.refresh(call)
    return call


def test_supervisor_cannot_stream_or_download_recorded_audio(client, db):
    """
    STRICT SECURITY REQUIREMENT:
    Supervisors must NOT be able to listen to or stream recorded call audios.
    Only the Admin role is permitted.
    """
    call = create_sample_call_log(db)
    supervisor, sup_token = get_or_create_user(
        db,
        role=UserRole.SUPERVISOR.value,
        email="supervisor.aud_check@corpsec.co.ke",
        name="Field Supervisor Jane"
    )

    # 1. Supervisor attempt to stream audio via Header
    sup_headers = {"Authorization": f"Bearer {sup_token}"}
    res_stream = client.get(f"/api/v1/call-center/recordings/{call.id}/stream", headers=sup_headers)
    assert res_stream.status_code == 403
    assert "Only System Administrators are authorized to listen to or download call recordings" in res_stream.json()["detail"]

    # 2. Supervisor attempt to stream audio via Query Param ?token=
    res_query = client.get(f"/api/v1/call-center/recordings/{call.id}/stream?token={sup_token}")
    assert res_query.status_code == 403
    assert "Only System Administrators are authorized to listen to or download call recordings" in res_query.json()["detail"]

    # 3. Supervisor attempt to download recording
    res_download = client.get(f"/api/v1/call-center/recordings/{call.id}/stream?download=true", headers=sup_headers)
    assert res_download.status_code == 403


def test_guard_cannot_stream_recorded_audio(client, db):
    """Guards must also be rejected with 403 Forbidden."""
    call = create_sample_call_log(db)
    guard, guard_token = get_or_create_user(
        db,
        role=UserRole.GUARD.value,
        email="guard.aud_check@corpsec.co.ke",
        name="Guard John"
    )

    headers = {"Authorization": f"Bearer {guard_token}"}
    res = client.get(f"/api/v1/call-center/recordings/{call.id}/stream", headers=headers)
    assert res.status_code == 403


def test_unauthenticated_cannot_stream_recorded_audio(client, db):
    """Unauthenticated requests must be rejected with 401 Unauthorized."""
    call = create_sample_call_log(db)
    res = client.get(f"/api/v1/call-center/recordings/{call.id}/stream")
    assert res.status_code == 401


def test_admin_can_stream_and_download_recorded_audio(client, db):
    """System Administrator is authorized to stream and download call audio."""
    sample_bytes = b"VERIFIED_SECURE_ADMIN_ONLY_AUDIO_BYTES_12345"
    call = create_sample_call_log(db, audio_bytes=sample_bytes)
    admin, admin_token = get_or_create_user(
        db,
        role=UserRole.ADMIN.value,
        email="admin.aud_check@corpsec.co.ke",
        name="System Admin Joseph"
    )

    headers = {"Authorization": f"Bearer {admin_token}"}

    # Stream
    res_stream = client.get(f"/api/v1/call-center/recordings/{call.id}/stream", headers=headers)
    assert res_stream.status_code == 200
    assert res_stream.content == sample_bytes

    # Stream with Query Token
    res_query = client.get(f"/api/v1/call-center/recordings/{call.id}/stream?token={admin_token}")
    assert res_query.status_code == 200
    assert res_query.content == sample_bytes

    # Download
    res_download = client.get(f"/api/v1/call-center/recordings/{call.id}/stream?download=true", headers=headers)
    assert res_download.status_code == 200
    assert "attachment" in res_download.headers.get("content-disposition", "")
    assert res_download.content == sample_bytes


def test_recording_urls_sanitized_for_supervisors_in_listings(client, db):
    """
    In /recordings and /calls listing APIs, non-admin users (such as supervisors)
    must NOT receive stream_url, recording_url, or download_url.
    """
    call = create_sample_call_log(db)
    supervisor, sup_token = get_or_create_user(
        db,
        role=UserRole.SUPERVISOR.value,
        email="supervisor.listing_check@corpsec.co.ke",
        name="Supervisor Listing Check"
    )
    admin, admin_token = get_or_create_user(
        db,
        role=UserRole.ADMIN.value,
        email="admin.listing_check@corpsec.co.ke",
        name="Admin Listing Check"
    )

    # 1. Supervisor listing /recordings
    res_sup_rec = client.get("/api/v1/call-center/recordings", headers={"Authorization": f"Bearer {sup_token}"})
    assert res_sup_rec.status_code == 200
    sup_records = res_sup_rec.json()
    assert len(sup_records) >= 1
    for r in sup_records:
        assert r.get("recording_url") is None
        assert r.get("stream_url") is None
        assert r.get("download_url") is None
        assert r.get("audio_restricted") is True
        assert r.get("has_db_recording") is False

    # 2. Supervisor listing /calls
    res_sup_calls = client.get("/api/v1/call-center/calls", headers={"Authorization": f"Bearer {sup_token}"})
    assert res_sup_calls.status_code == 200
    sup_calls = res_sup_calls.json()
    assert len(sup_calls) >= 1
    for c in sup_calls:
        assert c.get("stream_url") is None
        assert c.get("recording_url") is None
        assert c.get("recording_restricted") is True

    # 3. Admin listing /recordings receives streaming URLs
    res_admin_rec = client.get("/api/v1/call-center/recordings", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_admin_rec.status_code == 200
    admin_records = res_admin_rec.json()
    admin_target = next((r for r in admin_records if r["id"] == call.id), None)
    assert admin_target is not None
    assert admin_target.get("stream_url") == f"/api/v1/call-center/recordings/{call.id}/stream"
    assert admin_target.get("download_url") == f"/api/v1/call-center/recordings/{call.id}/stream?download=true"
    assert admin_target.get("audio_restricted") is False
