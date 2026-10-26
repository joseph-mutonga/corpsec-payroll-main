from typing import List, Optional
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from application.backend.app.core.database import get_db
from application.backend.app.models.user import User
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.incident import Incident
from application.backend.app.models.audit import AuditLog
from application.backend.app.api.deps import require_admin, get_current_user

router = APIRouter()


class IncidentAdminResponse(BaseModel):
    id: int
    reference_number: str
    guard_id: int
    guard_name: str
    guard_employee_number: str
    site_id: int
    site_name: str
    incident_type: str
    incident_date: date
    incident_time: str
    description: str
    photo_path: Optional[str] = None
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UpdateIncidentStatusRequest(BaseModel):
    status: str  # OPEN, INVESTIGATING, RESOLVED


@router.get("/incidents", response_model=List[IncidentAdminResponse])
def list_admin_incidents(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """List all reported incidents with guard and site names for Admin dashboard."""
    incidents = db.query(Incident).order_by(Incident.id.desc()).all()
    results = []

    for inc in incidents:
        guard = db.query(Guard).filter(Guard.id == inc.guard_id).first()
        site = db.query(Site).filter(Site.id == inc.site_id).first()

        guard_name = guard.full_name if guard else "Unknown Guard"
        guard_emp = guard.employee_number if guard else "CS-00000"
        site_name = site.site_name if site else "Unknown Site"

        results.append(IncidentAdminResponse(
            id=inc.id,
            reference_number=inc.reference_number,
            guard_id=inc.guard_id,
            guard_name=guard_name,
            guard_employee_number=guard_emp,
            site_id=inc.site_id,
            site_name=site_name,
            incident_type=inc.incident_type,
            incident_date=inc.incident_date,
            incident_time=inc.incident_time,
            description=inc.description,
            photo_path=inc.photo_path,
            status=inc.status,
            created_at=inc.created_at
        ))

    return results


@router.patch("/incidents/{incident_id}/status", response_model=IncidentAdminResponse)
def update_incident_status(
    incident_id: int,
    payload: UpdateIncidentStatusRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Update status of a reported incident (e.g. OPEN -> INVESTIGATING -> RESOLVED)."""
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident record not found.")

    new_status = payload.status.upper().strip()
    if new_status not in ["OPEN", "INVESTIGATING", "RESOLVED"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status. Must be OPEN, INVESTIGATING, or RESOLVED.")

    inc.status = new_status

    audit_entry = AuditLog(
        user_id=admin_user.id,
        user_name=admin_user.email,
        role=admin_user.role,
        action="UPDATE_INCIDENT_STATUS",
        target_entity="Incident",
        target_id=inc.reference_number,
        reason=f"Incident status updated to {new_status}"
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(inc)

    guard = db.query(Guard).filter(Guard.id == inc.guard_id).first()
    site = db.query(Site).filter(Site.id == inc.site_id).first()

    return IncidentAdminResponse(
        id=inc.id,
        reference_number=inc.reference_number,
        guard_id=inc.guard_id,
        guard_name=guard.full_name if guard else "Unknown Guard",
        guard_employee_number=guard.employee_number if guard else "CS-00000",
        site_id=inc.site_id,
        site_name=site.site_name if site else "Unknown Site",
        incident_type=inc.incident_type,
        incident_date=inc.incident_date,
        incident_time=inc.incident_time,
        description=inc.description,
        photo_path=inc.photo_path,
        status=inc.status,
        created_at=inc.created_at
    )
