from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from application.backend.app.api.deps import get_db, require_admin, get_current_user
from application.backend.app.models.site import Site
from application.backend.app.models.region import Region
from application.backend.app.models.guard import Guard
from application.backend.app.models.user import User, UserRole
from application.backend.app.models.audit import AuditLog
from application.backend.app.schemas.site import (
    SiteCreate, SiteUpdate, SiteResponse, BulkSalaryChangeRequest, BulkSalaryChangePreviewResponse
)

router = APIRouter(prefix="/sites", tags=["Client Sites & Billing Rates"])


def _format_site(site: Site) -> dict:
    sup_name = None
    sup_email = None
    if getattr(site, "supervisor", None):
        sup_name = site.supervisor.full_name or site.supervisor.email
        sup_email = site.supervisor.email

    sup_guard_name = None
    if getattr(site, "super_guard", None):
        sup_guard_name = f"{site.super_guard.full_name} ({site.super_guard.employee_number})"

    return {
        "id": site.id,
        "site_name": site.site_name,
        "location": site.location,
        "client_name": site.client_name,
        "region_id": site.region_id,
        "region_name": site.region.name if getattr(site, "region", None) else None,
        "supervisor_id": site.supervisor_id,
        "supervisor_name": sup_name,
        "supervisor_email": sup_email,
        "super_guard_id": site.super_guard_id,
        "super_guard_name": sup_guard_name,
        "latitude": site.latitude,
        "longitude": site.longitude,
        "geofence_radius": site.geofence_radius if site.geofence_radius is not None else 200.0,
        "basic_salary": site.basic_salary,
        "daily_rate": site.daily_rate,
        "night_allowance": site.night_allowance,
        "transport_allowance": site.transport_allowance,
        "housing_allowance": site.housing_allowance,
        "guard_count": site.guard_count,
        "created_at": site.created_at
    }


@router.post("", response_model=SiteResponse, status_code=status.HTTP_201_CREATED)
def create_client_site(
    payload: SiteCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Create a new Client Site with basic salary, daily rates, allowances, geofence radius, and assigned supervisor."""
    existing = db.query(Site).filter(Site.site_name == payload.site_name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Site with name '{payload.site_name}' already exists."
        )

    if payload.region_id:
        region = db.query(Region).filter(Region.id == payload.region_id).first()
        if not region:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Region #{payload.region_id} not found")

    if payload.supervisor_id:
        sup_user = db.query(User).filter(User.id == payload.supervisor_id, User.role == UserRole.SUPERVISOR.value).first()
        if not sup_user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Supervisor #{payload.supervisor_id} not found")

    if payload.super_guard_id:
        sg_guard = db.query(Guard).filter(Guard.id == payload.super_guard_id).first()
        if sg_guard:
            sg_guard.is_super_guard = True

    site = Site(
        site_name=payload.site_name,
        location=payload.location,
        client_name=payload.client_name,
        region_id=payload.region_id,
        supervisor_id=payload.supervisor_id,
        super_guard_id=payload.super_guard_id,
        latitude=payload.latitude if payload.latitude is not None else -1.286389,
        longitude=payload.longitude if payload.longitude is not None else 36.817223,
        geofence_radius=payload.geofence_radius if payload.geofence_radius is not None else 200.0,
        basic_salary=payload.basic_salary,
        daily_rate=payload.daily_rate,
        night_allowance=payload.night_allowance,
        transport_allowance=payload.transport_allowance,
        housing_allowance=payload.housing_allowance
    )
    db.add(site)
    db.commit()
    db.refresh(site)

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="CREATE_SITE",
        target_entity="Site",
        target_id=str(site.id),
        new_values=f"Created site '{site.site_name}' (Basic Salary: KES {site.basic_salary}, Supervisor: {site.supervisor_id})",
        reason="Administrative onboarding"
    )
    db.add(audit_entry)
    db.commit()

    return _format_site(site)


@router.get("", response_model=List[SiteResponse])
def list_client_sites(
    search: Optional[str] = Query(None),
    region_id: Optional[int] = Query(None),
    supervisor_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List client sites."""
    query = db.query(Site).options(joinedload(Site.region), joinedload(Site.supervisor))
    if region_id:
        query = query.filter(Site.region_id == region_id)
    if supervisor_id:
        query = query.filter(Site.supervisor_id == supervisor_id)
    if search:
        query = query.filter(
            (Site.site_name.ilike(f"%{search}%")) |
            (Site.client_name.ilike(f"%{search}%")) |
            (Site.location.ilike(f"%{search}%"))
        )
    sites = query.order_by(Site.id.desc()).all()
    return [_format_site(s) for s in sites]


@router.get("/{site_id}", response_model=SiteResponse)
def get_site_details(
    site_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get client site details."""
    site = db.query(Site).options(joinedload(Site.region), joinedload(Site.supervisor)).filter(Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    return _format_site(site)


@router.put("/{site_id}", response_model=SiteResponse)
@router.patch("/{site_id}", response_model=SiteResponse)
def update_site_rates(
    site_id: int,
    payload: SiteUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Update site details, basic salary, billing rates, allowances, and assigned supervisor."""
    site = db.query(Site).options(joinedload(Site.region), joinedload(Site.supervisor)).filter(Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "site_name" in update_data and update_data["site_name"]:
        existing_dup = db.query(Site).filter(Site.site_name == update_data["site_name"], Site.id != site_id).first()
        if existing_dup:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Another site with name '{update_data['site_name']}' already exists."
            )

    if "region_id" in update_data and update_data["region_id"] is not None:
        region = db.query(Region).filter(Region.id == update_data["region_id"]).first()
        if not region:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Region #{update_data['region_id']} not found")

    old_supervisor_id = site.supervisor_id
    new_supervisor_id = update_data.get("supervisor_id") if "supervisor_id" in update_data else old_supervisor_id

    if "supervisor_id" in update_data and new_supervisor_id is not None:
        sup_user = db.query(User).filter(User.id == new_supervisor_id, User.role == UserRole.SUPERVISOR.value).first()
        if not sup_user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Supervisor #{new_supervisor_id} not found")

    if "super_guard_id" in update_data and update_data["super_guard_id"] is not None:
        sg_guard = db.query(Guard).filter(Guard.id == update_data["super_guard_id"]).first()
        if sg_guard:
            sg_guard.is_super_guard = True

    for key, value in update_data.items():
        setattr(site, key, value)

    site.updated_at = datetime.now()

    # Synchronize guards deployed at this site if supervisor was updated
    if "supervisor_id" in update_data and new_supervisor_id != old_supervisor_id:
        if new_supervisor_id is not None:
            db.query(Guard).filter(Guard.primary_site_id == site.id, Guard.status == "ACTIVE").update(
                {Guard.supervisor_id: new_supervisor_id},
                synchronize_session=False
            )
        else:
            db.query(Guard).filter(Guard.primary_site_id == site.id, Guard.supervisor_id == old_supervisor_id).update(
                {Guard.supervisor_id: None},
                synchronize_session=False
            )

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="UPDATE_SITE_RATES",
        target_entity="Site",
        target_id=str(site.id),
        new_values=str(update_data),
        reason="Updated site details / supervisor / billing rates"
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(site)
    return _format_site(site)


@router.post("/{site_id}/bulk-salary-change", response_model=BulkSalaryChangePreviewResponse)
def execute_bulk_salary_change(
    site_id: int,
    payload: BulkSalaryChangeRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Bulk Salary & Rate Change Modal."""
    site = db.query(Site).filter(Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")

    guards = db.query(Guard).filter(Guard.primary_site_id == site.id, Guard.status == "ACTIVE").all()
    affected_count = len(guards)

    old_daily = site.daily_rate
    new_daily = payload.new_daily_rate if payload.new_daily_rate is not None else old_daily
    new_night = payload.new_night_allowance if payload.new_night_allowance is not None else site.night_allowance

    if not payload.is_preview:
        site.daily_rate = new_daily
        site.night_allowance = new_night
        site.updated_at = datetime.now()

        audit = AuditLog(
            user_id=admin.id,
            user_name=admin.email,
            role=admin.role,
            action="BULK_SALARY_CHANGE",
            target_entity="Site",
            target_id=str(site.id),
            new_values=f"Updated site daily rate to {new_daily}, night allowance to {new_night}",
            reason=payload.reason
        )
        db.add(audit)
        db.commit()

    return BulkSalaryChangePreviewResponse(
        site_name=site.site_name,
        guards_affected=affected_count,
        affected_guards_count=affected_count,
        old_daily_rate=old_daily,
        new_daily_rate=new_daily,
        new_night_allowance=new_night,
        applied=not payload.is_preview,
        effective_date=payload.effective_date
    )
