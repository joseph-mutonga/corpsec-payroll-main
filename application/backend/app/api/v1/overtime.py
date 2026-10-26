from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from application.backend.app.api.deps import get_db, require_admin, get_current_user
from application.backend.app.models.attendance import Attendance, OvertimeClaim
from application.backend.app.models.user import User, UserRole
from application.backend.app.models.audit import AuditLog
from application.backend.app.schemas.attendance import OvertimeClaimResponse

router = APIRouter(prefix="/overtime", tags=["Overtime Management"])


@router.get("", response_model=List[OvertimeClaimResponse])
def list_overtime_claims(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List overtime claims generated from shifts with overtime hours (> 8h)."""
    query = db.query(OvertimeClaim).options(
        joinedload(OvertimeClaim.guard),
        joinedload(OvertimeClaim.attendance).joinedload(Attendance.site)
    )

    if current_user.role == UserRole.GUARD.value:
        query = query.filter(OvertimeClaim.guard_id == current_user.guard_id)

    if status_filter:
        query = query.filter(OvertimeClaim.status == status_filter.upper())

    records = query.order_by(OvertimeClaim.id.desc()).all()
    result = []
    for claim in records:
        site_name = "Unknown Site"
        if claim.attendance and claim.attendance.site:
            site_name = claim.attendance.site.site_name

        result.append(OvertimeClaimResponse(
            id=claim.id,
            guard_id=claim.guard_id,
            guard_name=claim.guard.full_name if claim.guard else f"Guard #{claim.guard_id}",
            site_name=site_name,
            shift_date=claim.claim_date,
            overtime_hours=claim.hours_claimed,
            rate_multiplier=claim.multiplier,
            status=claim.status
        ))
    return result


@router.post("/{claim_id}/approve")
def approve_overtime(
    claim_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Approve an overtime claim for payroll calculation."""
    claim = db.query(OvertimeClaim).filter(
        (OvertimeClaim.id == claim_id) | (OvertimeClaim.attendance_id == claim_id)
    ).first()

    if not claim:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Overtime claim record not found"
        )

    # Prevent approving overtime claims for CONFIRMED or CLOSED payroll periods
    from application.backend.app.models.payroll import PayrollPeriod
    period = db.query(PayrollPeriod).filter(
        PayrollPeriod.start_date <= claim.claim_date,
        PayrollPeriod.end_date >= claim.claim_date,
        PayrollPeriod.status.in_(["CONFIRMED", "CLOSED"])
    ).first()

    if period:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot approve overtime for {claim.claim_date}: payroll period '{period.period_name}' is already {period.status} and locked."
        )

    claim.status = "APPROVED"
    claim.approved_by = admin.email
    claim.approved_at = datetime.now()

    if claim.attendance:
        claim.attendance.status = "OVERTIME"

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="APPROVE_OVERTIME",
        target_entity="OvertimeClaim",
        target_id=str(claim.id),
        new_values=f"Approved {claim.hours_claimed}h overtime ({claim.multiplier}x) for Guard #{claim.guard_id}",
        reason="Admin approved overtime claim"
    )
    db.add(audit_entry)
    db.commit()

    return {"message": "Overtime claim approved successfully", "claim_id": claim.id, "status": "APPROVED"}


@router.post("/{claim_id}/reject")
def reject_overtime(
    claim_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Reject an overtime claim (reverts status to REJECTED)."""
    claim = db.query(OvertimeClaim).filter(
        (OvertimeClaim.id == claim_id) | (OvertimeClaim.attendance_id == claim_id)
    ).first()

    if not claim:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Overtime claim record not found"
        )

    old_status = claim.status
    claim.status = "REJECTED"
    claim.approved_by = admin.email
    claim.approved_at = datetime.now()

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="REJECT_OVERTIME",
        target_entity="OvertimeClaim",
        target_id=str(claim.id),
        old_values=f"Status: {old_status}",
        new_values="Status: REJECTED",
        reason="Admin rejected overtime claim"
    )
    db.add(audit_entry)
    db.commit()

    return {"message": "Overtime claim rejected", "claim_id": claim.id, "status": "REJECTED"}
