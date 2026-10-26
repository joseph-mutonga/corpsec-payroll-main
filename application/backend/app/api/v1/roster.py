from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from application.backend.app.api.deps import get_db, require_admin
from application.backend.app.models.roster import RosterPattern, RosterAssignment
from application.backend.app.models.user import User
from application.backend.app.models.audit import AuditLog
from application.backend.app.schemas.roster import (
    RosterPatternCreate, RosterPatternResponse,
    RosterOverrideCreate, RosterAssignmentResponse,
    RosterGridResponse
)
from application.backend.app.services.roster_service import (
    create_or_update_pattern, create_or_update_override, check_roster_conflict, get_roster_grid
)

router = APIRouter(prefix="/roster", tags=["Shift Roster Engine"])


@router.get("/grid", response_model=RosterGridResponse)
def get_roster_grid_matrix(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Retrieve monthly shift roster grid matrix for Admin UI."""
    today = date.today()
    target_year = year or today.year
    target_month = month or today.month

    if target_month < 1 or target_month > 12:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Month must be between 1 and 12")

    return get_roster_grid(db, target_year, target_month)


@router.post("/patterns", response_model=RosterPatternResponse, status_code=status.HTTP_201_CREATED)
def set_guard_recurring_pattern(
    payload: RosterPatternCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Set or update a guard's recurring shift roster pattern."""
    pattern = create_or_update_pattern(db, payload)

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="CREATE_ROSTER_PATTERN",
        target_entity="RosterPattern",
        target_id=str(pattern.id),
        new_values=f"Guard #{payload.guard_id} -> Site #{payload.site_id}, Shift #{payload.shift_id} (Days: {payload.days_of_week})",
        reason="Set recurring shift roster pattern"
    )
    db.add(audit_entry)
    db.commit()

    return pattern


@router.post("/overrides", status_code=status.HTTP_200_OK)
def set_guard_single_day_override(
    payload: RosterOverrideCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Set a single-date shift roster override for a guard."""
    assignment = create_or_update_override(db, payload)

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="CREATE_ROSTER_OVERRIDE",
        target_entity="RosterAssignment",
        target_id=str(assignment.id),
        new_values=f"Guard #{payload.guard_id} on {payload.shift_date} -> Site #{payload.site_id}, Shift #{payload.shift_id} (Override: True)",
        reason="Admin single-day schedule override"
    )
    db.add(audit_entry)
    db.commit()

    return {
        "status": "success",
        "assignment_id": assignment.id,
        "guard_id": assignment.guard_id,
        "shift_date": assignment.shift_date.strftime("%Y-%m-%d"),
        "is_override": assignment.is_override
    }


@router.delete("/assignments/{assignment_id}", status_code=status.HTTP_200_OK)
def delete_roster_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Delete a roster assignment or override."""
    assignment = db.query(RosterAssignment).filter(RosterAssignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Roster assignment #{assignment_id} not found")

    db.delete(assignment)
    db.commit()
    return {"status": "success", "message": f"Assignment #{assignment_id} deleted"}
