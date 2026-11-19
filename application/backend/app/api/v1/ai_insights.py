import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from application.backend.app.api.deps import get_db, require_admin
from application.backend.app.models.user import User
from application.backend.app.models.audit import AuditLog
from application.backend.app.schemas.ai_insights import (
    AIInsightsRequest,
    AIInsightsResponse,
    TelemetrySnapshotResponse
)
from application.backend.app.services.ai_telemetry_service import AITelemetryService
from application.backend.app.services.gemini_service import GeminiAIService

router = APIRouter(prefix="/admin/ai-insights", tags=["Admin AI Insights"])


@router.post("", response_model=AIInsightsResponse)
@router.post("/", response_model=AIInsightsResponse, include_in_schema=False)
async def query_system_ai_insights(
    payload: AIInsightsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Secure System AI Insights endpoint restricted strictly to authenticated System Administrators.
    Uses Google Gemini API to analyze natural-language questions grounded on real-time system telemetry,
    database metrics, error rates, and operational logs.
    """
    clean_prompt = payload.prompt.strip()
    if not clean_prompt:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Prompt cannot be empty.")

    # 1. Aggregate real-time system performance & database telemetry (Strictly Read-Only)
    telemetry = AITelemetryService.get_system_telemetry(db) if payload.include_telemetry else {}

    # 2. Query Google Gemini Analyst Model
    result = await GeminiAIService.analyze_system_insights(
        prompt=clean_prompt,
        telemetry=telemetry,
        history=payload.history
    )

    # 3. Log query in Audit Trail
    try:
        audit_entry = AuditLog(
            user_id=current_user.id,
            user_name=current_user.full_name or current_user.email,
            role=current_user.role,
            action="AI_INSIGHTS_QUERY",
            target_entity="SystemPerformanceTelemetry",
            target_id=str(current_user.id),
            reason=clean_prompt[:250],
            timestamp=datetime.datetime.now()
        )
        db.add(audit_entry)
        db.commit()
    except Exception:
        db.rollback()

    return AIInsightsResponse(
        status=result.get("status", "success"),
        answer=result.get("answer", ""),
        model_used=result.get("model_used", "gemini-2.5-flash"),
        timestamp=result.get("timestamp", datetime.datetime.now().isoformat()),
        grounding_metrics_summary=result.get("grounding_metrics_summary"),
        has_api_key=result.get("has_api_key", True)
    )


@router.get("/telemetry", response_model=TelemetrySnapshotResponse)
def get_live_system_telemetry(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """
    Returns the real-time, sanitized system telemetry snapshot collected
    from the host and MySQL database without invoking Gemini.
    """
    telemetry = AITelemetryService.get_system_telemetry(db)
    return TelemetrySnapshotResponse(
        timestamp=telemetry.get("telemetry_timestamp", datetime.datetime.now().isoformat()),
        host_telemetry=telemetry.get("host_performance", {}),
        database_telemetry=telemetry.get("database_telemetry", {}),
        error_rates=telemetry.get("error_rates_and_alerts", {}),
        operations_telemetry=telemetry.get("workforce_and_operations", {}),
        financial_telemetry=telemetry.get("financial_and_payroll", {}),
        active_users=telemetry.get("users_and_sessions", {}),
        recent_audit_actions=telemetry.get("recent_audit_trail", [])
    )
