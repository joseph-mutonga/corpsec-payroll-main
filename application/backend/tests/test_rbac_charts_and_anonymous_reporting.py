import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect

from application.backend.app.main import app
from application.backend.app.core.database import SessionLocal, engine
from application.backend.app.core.security import get_password_hash, create_access_token
from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.guard import Guard
from application.backend.app.models.anonymous_message import AnonymousMessage


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture(scope="module")
def setup_rbac_users():
    """
    Creates test accounts for all 5 roles:
    1. System Admin
    2. HR
    3. Supervisor
    4. Staff
    5. Guard
    """
    db = SessionLocal()
    default_pwd = get_password_hash("CorpSecTest2026!")

    users_data = [
        ("rbac_admin@corpsec.co.ke", UserRole.ADMIN.value, "+254711000001", "RBAC Admin"),
        ("rbac_hr@corpsec.co.ke", UserRole.HR.value, "+254711000002", "RBAC HR"),
        ("rbac_supervisor@corpsec.co.ke", UserRole.SUPERVISOR.value, "+254711000003", "RBAC Supervisor"),
        ("rbac_staff@corpsec.co.ke", UserRole.STAFF.value, "+254711000004", "RBAC Staff"),
        ("rbac_guard@corpsec.co.ke", UserRole.GUARD.value, "+254711000005", "RBAC Guard"),
    ]

    tokens = {}

    for email, role, phone, name in users_data:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(
                email=email,
                phone=phone,
                password_hash=default_pwd,
                role=role,
                status=UserStatus.ACTIVE.value,
                full_name=name
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            user.password_hash = default_pwd
            user.role = role
            user.status = UserStatus.ACTIVE.value
            db.commit()
            db.refresh(user)

        tokens[role] = create_access_token(subject=user.id, role=role)

    db.close()
    return tokens


# ==============================================================================
# 1. RESTRICTED CHART ANALYTICS TESTS
# ==============================================================================

def test_chart_analytics_authorized_roles(client, setup_rbac_users):
    """
    Ensures System Admin, HR, Supervisor, and Staff can all access chart analytics endpoints.
    """
    authorized_roles = [
        UserRole.ADMIN.value,
        UserRole.HR.value,
        UserRole.SUPERVISOR.value,
        UserRole.STAFF.value
    ]

    for role in authorized_roles:
        token = setup_rbac_users[role]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Main Dashboard metrics
        res_dash = client.get("/api/v1/chart-analytics/dashboard", headers=headers)
        assert res_dash.status_code == 200, f"Role {role} failed on dashboard metrics: {res_dash.text}"
        data_dash = res_dash.json()
        assert "kpis" in data_dash
        assert "monthly_trend" in data_dash
        assert "site_distribution" in data_dash

        # 2. Monthly trends
        res_trends = client.get("/api/v1/chart-analytics/monthly-trends", headers=headers)
        assert res_trends.status_code == 200, f"Role {role} failed on monthly-trends: {res_trends.text}"
        assert "trends" in res_trends.json()

        # 3. Site distribution
        res_sites = client.get("/api/v1/chart-analytics/site-distribution", headers=headers)
        assert res_sites.status_code == 200, f"Role {role} failed on site-distribution: {res_sites.text}"
        assert "distribution" in res_sites.json()


def test_chart_analytics_guard_forbidden(client, setup_rbac_users):
    """
    Strict Security Enforcement:
    Guards MUST receive a strict 403 Forbidden with explicit clean JSON denial
    when attempting to query chart analytics.
    """
    guard_token = setup_rbac_users[UserRole.GUARD.value]
    headers = {"Authorization": f"Bearer {guard_token}"}

    # Dashboard endpoint
    res_dash = client.get("/api/v1/chart-analytics/dashboard", headers=headers)
    assert res_dash.status_code == 403
    assert "Guard role is not authorized" in res_dash.json().get("detail", "")

    # Monthly trends endpoint
    res_trends = client.get("/api/v1/chart-analytics/monthly-trends", headers=headers)
    assert res_trends.status_code == 403
    assert "Guard role is not authorized" in res_trends.json().get("detail", "")

    # Site distribution endpoint
    res_sites = client.get("/api/v1/chart-analytics/site-distribution", headers=headers)
    assert res_sites.status_code == 403
    assert "Guard role is not authorized" in res_sites.json().get("detail", "")

    # Reports analytics endpoint
    res_rep = client.get("/api/v1/reports/analytics", headers=headers)
    assert res_rep.status_code == 403
    assert "Guard role is not authorized" in res_rep.json().get("detail", "")


def test_chart_analytics_unauthenticated(client):
    """
    Unauthenticated requests must be rejected with 401 Unauthorized.
    """
    res = client.get("/api/v1/chart-analytics/dashboard")
    assert res.status_code == 401


# ==============================================================================
# 2. ANONYMOUS GUARD REPORTING PIPELINE TESTS
# ==============================================================================

def test_anonymous_report_database_schema():
    """
    Compliance & Security Auditing:
    Verify database schema stores ONLY: id, message, created_at.
    Must have NO user_id, guard_id, ip_address, session_id, or foreign keys.
    """
    insp = inspect(engine)
    columns = [col["name"] for col in insp.get_columns("anonymous_messages")]
    
    assert "id" in columns
    assert "message" in columns
    assert "created_at" in columns
    
    forbidden_columns = ["user_id", "guard_id", "username", "ip_address", "ip", "session_id", "token"]
    for col in forbidden_columns:
        assert col not in columns, f"Forbidden tracking column '{col}' found in anonymous_messages table!"

    fks = insp.get_foreign_keys("anonymous_messages")
    assert len(fks) == 0, f"Anonymous messages table must have zero foreign keys, found: {fks}"


def test_guard_submit_anonymous_tip(client, setup_rbac_users):
    """
    A Guard can successfully submit an anonymous tip.
    The database record must decouple sender identity and store only raw text.
    """
    guard_token = setup_rbac_users[UserRole.GUARD.value]
    headers = {"Authorization": f"Bearer {guard_token}"}
    tip_text = "Night shift lighting in Sector 4 is non-operational, posing severe safety hazards."

    res = client.post(
        "/api/v1/anonymous-reporting/submit",
        headers=headers,
        json={"message": tip_text}
    )
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "success"
    assert "identity has not been recorded" in data["message"]
    report_id = data.get("report_id")
    assert report_id is not None

    # Verify directly in database
    db = SessionLocal()
    saved = db.query(AnonymousMessage).filter(AnonymousMessage.id == report_id).first()
    assert saved is not None
    assert tip_text in saved.message
    # Confirm no identity attributes exist on model
    assert not hasattr(saved, "user_id")
    assert not hasattr(saved, "guard_id")
    assert not hasattr(saved, "ip_address")
    db.close()


def test_anonymous_report_input_validation(client, setup_rbac_users):
    """
    Input validation: submissions shorter than 5 characters should be rejected.
    """
    guard_token = setup_rbac_users[UserRole.GUARD.value]
    headers = {"Authorization": f"Bearer {guard_token}"}

    res = client.post(
        "/api/v1/anonymous-reporting/submit",
        headers=headers,
        json={"message": "bad"}
    )
    assert res.status_code in [400, 422]


def test_non_guard_cannot_submit_anonymous_tip(client, setup_rbac_users):
    """
    Role check: Non-guard roles (Admin, HR, Supervisor, Staff) are NOT permitted
    to submit through the Guard anonymous pipeline.
    """
    for role in [UserRole.ADMIN.value, UserRole.HR.value, UserRole.SUPERVISOR.value, UserRole.STAFF.value]:
        token = setup_rbac_users[role]
        headers = {"Authorization": f"Bearer {token}"}
        res = client.post(
            "/api/v1/anonymous-reporting/submit",
            headers=headers,
            json={"message": "Unauthorized attempt from non-guard role."}
        )
        assert res.status_code == 403, f"Role {role} should have been forbidden from submitting tip"


def test_only_system_admin_can_read_and_clear_anonymous_reports(client, setup_rbac_users):
    """
    Access check: Only System Admin has permission to read and clear anonymous messages.
    All other roles (HR, Supervisor, Staff, Guard) must receive HTTP 403.
    """
    admin_token = setup_rbac_users[UserRole.ADMIN.value]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. System Admin can fetch messages
    res_get = client.get("/api/v1/anonymous-reporting/messages", headers=admin_headers)
    assert res_get.status_code == 200
    messages = res_get.json()
    assert isinstance(messages, list)
    assert len(messages) >= 1

    # 2. Non-Admin roles are forbidden from fetching messages
    non_admin_roles = [UserRole.HR.value, UserRole.SUPERVISOR.value, UserRole.STAFF.value, UserRole.GUARD.value]
    for role in non_admin_roles:
        token = setup_rbac_users[role]
        headers = {"Authorization": f"Bearer {token}"}
        res_forbidden = client.get("/api/v1/anonymous-reporting/messages", headers=headers)
        assert res_forbidden.status_code == 403, f"Role {role} was not forbidden from reading anonymous reports!"

        # Non-admin forbidden from deleting
        res_del_forbidden = client.delete("/api/v1/anonymous-reporting/messages", headers=headers)
        assert res_del_forbidden.status_code == 403, f"Role {role} was not forbidden from clearing reports!"

    # 3. System Admin can clear messages
    res_clear = client.delete("/api/v1/anonymous-reporting/messages", headers=admin_headers)
    assert res_clear.status_code == 200
    assert res_clear.json()["status"] == "success"

    # Confirm table is now empty
    res_after = client.get("/api/v1/anonymous-reporting/messages", headers=admin_headers)
    assert res_after.status_code == 200
    assert len(res_after.json()) == 0


# ==============================================================================
# 3. OPERATIONS TEAM CHAT TESTS (ADMIN, HR, STAFF, SUPERVISORS)
# ==============================================================================

def test_team_chat_authorized_roles(client, setup_rbac_users):
    """
    Ensures System Admin, HR, Supervisor, and Staff can all post and view team chat messages.
    """
    authorized_roles = [
        UserRole.ADMIN.value,
        UserRole.HR.value,
        UserRole.SUPERVISOR.value,
        UserRole.STAFF.value
    ]

    for role in authorized_roles:
        token = setup_rbac_users[role]
        headers = {"Authorization": f"Bearer {token}"}

        # Post message
        msg_payload = {"message": f"Operational briefing from role {role}."}
        res_post = client.post("/api/v1/team-chat/messages", headers=headers, json=msg_payload)
        assert res_post.status_code == 201, f"Role {role} failed to post team message: {res_post.text}"
        data = res_post.json()
        assert data["sender_role"] == role
        assert "Operational briefing" in data["message"]

        # Read messages
        res_get = client.get("/api/v1/team-chat/messages", headers=headers)
        assert res_get.status_code == 200, f"Role {role} failed to get team messages: {res_get.text}"
        messages = res_get.json()
        assert isinstance(messages, list)
        assert len(messages) >= 1


def test_team_chat_guard_forbidden(client, setup_rbac_users):
    """
    Strict Security Enforcement:
    Guards MUST receive a strict 403 Forbidden when attempting to post or read team chat messages.
    """
    guard_token = setup_rbac_users[UserRole.GUARD.value]
    headers = {"Authorization": f"Bearer {guard_token}"}

    # Attempt to read messages
    res_get = client.get("/api/v1/team-chat/messages", headers=headers)
    assert res_get.status_code == 403
    assert "Guard role is not authorized" in res_get.json().get("detail", "")

    # Attempt to post a message
    res_post = client.post(
        "/api/v1/team-chat/messages",
        headers=headers,
        json={"message": "Unauthorized guard chat message"}
    )
    assert res_post.status_code == 403
    assert "Guard role is not authorized" in res_post.json().get("detail", "")


def test_team_chat_unauthenticated(client):
    """
    Unauthenticated users cannot access team chat.
    """
    res = client.get("/api/v1/team-chat/messages")
    assert res.status_code == 401


def test_team_chat_unread_tracking_and_mark_read(client, setup_rbac_users):
    """
    Verifies unread message tracking, contact unread badges, and read status for blue ticks:
    1. Supervisor sends DM to Admin.
    2. Admin sees unread count on Supervisor contact.
    3. Admin checks /unread-count endpoint.
    4. Admin marks messages as read.
    5. Sender sees is_read == True (double blue ticks).
    """
    db = SessionLocal()
    admin_user = db.query(User).filter(User.email == "rbac_admin@corpsec.co.ke").first()
    supervisor_user = db.query(User).filter(User.email == "rbac_supervisor@corpsec.co.ke").first()
    db.close()

    admin_token = setup_rbac_users[UserRole.ADMIN.value]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    sup_token = setup_rbac_users[UserRole.SUPERVISOR.value]
    sup_headers = {"Authorization": f"Bearer {sup_token}"}

    # 1. Supervisor sends a direct message to Admin
    post_res = client.post(
        "/api/v1/team-chat/messages",
        headers=sup_headers,
        json={
            "message": "Urgent supervisor report for admin review",
            "receiver_id": admin_user.id
        }
    )
    assert post_res.status_code == 201
    msg_data = post_res.json()
    assert msg_data["is_read"] is False

    # 2. Admin retrieves contacts directory - supervisor contact must have unread_count >= 1
    contacts_res = client.get("/api/v1/team-chat/contacts", headers=admin_headers)
    assert contacts_res.status_code == 200
    contacts_data = contacts_res.json()
    assert "total_unread" in contacts_data
    assert contacts_data["total_unread"] >= 1

    sup_contact = next((c for c in contacts_data["contacts"] if c.get("user_id") == supervisor_user.id), None)
    assert sup_contact is not None
    assert sup_contact["unread_count"] >= 1

    # 3. Check /unread-count endpoint for Admin
    unread_res = client.get("/api/v1/team-chat/unread-count", headers=admin_headers)
    assert unread_res.status_code == 200
    assert unread_res.json()["total_unread"] >= 1
    assert unread_res.json()["dm_unread"] >= 1

    # 4. Admin marks the direct message as read
    mark_res = client.post(
        "/api/v1/team-chat/mark-read",
        headers=admin_headers,
        json={"contact_id": f"dm_{supervisor_user.id}", "user_id": supervisor_user.id}
    )
    assert mark_res.status_code == 200
    assert mark_res.json()["marked_read"] is True

    # 5. Contacts list for Admin now shows unread_count == 0 for supervisor
    contacts_after = client.get("/api/v1/team-chat/contacts", headers=admin_headers).json()
    sup_contact_after = next((c for c in contacts_after["contacts"] if c.get("user_id") == supervisor_user.id), None)
    assert sup_contact_after["unread_count"] == 0

    # 6. Supervisor reads their conversation with Admin - outgoing message is now is_read == True (blue ticks)
    sup_view_res = client.get(
        f"/api/v1/team-chat/messages?receiver_id={admin_user.id}&auto_mark_read=false",
        headers=sup_headers
    )
    assert sup_view_res.status_code == 200
    sup_view_msgs = sup_view_res.json()
    our_msg = next((m for m in sup_view_msgs if m["id"] == msg_data["id"]), None)
    assert our_msg is not None
    assert our_msg["is_read"] is True


def test_team_chat_file_upload_and_send_attachment(client, setup_rbac_users):
    """
    Verifies that:
    1. Authorized roles (Admin, HR, Supervisor, Staff) can upload attachments via /team-chat/upload
    2. Guard role is forbidden (403) from uploading attachments
    3. Messages can be sent with an attachment + text caption
    4. Messages can be sent with an attachment ONLY (no text message)
    5. Authorized roles can download/stream the attachment file
    6. Guards or unauthenticated users are forbidden from retrieving attachments
    """
    import io

    admin_token = setup_rbac_users[UserRole.ADMIN.value]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    guard_token = setup_rbac_users[UserRole.GUARD.value]
    guard_headers = {"Authorization": f"Bearer {guard_token}"}

    # 1. Guard attempts to upload a file -> 403 Forbidden
    test_file_bytes = b"Sample CorpSec Incident Report PDF Content"
    guard_upload = client.post(
        "/api/v1/team-chat/upload",
        headers=guard_headers,
        files={"file": ("incident_report.pdf", io.BytesIO(test_file_bytes), "application/pdf")}
    )
    assert guard_upload.status_code == 403

    # 2. Admin uploads a file -> 200 OK
    admin_upload = client.post(
        "/api/v1/team-chat/upload",
        headers=admin_headers,
        files={"file": ("incident_report.pdf", io.BytesIO(test_file_bytes), "application/pdf")}
    )
    assert admin_upload.status_code == 200
    upload_data = admin_upload.json()
    assert "file_url" in upload_data
    assert upload_data["file_name"] == "incident_report.pdf"
    assert upload_data["file_type"] == "application/pdf"
    assert upload_data["file_size"] == len(test_file_bytes)

    # 3. Admin sends a message with an attachment and caption
    msg_with_caption = client.post(
        "/api/v1/team-chat/messages",
        headers=admin_headers,
        json={
            "channel": "group_operations",
            "message": "Please review this incident report document",
            "attachment_url": upload_data["file_url"],
            "attachment_name": upload_data["file_name"],
            "attachment_type": upload_data["file_type"],
            "attachment_size": upload_data["file_size"]
        }
    )
    assert msg_with_caption.status_code == 201
    cap_data = msg_with_caption.json()
    assert cap_data["message"] == "Please review this incident report document"
    assert cap_data["attachment_name"] == "incident_report.pdf"
    assert cap_data["attachment_url"] == upload_data["file_url"]

    # 4. Supervisor sends a message with attachment ONLY (no text caption)
    sup_token = setup_rbac_users[UserRole.SUPERVISOR.value]
    sup_headers = {"Authorization": f"Bearer {sup_token}"}

    img_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    img_upload = client.post(
        "/api/v1/team-chat/upload",
        headers=sup_headers,
        files={"file": ("site_patrol.png", io.BytesIO(img_bytes), "image/png")}
    )
    assert img_upload.status_code == 200
    img_data = img_upload.json()

    msg_without_text = client.post(
        "/api/v1/team-chat/messages",
        headers=sup_headers,
        json={
            "channel": "group_operations",
            "attachment_url": img_data["file_url"],
            "attachment_name": img_data["file_name"],
            "attachment_type": img_data["file_type"],
            "attachment_size": img_data["file_size"]
        }
    )
    assert msg_without_text.status_code == 201
    img_msg_data = msg_without_text.json()
    assert img_msg_data["attachment_name"] == "site_patrol.png"
    assert img_msg_data["attachment_url"] == img_data["file_url"]

    # 5. Download the uploaded file via attachment_url
    filename = upload_data["file_url"].split("/")[-1]
    download_res = client.get(
        f"/api/v1/team-chat/attachments/{filename}",
        headers=admin_headers
    )
    assert download_res.status_code == 200
    assert download_res.content == test_file_bytes

    # 6. Guard cannot download attachments -> 403
    guard_download = client.get(
        f"/api/v1/team-chat/attachments/{filename}",
        headers=guard_headers
    )
    assert guard_download.status_code == 403



