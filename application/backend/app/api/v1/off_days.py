from datetime import datetime, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from application.backend.app.api.deps import get_db, require_admin, get_current_user
from application.backend.app.models.off_day import OffDayAllowance, OffDayRequest, RelieverAssignment
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.shift import Shift
from application.backend.app.models.payroll import PayrollPeriod
from application.backend.app.models.user import User
from application.backend.app.models.audit import AuditLog
from application.backend.app.schemas.off_day import (
    OffDayAllowanceCreate, OffDayAllowanceResponse,
    OffDayRequestCreate, OffDayRequestResponse,
    OffDayRequestApprovePayload, OffDayRequestRejectPayload,
    RelieverAssignmentResponse
)

router = APIRouter(prefix="/off-days", tags=["Off Days & Relievers"])


@router.post("/allowances", response_model=OffDayAllowanceResponse, status_code=status.HTTP_201_CREATED)
def set_off_day_allowance(
    payload: OffDayAllowanceCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """HR / Admin sets a guard's off-day allowance for a specific month/year."""
    guard = db.query(Guard).filter(Guard.id == payload.guard_id).first()
    if not guard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guard not found")

    # Check if period is confirmed/closed
    period = db.query(PayrollPeriod).filter(
        PayrollPeriod.year == payload.year,
        PayrollPeriod.month == payload.month
    ).first()
    if period and period.status in ["CONFIRMED", "CLOSED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot change off-day allowance for locked period ({period.status})"
        )

    allowance = db.query(OffDayAllowance).filter(
        OffDayAllowance.guard_id == payload.guard_id,
        OffDayAllowance.year == payload.year,
        OffDayAllowance.month == payload.month
    ).first()

    if allowance:
        allowance.days_allowed = payload.days_allowed
        allowance.set_by_user_id = admin.id
        allowance.updated_at = datetime.now()
    else:
        allowance = OffDayAllowance(
            guard_id=payload.guard_id,
            year=payload.year,
            month=payload.month,
            days_allowed=payload.days_allowed,
            set_by_user_id=admin.id
        )
        db.add(allowance)

    audit = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="SET_OFF_DAY_ALLOWANCE",
        target_entity="OffDayAllowance",
        target_id=str(guard.id),
        new_values=f"Set {payload.days_allowed} off days allowed for {guard.full_name} ({payload.year}-{payload.month:02d})"
    )
    db.add(audit)
    db.commit()
    db.refresh(allowance)
    return allowance


@router.get("/allowances", response_model=List[OffDayAllowanceResponse])
def list_off_day_allowances(
    guard_id: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fetch off-day allowances."""
    query = db.query(OffDayAllowance)
    if guard_id:
        query = query.filter(OffDayAllowance.guard_id == guard_id)
    if year:
        query = query.filter(OffDayAllowance.year == year)
    if month:
        query = query.filter(OffDayAllowance.month == month)
    return query.all()


@router.post("/requests", response_model=OffDayRequestResponse, status_code=status.HTTP_201_CREATED)
def submit_off_day_request(
    payload: OffDayRequestCreate,
    guard_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Guard (or Admin on guard's behalf) submits an off-day request."""
    target_guard_id = guard_id
    if current_user.role == "GUARD":
        if not current_user.guard_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Guard profile not linked to user account")
        target_guard_id = current_user.guard_id
    elif not target_guard_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="guard_id is required for Admin request submission")

    guard = db.query(Guard).filter(Guard.id == target_guard_id).first()
    if not guard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guard not found")

    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="end_date cannot be earlier than start_date")

    days_requested = (payload.end_date - payload.start_date).days + 1
    req_year = payload.start_date.year
    req_month = payload.start_date.month

    # Check locked payroll period
    period = db.query(PayrollPeriod).filter(
        PayrollPeriod.year == req_year,
        PayrollPeriod.month == req_month
    ).first()
    if period and period.status in ["CONFIRMED", "CLOSED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot submit off-day request for locked period ({period.status})"
        )

    # Check monthly allowance for this guard
    allowance = db.query(OffDayAllowance).filter(
        OffDayAllowance.guard_id == target_guard_id,
        OffDayAllowance.year == req_year,
        OffDayAllowance.month == req_month
    ).first()

    allowed_count = allowance.days_allowed if allowance else 0

    # Calculate already used/pending off days for this month
    existing_requests = db.query(OffDayRequest).filter(
        OffDayRequest.guard_id == target_guard_id,
        OffDayRequest.status.in_(["PENDING_REVIEW", "APPROVED"])
    ).all()

    used_days = 0
    for r in existing_requests:
        if r.start_date.year == req_year and r.start_date.month == req_month:
            used_days += r.days_count

    remaining = max(0, allowed_count - used_days)

    if days_requested > remaining:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Off-day request ({days_requested} days) exceeds remaining allowance ({remaining} of {allowed_count} days allowed for {payload.start_date.strftime('%B %Y')})"
        )

    req = OffDayRequest(
        guard_id=target_guard_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        days_count=days_requested,
        status="PENDING_REVIEW"
    )
    db.add(req)
    db.commit()
    db.refresh(req)

    return _build_off_day_request_response(db, req)


@router.get("/requests", response_model=List[OffDayRequestResponse])
def list_off_day_requests(
    guard_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List off-day requests."""
    query = db.query(OffDayRequest)
    if current_user.role == "GUARD":
        query = query.filter(OffDayRequest.guard_id == current_user.guard_id)
    elif guard_id:
        query = query.filter(OffDayRequest.guard_id == guard_id)

    if status:
        query = query.filter(OffDayRequest.status == status)

    requests = query.order_by(OffDayRequest.id.desc()).all()
    return [_build_off_day_request_response(db, r) for r in requests]


@router.post("/requests/{request_id}/approve", response_model=OffDayRequestResponse)
def approve_off_day_request(
    request_id: int,
    payload: OffDayRequestApprovePayload,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Approve an off-day request.
    REQUIRES a non-empty list of reliever assignments covering all dates of the request!
    """
    req = db.query(OffDayRequest).filter(OffDayRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Off-day request not found")

    if req.status != "PENDING_REVIEW":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Request is already {req.status}")

    # Check locked period
    period = db.query(PayrollPeriod).filter(
        PayrollPeriod.year == req.start_date.year,
        PayrollPeriod.month == req.start_date.month
    ).first()
    if period and period.status in ["CONFIRMED", "CLOSED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot approve off-day request for locked period ({period.status})"
        )

    # Validate reliever coverage
    if not payload.reliever_assignments:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Off-day approval blocked: A reliever assignment is strictly required to cover the off period"
        )

    # Verify all dates in off request have a reliever assignment
    req_dates = set()
    curr = req.start_date
    while curr <= req.end_date:
        req_dates.add(curr)
        curr = date.fromordinal(curr.toordinal() + 1)

    assigned_dates = {item.shift_date for item in payload.reliever_assignments}
    missing_dates = req_dates - assigned_dates
    if missing_dates:
        missing_str = ", ".join(d.strftime("%Y-%m-%d") for d in sorted(missing_dates))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Off-day approval blocked: Missing reliever assignment for dates: {missing_str}"
        )

    # Create reliever assignment records
    reliever_records = []
    for item in payload.reliever_assignments:
        reliever_guard = db.query(Guard).filter(Guard.id == item.reliever_guard_id).first()
        if not reliever_guard:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Reliever Guard #{item.reliever_guard_id} not found")

        r_asgn = RelieverAssignment(
            off_day_request_id=req.id,
            reliever_guard_id=item.reliever_guard_id,
            covering_for_guard_id=req.guard_id,
            site_id=item.site_id,
            shift_id=item.shift_id,
            shift_date=item.shift_date
        )
        reliever_records.append(r_asgn)

    db.add_all(reliever_records)
    req.status = "APPROVED"
    req.reviewed_by_user_id = admin.id
    req.reviewed_at = datetime.now()

    audit = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="APPROVE_OFF_DAY_REQUEST",
        target_entity="OffDayRequest",
        target_id=str(req.id),
        new_values=f"Approved off-day request #{req.id} for Guard #{req.guard_id} with {len(reliever_records)} reliever assignments"
    )
    db.add(audit)
    db.commit()
    db.refresh(req)

    return _build_off_day_request_response(db, req)


@router.post("/requests/{request_id}/reject", response_model=OffDayRequestResponse)
def reject_off_day_request(
    request_id: int,
    payload: OffDayRequestRejectPayload,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Reject an off-day request."""
    req = db.query(OffDayRequest).filter(OffDayRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Off-day request not found")

    if req.status != "PENDING_REVIEW":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Request is already {req.status}")

    # Check locked period
    period = db.query(PayrollPeriod).filter(
        PayrollPeriod.year == req.start_date.year,
        PayrollPeriod.month == req.start_date.month
    ).first()
    if period and period.status in ["CONFIRMED", "CLOSED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot reject off-day request for locked period ({period.status})"
        )

    req.status = "REJECTED"
    req.rejection_reason = payload.reason
    req.reviewed_by_user_id = admin.id
    req.reviewed_at = datetime.now()

    audit = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="REJECT_OFF_DAY_REQUEST",
        target_entity="OffDayRequest",
        target_id=str(req.id),
        reason=payload.reason
    )
    db.add(audit)
    db.commit()
    db.refresh(req)

    return _build_off_day_request_response(db, req)


@router.get("/relievers/available")
def get_available_relievers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fetch eligible relievers (guards marked as relievers or active guards with no primary site)."""
    relievers = db.query(Guard).filter(
        Guard.status == "ACTIVE",
        (Guard.is_reliever == True) | (Guard.primary_site_id.is_(None))
    ).order_by(Guard.full_name.asc()).all()
    
    if not relievers:
        # Fallback: all active guards can act as relievers if needed
        relievers = db.query(Guard).filter(Guard.status == "ACTIVE").order_by(Guard.full_name.asc()).all()

    return [
        {
            "id": g.id,
            "employee_number": g.employee_number,
            "full_name": g.full_name,
            "is_reliever": g.is_reliever,
            "primary_site_id": g.primary_site_id
        }
        for g in relievers
    ]


def _build_off_day_request_response(db: Session, req: OffDayRequest) -> OffDayRequestResponse:
    guard = db.query(Guard).filter(Guard.id == req.guard_id).first()
    asgns = db.query(RelieverAssignment).filter(RelieverAssignment.off_day_request_id == req.id).all()

    reliever_list = []
    for a in asgns:
        r_guard = db.query(Guard).filter(Guard.id == a.reliever_guard_id).first()
        c_guard = db.query(Guard).filter(Guard.id == a.covering_for_guard_id).first()
        site = db.query(Site).filter(Site.id == a.site_id).first()
        shift = db.query(Shift).filter(Shift.id == a.shift_id).first()

        reliever_list.append(RelieverAssignmentResponse(
            id=a.id,
            off_day_request_id=a.off_day_request_id,
            reliever_guard_id=a.reliever_guard_id,
            reliever_guard_name=r_guard.full_name if r_guard else f"Guard #{a.reliever_guard_id}",
            covering_for_guard_id=a.covering_for_guard_id,
            covering_for_guard_name=c_guard.full_name if c_guard else f"Guard #{a.covering_for_guard_id}",
            site_id=a.site_id,
            site_name=site.site_name if site else f"Site #{a.site_id}",
            shift_id=a.shift_id,
            shift_name=shift.name if shift else f"Shift #{a.shift_id}",
            shift_date=a.shift_date
        ))

    return OffDayRequestResponse(
        id=req.id,
        guard_id=req.guard_id,
        guard_name=guard.full_name if guard else f"Guard #{req.guard_id}",
        start_date=req.start_date,
        end_date=req.end_date,
        days_count=req.days_count,
        status=req.status,
        rejection_reason=req.rejection_reason,
        requested_at=req.requested_at,
        reviewed_at=req.reviewed_at,
        reliever_assignments=reliever_list
    )
