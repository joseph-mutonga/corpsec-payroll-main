from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from application.backend.app.api.deps import get_db, require_admin, get_current_user
from application.backend.app.models.region import Region
from application.backend.app.models.user import User
from application.backend.app.models.audit import AuditLog
from application.backend.app.schemas.region import RegionCreate, RegionResponse

router = APIRouter(prefix="/regions", tags=["Regions"])


@router.post("", response_model=RegionResponse, status_code=status.HTTP_201_CREATED)
def create_region(
    payload: RegionCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Create a new geographic region for client sites."""
    name_clean = payload.name.strip()
    existing = db.query(Region).filter(Region.name.ilike(name_clean)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Region '{name_clean}' already exists."
        )

    region = Region(name=name_clean)
    db.add(region)
    db.commit()
    db.refresh(region)

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="CREATE_REGION",
        target_entity="Region",
        target_id=str(region.id),
        new_values=f"Created region '{region.name}'",
        reason="Administrative setup"
    )
    db.add(audit_entry)
    db.commit()

    return region


@router.get("", response_model=List[RegionResponse])
def list_regions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all configured regions."""
    return db.query(Region).order_by(Region.name.asc()).all()
