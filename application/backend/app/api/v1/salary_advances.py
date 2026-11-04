from typing import List, Optional
from datetime import datetime, date
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from application.backend.app.api.deps import get_db, require_admin_or_hr, get_current_user
from application.backend.app.models.user import User
from application.backend.app.models.guard import Guard
from application.backend.app.models.payroll import PayrollPeriod
from application.backend.app.models.salary_advance import SalaryAdvance
from application.backend.app.models.audit import AuditLog
from application.backend.app.schemas.salary_advance import (
    SalaryAdvanceCreate,
    SalaryAdvanceResponse,
    SalaryAdvanceSummary
)

router = APIRouter(prefix="/salary-advances", tags=["Salary Advances"])


def generate_advance_reference(db: Session, d_date: date) -> str:
    prefix = f"ADV-{d_date.strftime('%Y%m')}-"
    last = db.query(SalaryAdvance).filter(
        SalaryAdvance.advance_reference.like(f"{prefix}%")
    ).order_by(SalaryAdvance.id.desc()).first()
    if last and last.advance_reference:
        try:
            num = int(last.advance_reference.split("-")[-1]) + 1
        except Exception:
            num = 1
    else:
        num = 1
    return f"{prefix}{num:04d}"


def serialize_advance(db: Session, adv: SalaryAdvance) -> dict:
    recipient_name = "Unknown"
    recipient_number = ""
    if adv.advance_type == "GUARD" and adv.guard_id:
        g = db.query(Guard).filter(Guard.id == adv.guard_id).first()
        if g:
            recipient_name = g.full_name
            recipient_number = g.employee_number
    elif adv.staff_id:
        st = db.query(User).filter(User.id == adv.staff_id).first()
        if st:
            recipient_name = st.full_name or st.email
            recipient_number = st.phone or f"STAFF-{st.id}"

    approved_by_name = None
    if adv.approved_by_user_id:
        ap = db.query(User).filter(User.id == adv.approved_by_user_id).first()
        if ap:
            approved_by_name = ap.full_name or ap.email

    return {
        "id": adv.id,
        "advance_reference": adv.advance_reference,
        "advance_type": adv.advance_type,
        "guard_id": adv.guard_id,
        "staff_id": adv.staff_id,
        "payroll_period_id": adv.payroll_period_id,
        "recipient_name": recipient_name,
        "recipient_number": recipient_number,
        "amount": round(float(adv.amount), 2),
        "disbursement_date": adv.disbursement_date,
        "payment_method": adv.payment_method,
        "reference_number": adv.reference_number,
        "reason": adv.reason,
        "notes": adv.notes,
        "status": adv.status,
        "approved_by_name": approved_by_name,
        "created_at": adv.created_at,
        "deducted_at": adv.deducted_at
    }


@router.post("", response_model=SalaryAdvanceResponse, status_code=status.HTTP_201_CREATED)
def issue_salary_advance(
    payload: SalaryAdvanceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """
    Issue / record a mid-month salary advance for a Guard or Corporate Staff member.
    The amount will be automatically deducted during monthly payroll calculation.
    """
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Advance amount must be greater than zero")

    adv_type = payload.advance_type.strip().upper()
    if adv_type not in ["GUARD", "STAFF"]:
        raise HTTPException(status_code=400, detail="advance_type must be either 'GUARD' or 'STAFF'")

    if adv_type == "GUARD":
        if not payload.guard_id:
            raise HTTPException(status_code=400, detail="guard_id is required for guard advance")
        guard = db.query(Guard).filter(Guard.id == payload.guard_id).first()
        if not guard:
            raise HTTPException(status_code=404, detail="Guard not found")
        recipient_label = f"Guard {guard.full_name} ({guard.employee_number})"
    else:
        if not payload.staff_id:
            raise HTTPException(status_code=400, detail="staff_id is required for staff advance")
        staff = db.query(User).filter(User.id == payload.staff_id).first()
        if not staff:
            raise HTTPException(status_code=404, detail="Staff member not found")
        recipient_label = f"Staff {staff.full_name or staff.email}"

    disb_date = payload.disbursement_date or date.today()

    # Link to payroll period if not specified
    period_id = payload.payroll_period_id
    if not period_id:
        matching_period = db.query(PayrollPeriod).filter(
            PayrollPeriod.year == disb_date.year,
            PayrollPeriod.month == disb_date.month
        ).first()
        if matching_period:
            period_id = matching_period.id

    # Check if target period is already closed/confirmed
    if period_id:
        target_period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
        if target_period and target_period.status in ["CONFIRMED", "CLOSED"]:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot issue advance for locked payroll period ({target_period.period_name} - {target_period.status})"
            )

    adv_ref = generate_advance_reference(db, disb_date)

    adv = SalaryAdvance(
        advance_reference=adv_ref,
        advance_type=adv_type,
        guard_id=payload.guard_id if adv_type == "GUARD" else None,
        staff_id=payload.staff_id if adv_type == "STAFF" else None,
        payroll_period_id=period_id,
        amount=round(float(payload.amount), 2),
        disbursement_date=disb_date,
        payment_method=payload.payment_method.strip().upper(),
        reference_number=payload.reference_number.strip() if payload.reference_number else None,
        reason=payload.reason,
        notes=payload.notes,
        status="APPROVED",
        approved_by_user_id=current_user.id,
        created_at=datetime.now()
    )
    db.add(adv)

    audit = AuditLog(
        user_id=current_user.id,
        user_name=current_user.email,
        role=current_user.role,
        action="ISSUE_SALARY_ADVANCE",
        target_entity="SalaryAdvance",
        target_id=adv_ref,
        new_values=f"Issued KES {payload.amount:,.2f} to {recipient_label} via {payload.payment_method} (Ref: {payload.reference_number or 'N/A'})",
        reason=payload.reason or "Mid-month salary advance"
    )
    db.add(audit)
    db.commit()
    db.refresh(adv)

    return serialize_advance(db, adv)


@router.get("", response_model=List[SalaryAdvanceResponse])
def list_salary_advances(
    advance_type: Optional[str] = Query(None),
    guard_id: Optional[int] = Query(None),
    staff_id: Optional[int] = Query(None),
    payroll_period_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """List salary advances with filtering."""
    query = db.query(SalaryAdvance)

    if advance_type:
        query = query.filter(SalaryAdvance.advance_type == advance_type.strip().upper())
    if guard_id:
        query = query.filter(SalaryAdvance.guard_id == guard_id)
    if staff_id:
        query = query.filter(SalaryAdvance.staff_id == staff_id)
    if payroll_period_id:
        query = query.filter(SalaryAdvance.payroll_period_id == payroll_period_id)
    if status and status != "ALL":
        query = query.filter(SalaryAdvance.status == status.strip().upper())
    if year:
        query = query.filter(SalaryAdvance.disbursement_date >= date(year, 1, 1),
                             SalaryAdvance.disbursement_date <= date(year, 12, 31))
    if month and year:
        import calendar
        _, last_day = calendar.monthrange(year, month)
        query = query.filter(SalaryAdvance.disbursement_date >= date(year, month, 1),
                             SalaryAdvance.disbursement_date <= date(year, month, last_day))

    advances = query.order_by(SalaryAdvance.disbursement_date.desc(), SalaryAdvance.id.desc()).all()
    return [serialize_advance(db, a) for a in advances]


@router.get("/summary", response_model=SalaryAdvanceSummary)
def get_salary_advances_summary(
    payroll_period_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """Retrieve summary metrics for salary advances."""
    query = db.query(SalaryAdvance)
    if payroll_period_id:
        query = query.filter(SalaryAdvance.payroll_period_id == payroll_period_id)

    advances = query.all()
    total_count = len(advances)
    total_disbursed = sum(a.amount for a in advances)
    total_deducted = sum(a.amount for a in advances if a.status == "DEDUCTED")
    total_pending = sum(a.amount for a in advances if a.status in ["APPROVED", "PENDING"])

    return {
        "total_advances_count": total_count,
        "total_amount_disbursed": round(total_disbursed, 2),
        "total_amount_deducted": round(total_deducted, 2),
        "total_amount_pending": round(total_pending, 2)
    }


@router.get("/{advance_id}", response_model=SalaryAdvanceResponse)
def get_salary_advance(
    advance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """Get details of a single salary advance."""
    adv = db.query(SalaryAdvance).filter(SalaryAdvance.id == advance_id).first()
    if not adv:
        raise HTTPException(status_code=404, detail="Salary advance not found")
    return serialize_advance(db, adv)


@router.post("/{advance_id}/approve", response_model=SalaryAdvanceResponse)
def approve_salary_advance(
    advance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """Approve a pending salary advance."""
    adv = db.query(SalaryAdvance).filter(SalaryAdvance.id == advance_id).first()
    if not adv:
        raise HTTPException(status_code=404, detail="Salary advance not found")
    if adv.status == "DEDUCTED":
        raise HTTPException(status_code=400, detail="Cannot alter an advance that has already been deducted via payroll")

    adv.status = "APPROVED"
    adv.approved_by_user_id = current_user.id
    db.commit()
    db.refresh(adv)
    return serialize_advance(db, adv)


@router.delete("/{advance_id}")
def delete_salary_advance(
    advance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    """Delete a salary advance record (only if not yet deducted via payroll)."""
    adv = db.query(SalaryAdvance).filter(SalaryAdvance.id == advance_id).first()
    if not adv:
        raise HTTPException(status_code=404, detail="Salary advance not found")
    if adv.status == "DEDUCTED":
        raise HTTPException(status_code=400, detail="Cannot delete an advance that has already been deducted via payroll")

    db.delete(adv)
    db.commit()
    return {"message": "Salary advance deleted successfully", "id": advance_id}

