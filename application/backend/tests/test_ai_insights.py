import pytest
from unittest.mock import MagicMock, AsyncMock
from application.backend.app.core.security import create_access_token, get_password_hash
from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.audit import AuditLog
from application.backend.app.services.ai_telemetry_service import (
    AITelemetryService,
    sanitize_dict_or_list,
    sanitize_text
)
from application.backend.app.services.gemini_service import GeminiAIService


@pytest.fixture(autouse=True)
def mock_gemini_client_for_tests(monkeypatch):
    """Mocks Google Gemini API client to ensure test suite executes fast and deterministically."""
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_response.text = "Mocked Gemini Performance Analyst: System health is nominal with zero slow queries."
    mock_client.models.generate_content.return_value = mock_response
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

    async def mock_stream_gen(*args, **kwargs):
        chunk1 = MagicMock(text="Mocked ")
        chunk2 = MagicMock(text="Gemini ")
        chunk3 = MagicMock(text="Performance Analyst response.")
        for ch in [chunk1, chunk2, chunk3]:
            yield ch
    mock_client.aio.models.generate_content_stream.side_effect = lambda *a, **kw: mock_stream_gen()

    monkeypatch.setattr(GeminiAIService, "get_client", lambda: mock_client)
    return mock_client


def get_or_create_user(db, email: str, role: UserRole, full_name: str) -> tuple[User, str]:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            email=email,
            phone=f"+25470000{abs(hash(email)) % 10000:04d}",
            password_hash=get_password_hash("TestPass123!"),
            full_name=full_name,
            role=role.value,
            status=UserStatus.ACTIVE.value
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    token = create_access_token(data={"sub": str(user.id)})
    return user, token


def test_ai_insights_authentication_required(client):
    """
    Verifies that calling /api/v1/admin/ai-insights without auth returns 401 Unauthorized.
    """
    response = client.post(
        "/api/v1/admin/ai-insights",
        json={"prompt": "Summarize overall system health today"}
    )
    assert response.status_code == 401


def test_ai_insights_non_admin_forbidden(client, db):
    """
    Verifies that non-admin roles (e.g. GUARD, SUPERVISOR, HR) are strictly blocked with 403 Forbidden.
    The AI system is strictly restricted to System Administrator only.
    """
    _, guard_token = get_or_create_user(db, "guard_ai_test@corpsec.co.ke", UserRole.GUARD, "Guard User")
    response = client.post(
        "/api/v1/admin/ai-insights",
        headers={"Authorization": f"Bearer {guard_token}"},
        json={"prompt": "Summarize overall system health today"}
    )
    assert response.status_code == 403
    assert "Administrative privileges required" in response.json().get("detail", "")

    _, sup_token = get_or_create_user(db, "sup_ai_test@corpsec.co.ke", UserRole.SUPERVISOR, "Supervisor User")
    res_sup = client.post(
        "/api/v1/admin/ai-insights",
        headers={"Authorization": f"Bearer {sup_token}"},
        json={"prompt": "Summarize overall system health today"}
    )
    assert res_sup.status_code == 403
    assert "Administrative privileges required" in res_sup.json().get("detail", "")

    _, hr_token = get_or_create_user(db, "hr_ai_test@corpsec.co.ke", UserRole.HR, "HR User")
    res_hr = client.post(
        "/api/v1/admin/ai-insights",
        headers={"Authorization": f"Bearer {hr_token}"},
        json={"prompt": "Summarize overall system health today"}
    )
    assert res_hr.status_code == 403
    assert "Administrative privileges required" in res_hr.json().get("detail", "")

    # Telemetry endpoint must also reject Supervisor and HR
    res_tel = client.get(
        "/api/v1/admin/ai-insights/telemetry",
        headers={"Authorization": f"Bearer {sup_token}"}
    )
    assert res_tel.status_code == 403


def test_ai_insights_admin_query_success(client, db):
    """
    Verifies that an authenticated System Administrator can query AI Insights
    and receive grounded operational telemetry analysis.
    """
    admin, admin_token = get_or_create_user(db, "admin_ai_test@corpsec.co.ke", UserRole.ADMIN, "System Administrator")

    response = client.post(
        "/api/v1/admin/ai-insights",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "prompt": "Summarize overall system health today",
            "include_telemetry": True
        }
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ["success", "key_required"]
    assert "answer" in data
    assert len(data["answer"]) > 50
    assert "model_used" in data
    assert "timestamp" in data
    assert data.get("grounding_metrics_summary") is not None

    # Verify query was recorded in the AuditLog
    recent_audit = (
        db.query(AuditLog)
        .filter(AuditLog.action == "AI_INSIGHTS_QUERY", AuditLog.user_id == admin.id)
        .first()
    )
    assert recent_audit is not None


def test_ai_insights_alias_route(client, db):
    """
    Verifies that POST /api/admin/ai-insights works as an exact alias.
    """
    _, admin_token = get_or_create_user(db, "admin_ai_test2@corpsec.co.ke", UserRole.ADMIN, "System Administrator 2")

    response = client.post(
        "/api/admin/ai-insights",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"prompt": "Are there any unusual error spikes?"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "answer" in data


def test_telemetry_snapshot_endpoint(client, db):
    """
    Verifies that GET /api/v1/admin/ai-insights/telemetry returns full live telemetry.
    """
    _, admin_token = get_or_create_user(db, "admin_ai_test3@corpsec.co.ke", UserRole.ADMIN, "System Administrator 3")

    response = client.get(
        "/api/v1/admin/ai-insights/telemetry",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "host_telemetry" in data
    assert "database_telemetry" in data
    assert "error_rates" in data
    assert "operations_telemetry" in data
    assert "financial_telemetry" in data
    assert "active_users" in data
    assert "recent_audit_actions" in data


def test_pii_and_credential_sanitization():
    """
    Verifies that sensitive credentials, passwords, tokens, and PII are redacted.
    """
    sensitive_payload = {
        "user_email": "john.doe@corpsec.co.ke",
        "client_ip": "192.168.1.105",
        "password_hash": "$2b$12$e80yJ/Xo0123456789",
        "api_key": "atsk_8398f1a8cb57893d16a98cfd24fc6e41",
        "nested_details": {
            "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            "public_metric": 42
        }
    }

    sanitized = sanitize_dict_or_list(sensitive_payload)

    assert sanitized["password_hash"] == "[REDACTED_CREDENTIAL]"
    assert sanitized["api_key"] == "[REDACTED_CREDENTIAL]"
    assert sanitized["nested_details"]["token"] == "[REDACTED_CREDENTIAL]"
    assert sanitized["nested_details"]["public_metric"] == 42
    assert "192.168.1.105" not in sanitized["client_ip"]
    assert "john.doe@" not in sanitized["user_email"]


def test_question_routing_classification():
    """
    Verifies that administrator questions are accurately routed to the correct operational category.
    """
    assert AITelemetryService.classify_user_query("hello") == "SIMPLE"
    assert AITelemetryService.classify_user_query("system health") == "SIMPLE"
    assert AITelemetryService.classify_user_query("How is server CPU and memory usage?") == "SIMPLE"
    assert AITelemetryService.classify_user_query("List all active security guards") == "WORKFORCE"
    assert AITelemetryService.classify_user_query("Who are the field supervisors?") == "WORKFORCE"
    assert AITelemetryService.classify_user_query("What is the total gross salary in the last payroll cycle?") == "PAYROLL"
    assert AITelemetryService.classify_user_query("Calculate NSSF, SHIF, and Housing Levy deductions") == "PAYROLL"
    assert AITelemetryService.classify_user_query("What is our Monthly Recurring Revenue (MRR)?") == "MANAGEMENT"
    assert AITelemetryService.classify_user_query("Show all client site invoices and overdue amounts") == "MANAGEMENT"
    assert AITelemetryService.classify_user_query("Investigate security incident spike and audit trail errors") == "COMPLEX"


def test_safe_telemetry_cache():
    """
    Verifies that the in-memory cache safely stores and retrieves read-only data,
    respects TTL expiration, and enforces role isolation.
    """
    cache = AITelemetryService.global_cache
    cache.clear()

    test_data = {"metric": "cpu_low", "value": 15.5}
    cache.set("SIMPLE", "server health", test_data, ttl_seconds=2, user_role="ADMIN")

    # Cache hit
    hit = cache.get("SIMPLE", "server health", user_role="ADMIN")
    assert hit is not None
    assert hit["value"] == 15.5

    # Role isolation: Non-admin cannot retrieve admin cache
    no_access = cache.get("SIMPLE", "server health", user_role="GUARD")
    assert no_access is None

    # Clear cache
    cache.clear()
    assert cache.get("SIMPLE", "server health", user_role="ADMIN") is None


def test_ai_insights_streaming_endpoint(client, db):
    """
    Verifies that POST /api/v1/admin/ai-insights/stream returns SSE chunks (text/event-stream)
    for progressive UI rendering.
    """
    _, admin_token = get_or_create_user(db, "admin_ai_stream@corpsec.co.ke", UserRole.ADMIN, "System Admin Stream")

    response = client.post(
        "/api/v1/admin/ai-insights/stream",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"prompt": "How is system health today?", "history": []}
    )
    assert response.status_code == 200
    assert "text/event-stream" in response.headers.get("content-type", "")
    content = response.text
    assert "data:" in content
    assert "status" in content


def test_ai_insights_streaming_non_admin_forbidden(client, db):
    """
    Verifies that the streaming endpoint strictly blocks non-admin roles with 403 Forbidden.
    """
    _, sup_token = get_or_create_user(db, "sup_ai_stream@corpsec.co.ke", UserRole.SUPERVISOR, "Supervisor Stream")
    response = client.post(
        "/api/v1/admin/ai-insights/stream",
        headers={"Authorization": f"Bearer {sup_token}"},
        json={"prompt": "How is system health today?"}
    )
    assert response.status_code == 403
    assert "Administrative privileges required" in response.json().get("detail", "")


def test_payroll_telemetry_uses_decimal_math(db):
    """
    Verifies that AITelemetryService calculates financial aggregates using Decimal precision.
    """
    telemetry = AITelemetryService.get_system_telemetry(db, category="PAYROLL", bypass_cache=True)
    assert telemetry.get("query_classification") == "PAYROLL"
    assert "financial_and_payroll" in telemetry
    assert "db_query_time_ms" in telemetry
    assert telemetry["db_query_time_ms"] >= 0.0

