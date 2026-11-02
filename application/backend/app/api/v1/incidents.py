from typing import List, Optional
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session
from sqlalchemy import or_

from application.backend.app.core.database import get_db
from application.backend.app.models.user import User, UserRole
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.incident import Incident
from application.backend.app.models.audit import AuditLog
from application.backend.app.api.deps import require_admin, require_admin_or_supervisor, get_current_user

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


class CreateIncidentRequest(BaseModel):
    guard_id: int
    site_id: int
    incident_type: str
    incident_date: Optional[date] = None
    incident_time: Optional[str] = None
    description: str
    photo_path: Optional[str] = None
    status: Optional[str] = "OPEN"


class UpdateIncidentStatusRequest(BaseModel):
    status: str  # OPEN, INVESTIGATING, RESOLVED


@router.get("/incidents", response_model=List[IncidentAdminResponse])
def list_admin_incidents(
    status_filter: Optional[str] = None,
    site_id: Optional[int] = None,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin_or_supervisor)
):
    """List all reported incidents with guard and site names for Admin & Supervisor dashboard."""
    query = db.query(Incident)

    if admin_user.role == UserRole.SUPERVISOR.value:
        sup_site_ids = [s.id for s in db.query(Site.id).filter(Site.supervisor_id == admin_user.id).all()]
        filters = [Guard.supervisor_id == admin_user.id]
        if sup_site_ids:
            filters.append(Guard.primary_site_id.in_(sup_site_ids))
        assigned_guard_ids = [g[0] for g in db.query(Guard.id).filter(or_(*filters)).all()]
        query = query.filter(Incident.guard_id.in_(assigned_guard_ids))

    if status_filter:
        s_upper = status_filter.upper().strip()
        if s_upper in ["OPEN", "INVESTIGATING", "RESOLVED"]:
            query = query.filter(Incident.status == s_upper)

    if site_id:
        query = query.filter(Incident.site_id == site_id)

    incidents = query.order_by(Incident.id.desc()).all()
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


@router.post("/incidents", response_model=IncidentAdminResponse, status_code=status.HTTP_201_CREATED)
def create_admin_incident(
    payload: CreateIncidentRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin_or_supervisor)
):
    """Create a new incident report directly from Admin or Supervisor dashboard."""
    if not payload.description or len(payload.description.strip()) < 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incident description must be at least 5 characters long."
        )

    guard = db.query(Guard).filter(Guard.id == payload.guard_id).first()
    if not guard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Specified guard not found.")

    if admin_user.role == UserRole.SUPERVISOR.value:
        is_sup = guard.supervisor_id == admin_user.id or (guard.site and guard.site.supervisor_id == admin_user.id)
        if not is_sup:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Guard '{guard.full_name}' is not assigned to your supervision or sites."
            )

    site = db.query(Site).filter(Site.id == payload.site_id).first()
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Specified client site not found.")

    now = datetime.now()
    count_inc = db.query(Incident).count() + 1
    ref_num = f"INC-{now.year}-{count_inc:04d}"
    while db.query(Incident).filter(Incident.reference_number == ref_num).first():
        count_inc += 1
        ref_num = f"INC-{now.year}-{count_inc:04d}"

    inc_date = payload.incident_date or date.today()
    inc_time = payload.incident_time or now.strftime("%H:%M")
    inc_status = (payload.status or "OPEN").upper().strip()
    if inc_status not in ["OPEN", "INVESTIGATING", "RESOLVED"]:
        inc_status = "OPEN"

    inc = Incident(
        reference_number=ref_num,
        guard_id=payload.guard_id,
        site_id=payload.site_id,
        incident_type=payload.incident_type.strip(),
        incident_date=inc_date,
        incident_time=inc_time,
        description=payload.description.strip(),
        photo_path=payload.photo_path,
        status=inc_status,
        created_at=now
    )
    db.add(inc)

    audit_entry = AuditLog(
        user_id=admin_user.id,
        user_name=admin_user.email,
        role=admin_user.role,
        action="CREATE_INCIDENT",
        target_entity="Incident",
        target_id=ref_num,
        reason=f"Incident {ref_num} ({payload.incident_type}) created by {admin_user.email}"
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(inc)

    return IncidentAdminResponse(
        id=inc.id,
        reference_number=inc.reference_number,
        guard_id=inc.guard_id,
        guard_name=guard.full_name,
        guard_employee_number=guard.employee_number,
        site_id=inc.site_id,
        site_name=site.site_name,
        incident_type=inc.incident_type,
        incident_date=inc.incident_date,
        incident_time=inc.incident_time,
        description=inc.description,
        photo_path=inc.photo_path,
        status=inc.status,
        created_at=inc.created_at
    )


@router.get("/incidents/{incident_id}", response_model=IncidentAdminResponse)
def get_incident_detail(
    incident_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin_or_supervisor)
):
    """Retrieve details for a single incident record."""
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident record not found.")

    guard = db.query(Guard).filter(Guard.id == inc.guard_id).first()
    if admin_user.role == UserRole.SUPERVISOR.value and guard:
        is_sup = guard.supervisor_id == admin_user.id or (guard.site and guard.site.supervisor_id == admin_user.id)
        if not is_sup:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: This incident belongs to a guard not assigned to your supervision or sites."
            )
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


@router.patch("/incidents/{incident_id}/status", response_model=IncidentAdminResponse)
def update_incident_status(
    incident_id: int,
    payload: UpdateIncidentStatusRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin_or_supervisor)
):
    """Update status of a reported incident (e.g. OPEN -> INVESTIGATING -> RESOLVED)."""
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident record not found.")

    guard = db.query(Guard).filter(Guard.id == inc.guard_id).first()
    if admin_user.role == UserRole.SUPERVISOR.value and guard:
        is_sup = guard.supervisor_id == admin_user.id or (guard.site and guard.site.supervisor_id == admin_user.id)
        if not is_sup:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: This incident belongs to a guard not assigned to your supervision or sites."
            )
    new_status = payload.status.upper().strip()
    if new_status not in ["OPEN", "INVESTIGATING", "RESOLVED"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status. Must be OPEN, INVESTIGATING, or RESOLVED.")

    old_status = inc.status
    inc.status = new_status

    audit_entry = AuditLog(
        user_id=admin_user.id,
        user_name=admin_user.email,
        role=admin_user.role,
        action="UPDATE_INCIDENT_STATUS",
        target_entity="Incident",
        target_id=inc.reference_number,
        reason=f"Incident status changed from {old_status} to {new_status} by {admin_user.email}"
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


@router.delete("/incidents/{incident_id}", status_code=status.HTTP_200_OK)
def delete_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Delete an incident record (Admin only)."""
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found.")

    ref = inc.reference_number
    db.delete(inc)
    audit_entry = AuditLog(
        user_id=admin_user.id,
        user_name=admin_user.email,
        role=admin_user.role,
        action="DELETE_INCIDENT",
        target_entity="Incident",
        target_id=ref,
        reason=f"Incident {ref} deleted by Admin ({admin_user.email})"
    )
    db.add(audit_entry)
    db.commit()
    return {"message": f"Incident {ref} deleted successfully."}
