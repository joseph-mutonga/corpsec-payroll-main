from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from application.backend.app.api.deps import get_db, require_admin, get_current_user
from application.backend.app.models.site import Site
from application.backend.app.models.region import Region
from application.backend.app.models.guard import Guard
from application.backend.app.models.user import User
from application.backend.app.models.audit import AuditLog
from application.backend.app.schemas.site import (
    SiteCreate, SiteUpdate, SiteResponse, BulkSalaryChangeRequest, BulkSalaryChangePreviewResponse
)

router = APIRouter(prefix="/sites", tags=["Client Sites & Billing Rates"])


def _format_site(site: Site) -> dict:
    return {
        "id": site.id,
        "site_name": site.site_name,
        "location": site.location,
        "client_name": site.client_name,
        "region_id": site.region_id,
        "region_name": site.region.name if site.region else None,
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
    """Create a new Client Site with basic salary, daily rates & allowances."""
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

    site = Site(
        site_name=payload.site_name,
        location=payload.location,
        client_name=payload.client_name,
        region_id=payload.region_id,
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
        new_values=f"Created site '{site.site_name}' (Basic Salary: KES {site.basic_salary})",
        reason="Administrative onboarding"
    )
    db.add(audit_entry)
    db.commit()

    return _format_site(site)


@router.get("", response_model=List[SiteResponse])
def list_client_sites(
    search: Optional[str] = Query(None),
    region_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List client sites."""
    query = db.query(Site).options(joinedload(Site.region))
    if region_id:
        query = query.filter(Site.region_id == region_id)
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
    site = db.query(Site).options(joinedload(Site.region)).filter(Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    return _format_site(site)


@router.put("/{site_id}", response_model=SiteResponse)
def update_site_rates(
    site_id: int,
    payload: SiteUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Update site basic salary, billing rates & allowances."""
    site = db.query(Site).options(joinedload(Site.region)).filter(Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")

    update_data = payload.model_dump(exclude_unset=True)
    if "region_id" in update_data and update_data["region_id"] is not None:
        region = db.query(Region).filter(Region.id == update_data["region_id"]).first()
        if not region:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Region #{update_data['region_id']} not found")

    for key, value in update_data.items():
        setattr(site, key, value)

    site.updated_at = datetime.now()

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="UPDATE_SITE_RATES",
        target_entity="Site",
        target_id=str(site.id),
        new_values=str(update_data),
        reason="Updated site basic salary / billing rates"
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
        effective_date=str(payload.effective_date)
    )
