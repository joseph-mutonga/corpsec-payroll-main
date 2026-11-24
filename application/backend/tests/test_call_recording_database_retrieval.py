import io
import datetime
import pytest
from application.backend.app.core.security import create_access_token, get_password_hash
from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.call_center import CallLog


def get_or_create_admin(db) -> tuple[User, str]:
    admin = db.query(User).filter(User.role == UserRole.ADMIN.value).first()
    if not admin:
        admin = User(
            email="admin_rec_test@corpsec.co.ke",
            phone="+254700998877",
            password_hash=get_password_hash("TestPass123!"),
            full_name="Admin Recording Tester",
            role=UserRole.ADMIN.value,
            status=UserStatus.ACTIVE.value
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
    token = create_access_token(data={"sub": str(admin.id)})
    return admin, token


def create_sample_call_with_recording(db, audio_bytes: bytes = b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00D\xac\x00\x00\x88X\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00") -> CallLog:
    call = CallLog(
        call_sid="TEST-CALL-REC-001",
        direction="INBOUND",
        caller_number="+254711223344",
        caller_name="Recording Test Client",
        recipient_number="+254207900000",
        status="COMPLETED",
        duration_seconds=45,
        recording_data=audio_bytes,
        recording_content_type="audio/wav",
        recording_url="/api/v1/call-center/recordings/1/stream",
        disposition="Issue Resolved",
        created_at=datetime.datetime.now()
    )
    db.add(call)
    db.commit()
    db.refresh(call)
    return call


def test_call_recording_database_retrieval_stream(client, db):
    """
    Verifies that calling /api/v1/call-center/recordings/{id}/stream
    retrieves audio bytes directly from the database (call_logs.recording_data)
    for authorized administrators and returns appropriate headers.
    """
    admin, token = get_or_create_admin(db)
    sample_bytes = b"SAMPLE_AUDIO_BINARY_STORED_IN_DATABASE_FOR_CORPSEC_CALL_LOGS_TABLE"
    call = create_sample_call_with_recording(db, audio_bytes=sample_bytes)

    # 1. Unauthenticated request should be rejected with 401
    unauth_res = client.get(f"/api/v1/call-center/recordings/{call.id}/stream")
    assert unauth_res.status_code == 401

    # 2. Authenticated Admin request succeeds with 200
    headers = {"Authorization": f"Bearer {token}"}
    response = client.get(f"/api/v1/call-center/recordings/{call.id}/stream", headers=headers)
    assert response.status_code == 200
    assert response.headers.get("x-audio-source") == "database"
    assert response.headers.get("x-database-retrieved") == "true"
    assert response.content == sample_bytes
    assert int(response.headers.get("content-length")) == len(sample_bytes)

    # 3. Query param token also succeeds (for browser <audio src="...?token=...">)
    query_res = client.get(f"/api/v1/call-center/recordings/{call.id}/stream?token={token}")
    assert query_res.status_code == 200
    assert query_res.content == sample_bytes


def test_call_recording_database_range_seeking(client, db):
    """
    Verifies that HTTP Range requests are served directly from the database bytes
    with HTTP 206 Partial Content.
    """
    admin, token = get_or_create_admin(db)
    sample_bytes = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_TEST_AUDIO_BYTES_FOR_SEEKING"
    call = create_sample_call_with_recording(db, audio_bytes=sample_bytes)

    headers = {"Range": "bytes=10-25", "Authorization": f"Bearer {token}"}
    response = client.get(f"/api/v1/call-center/recordings/{call.id}/stream", headers=headers)
    assert response.status_code == 206
    assert response.headers.get("x-audio-source") == "database"
    assert response.headers.get("content-range") == f"bytes 10-25/{len(sample_bytes)}"
    assert response.content == sample_bytes[10:26]
    assert len(response.content) == 16


def test_call_recording_download(client, db):
    """
    Verifies download query parameter serves attachment directly from database.
    """
    admin, token = get_or_create_admin(db)
    sample_bytes = b"AUDIO_DATA_DOWNLOAD_VERIFICATION_BYTES"
    call = create_sample_call_with_recording(db, audio_bytes=sample_bytes)

    headers = {"Authorization": f"Bearer {token}"}
    response = client.get(f"/api/v1/call-center/recordings/{call.id}/stream?download=true", headers=headers)
    assert response.status_code == 200
    assert "attachment" in response.headers.get("content-disposition", "")
    assert response.headers.get("x-audio-source") == "database"
    assert response.content == sample_bytes


def test_list_call_recordings_retrieved_from_database(client, db):
    """
    Verifies that GET /api/v1/call-center/recordings retrieves calls from database
    marked with retrieved_from: 'database' and has_db_recording: True.
    """
    admin, token = get_or_create_admin(db)
    call = create_sample_call_with_recording(db)

    response = client.get(
        "/api/v1/call-center/recordings",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    found = next((r for r in data if r["id"] == call.id), None)
    assert found is not None
    assert found.get("retrieved_from") == "database"
    assert found.get("has_db_recording") is True
    assert found.get("stream_url") == f"/api/v1/call-center/recordings/{call.id}/stream"


def test_save_call_recording_persists_to_database(client, db):
    """
    Verifies that uploading a call recording binary persists directly into call_logs.recording_data.
    """
    admin, token = get_or_create_admin(db)
    call = create_sample_call_with_recording(db)

    new_audio_bytes = b"NEW_RECORDING_BYTES_SAVED_TO_DATABASE"
    file_payload = ("call_mic.wav", io.BytesIO(new_audio_bytes), "audio/wav")

    response = client.post(
        f"/api/v1/call-center/calls/{call.id}/recording",
        files={"file": file_payload},
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"

    # Refresh DB row and assert bytes are saved in MySQL / SQLite
    db.refresh(call)
    assert call.recording_data == new_audio_bytes

    # Verify stream retrieves this exact binary from database
    stream_resp = client.get(
        f"/api/v1/call-center/recordings/{call.id}/stream",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert stream_resp.status_code == 200
    assert stream_resp.content == new_audio_bytes
    assert stream_resp.headers.get("x-audio-source") == "database"
    assert stream_resp.headers.get("x-database-retrieved") == "true"


def test_sync_recordings_to_database(client, db):
    """
    Verifies that POST /api/v1/call-center/recordings/sync-database ensures all calls have recordings.
    """
    admin, token = get_or_create_admin(db)
    # Create call without recording_data
    call = CallLog(
        call_sid="TEST-CALL-EMPTY-REC",
        direction="INBOUND",
        caller_number="+254700112233",
        recipient_number="+254207900000",
        status="COMPLETED",
        recording_data=None,
        recording_url=None,
        created_at=datetime.datetime.now()
    )
    db.add(call)
    db.commit()
    db.refresh(call)
    assert call.recording_data is None

    response = client.post(
        "/api/v1/call-center/recordings/sync-database",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"

    db.refresh(call)
    assert call.recording_data is not None
    assert len(call.recording_data) > 0


def test_admin_with_email_sub_can_stream_and_listen(client, db):
    """
    Verifies that an administrator authenticated with email-based token
    can list and stream/listen to call recordings retrieved directly from database.
    """
    admin, _ = get_or_create_admin(db)
    token = create_access_token(data={"sub": admin.email, "role": "ADMIN"})
    call = create_sample_call_with_recording(db)

    # 1. List recordings with this token
    resp = client.get("/api/v1/call-center/recordings", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    recordings = resp.json()
    assert any(r["id"] == call.id for r in recordings)

    # 2. Stream audio (listen / playback)
    stream_resp = client.get(f"/api/v1/call-center/recordings/{call.id}/stream", headers={"Authorization": f"Bearer {token}"})
    assert stream_resp.status_code == 200
    assert stream_resp.headers.get("x-database-retrieved") == "true"
