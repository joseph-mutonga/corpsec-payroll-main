from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from application.backend.app.api.deps import get_db, require_admin
from application.backend.app.models.audit import AuditLog
from application.backend.app.models.user import User

router = APIRouter(prefix="/audit-logs", tags=["Audit Logging"])


class AuditLogResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    role: Optional[str] = None
    action: str
    target_entity: Optional[str] = None
    target_id: Optional[str] = None
    old_values: Optional[str] = None
    new_values: Optional[str] = None
    reason: Optional[str] = None
    ip_address: Optional[str] = None
    timestamp: str

    model_config = ConfigDict(from_attributes=True)


@router.get("", response_model=List[AuditLogResponse])
def list_audit_logs(
    action: Optional[str] = Query(None),
    target_entity: Optional[str] = Query(None),
    user_name: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Admin Audit Log Viewer matching Screen 16."""
    query = db.query(AuditLog)

    if action:
        query = query.filter(AuditLog.action == action.upper())
    if target_entity:
        query = query.filter(AuditLog.target_entity == target_entity)
    if user_name:
        query = query.filter(AuditLog.user_name.ilike(f"%{user_name}%"))

    logs = query.order_by(AuditLog.id.desc()).limit(limit).all()

    result = []
    for log in logs:
        result.append(AuditLogResponse(
            id=log.id,
            user_id=log.user_id,
            user_name=log.user_name,
            role=log.role,
            action=log.action,
            target_entity=log.target_entity,
            target_id=log.target_id,
            old_values=log.old_values,
            new_values=log.new_values,
            reason=log.reason,
            ip_address=log.ip_address,
            timestamp=log.timestamp.strftime("%Y-%m-%d %H:%M:%S") if log.timestamp else ""
        ))
    return result
