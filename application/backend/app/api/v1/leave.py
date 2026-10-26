from typing import List, Optional
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from application.backend.app.core.database import get_db
from application.backend.app.models.user import User
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.leave import LeaveRequest
from application.backend.app.models.audit import AuditLog
from application.backend.app.api.deps import require_admin

router = APIRouter()


class LeaveAdminResponse(BaseModel):
    id: int
    guard_id: int
    guard_name: str
    guard_employee_number: str
    site_name: str
    leave_type: str
    start_date: date
    end_date: date
    duration_days: int
    reason: str
    status: str
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    comments: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UpdateLeaveStatusRequest(BaseModel):
    status: str  # APPROVED, REJECTED, PENDING
    comments: Optional[str] = None


@router.get("/leave", response_model=List[LeaveAdminResponse])
@router.get("/leave-requests", response_model=List[LeaveAdminResponse])
def list_admin_leave_requests(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Fetch all guard leave requests for Admin management screen."""
    requests = db.query(LeaveRequest).order_by(LeaveRequest.id.desc()).all()
    results = []

    for req in requests:
        guard = db.query(Guard).filter(Guard.id == req.guard_id).first()
        site_name = "Unassigned Site"
        if guard and guard.primary_site_id:
            site = db.query(Site).filter(Site.id == guard.primary_site_id).first()
            if site:
                site_name = site.site_name

        guard_name = guard.full_name if guard else "Unknown Guard"
        guard_emp = guard.employee_number if guard else "CS-00000"

        results.append(LeaveAdminResponse(
            id=req.id,
            guard_id=req.guard_id,
            guard_name=guard_name,
            guard_employee_number=guard_emp,
            site_name=site_name,
            leave_type=req.leave_type,
            start_date=req.start_date,
            end_date=req.end_date,
            duration_days=req.duration_days,
            reason=req.reason,
            status=req.status,
            reviewed_by=req.reviewed_by,
            reviewed_at=req.reviewed_at,
            comments=req.comments,
            created_at=req.created_at
        ))

    return results


from application.backend.app.models.payroll import PayrollPeriod, UnpaidLeaveDeduction


class UnpaidLeaveDeductionResponse(BaseModel):
    id: int
    guard_id: int
    guard_name: str
    guard_employee_number: str
    leave_request_id: int
    payroll_period_id: Optional[int] = None
    period_name: str
    days_deducted: int
    daily_rate: float
    amount: float
    status: str
    dismissal_reason: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    applied_by: Optional[str] = None
    applied_at: Optional[datetime] = None
    leave_start_date: date
    leave_end_date: date
    leave_reason: str

    model_config = ConfigDict(from_attributes=True)


class DismissDeductionRequest(BaseModel):
    reason: str


@router.patch("/leave/{leave_id}/status", response_model=LeaveAdminResponse)
@router.patch("/leave-requests/{leave_id}/status", response_model=LeaveAdminResponse)
def update_leave_request_status(
    leave_id: int,
    payload: UpdateLeaveStatusRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Approve or Reject a guard's leave request."""
    req = db.query(LeaveRequest).filter(LeaveRequest.id == leave_id).first()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Leave request not found.")

    new_status = payload.status.upper().strip()
    if new_status not in ["APPROVED", "REJECTED", "PENDING"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status. Must be APPROVED or REJECTED.")

    req.status = new_status
    req.reviewed_by = admin_user.email
    req.reviewed_at = datetime.now()
    if payload.comments:
        req.comments = payload.comments

    # Trigger Unpaid Leave Deduction if leave_type is Unpaid Leave and status is APPROVED
    if new_status == "APPROVED" and req.leave_type == "Unpaid Leave":
        existing_ded = db.query(UnpaidLeaveDeduction).filter(UnpaidLeaveDeduction.leave_request_id == req.id).first()
        if not existing_ded:
            guard_obj = db.query(Guard).filter(Guard.id == req.guard_id).first()
            if not guard_obj:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Guard not found")
            try:
                basic_sal = guard_obj.effective_basic_salary
            except ValueError as err:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(err))
            daily_rate = round(basic_sal / 26.0, 2)
            calc_amount = round((basic_sal / 26.0) * req.duration_days, 2)

            # Match PayrollPeriod by start_date range or month/year
            period = db.query(PayrollPeriod).filter(
                PayrollPeriod.start_date <= req.start_date,
                PayrollPeriod.end_date >= req.start_date
            ).first()
            if not period:
                period = db.query(PayrollPeriod).filter(
                    PayrollPeriod.month == req.start_date.month,
                    PayrollPeriod.year == req.start_date.year
                ).first()

            deduction = UnpaidLeaveDeduction(
                guard_id=req.guard_id,
                leave_request_id=req.id,
                payroll_period_id=period.id if period else None,
                days_deducted=req.duration_days,
                daily_rate=daily_rate,
                amount=calc_amount,
                status="PENDING_REVIEW",
                created_by=admin_user.email
            )
            db.add(deduction)

    audit_entry = AuditLog(
        user_id=admin_user.id,
        user_name=admin_user.email,
        role=admin_user.role,
        action="UPDATE_LEAVE_STATUS",
        target_entity="LeaveRequest",
        target_id=str(req.id),
        reason=f"Leave request status updated to {new_status}. Note: {payload.comments or 'N/A'}"
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(req)

    guard = db.query(Guard).filter(Guard.id == req.guard_id).first()
    site_name = "Unassigned Site"
    if guard and guard.primary_site_id:
        site = db.query(Site).filter(Site.id == guard.primary_site_id).first()
        if site:
            site_name = site.site_name

    return LeaveAdminResponse(
        id=req.id,
        guard_id=req.guard_id,
        guard_name=guard.full_name if guard else "Unknown Guard",
        guard_employee_number=guard.employee_number if guard else "CS-00000",
        site_name=site_name,
        leave_type=req.leave_type,
        start_date=req.start_date,
        end_date=req.end_date,
        duration_days=req.duration_days,
        reason=req.reason,
        status=req.status,
        reviewed_by=req.reviewed_by,
        reviewed_at=req.reviewed_at,
        comments=req.comments,
        created_at=req.created_at
    )


@router.get("/unpaid-leave-deductions", response_model=List[UnpaidLeaveDeductionResponse])
def list_unpaid_leave_deductions(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Fetch all unpaid leave deduction records for Admin review."""
    deductions = db.query(UnpaidLeaveDeduction).order_by(UnpaidLeaveDeduction.id.desc()).all()
    results = []

    for d in deductions:
        guard = db.query(Guard).filter(Guard.id == d.guard_id).first()
        leave = db.query(LeaveRequest).filter(LeaveRequest.id == d.leave_request_id).first()
        period = db.query(PayrollPeriod).filter(PayrollPeriod.id == d.payroll_period_id).first() if d.payroll_period_id else None

        results.append(UnpaidLeaveDeductionResponse(
            id=d.id,
            guard_id=d.guard_id,
            guard_name=guard.full_name if guard else "Unknown Guard",
            guard_employee_number=guard.employee_number if guard else "CS-00000",
            leave_request_id=d.leave_request_id,
            payroll_period_id=d.payroll_period_id,
            period_name=period.period_name if period else "Unassigned Period",
            days_deducted=d.days_deducted,
            daily_rate=d.daily_rate,
            amount=d.amount,
            status=d.status,
            dismissal_reason=d.dismissal_reason,
            created_by=d.created_by,
            created_at=d.created_at,
            applied_by=d.applied_by,
            applied_at=d.applied_at,
            leave_start_date=leave.start_date if leave else date.today(),
            leave_end_date=leave.end_date if leave else date.today(),
            leave_reason=leave.reason if leave else "N/A"
        ))

    return results


@router.post("/unpaid-leave-deductions/{deduction_id}/apply", response_model=UnpaidLeaveDeductionResponse)
def apply_unpaid_leave_deduction(
    deduction_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Approve/apply an unpaid leave deduction for inclusion in the next payroll calculation."""
    ded = db.query(UnpaidLeaveDeduction).filter(UnpaidLeaveDeduction.id == deduction_id).first()
    if not ded:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unpaid leave deduction record not found.")

    if ded.payroll_period_id:
        period = db.query(PayrollPeriod).filter(PayrollPeriod.id == ded.payroll_period_id).first()
        if period and period.status in ["CONFIRMED", "CLOSED"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Payroll period '{period.period_name}' is {period.status} and cannot be modified.")

    ded.status = "APPLIED"
    ded.applied_by = admin_user.email
    ded.applied_at = datetime.now()

    audit_entry = AuditLog(
        user_id=admin_user.id,
        user_name=admin_user.email,
        role=admin_user.role,
        action="APPLY_UNPAID_LEAVE_DEDUCTION",
        target_entity="UnpaidLeaveDeduction",
        target_id=str(ded.id),
        reason=f"Applied unpaid leave deduction of KES {ded.amount:.2f} for guard ID {ded.guard_id}"
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(ded)

    guard = db.query(Guard).filter(Guard.id == ded.guard_id).first()
    leave = db.query(LeaveRequest).filter(LeaveRequest.id == ded.leave_request_id).first()
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == ded.payroll_period_id).first() if ded.payroll_period_id else None

    return UnpaidLeaveDeductionResponse(
        id=ded.id,
        guard_id=ded.guard_id,
        guard_name=guard.full_name if guard else "Unknown Guard",
        guard_employee_number=guard.employee_number if guard else "CS-00000",
        leave_request_id=ded.leave_request_id,
        payroll_period_id=ded.payroll_period_id,
        period_name=period.period_name if period else "Unassigned Period",
        days_deducted=ded.days_deducted,
        daily_rate=ded.daily_rate,
        amount=ded.amount,
        status=ded.status,
        dismissal_reason=ded.dismissal_reason,
        created_by=ded.created_by,
        created_at=ded.created_at,
        applied_by=ded.applied_by,
        applied_at=ded.applied_at,
        leave_start_date=leave.start_date if leave else date.today(),
        leave_end_date=leave.end_date if leave else date.today(),
        leave_reason=leave.reason if leave else "N/A"
    )


@router.post("/unpaid-leave-deductions/{deduction_id}/dismiss", response_model=UnpaidLeaveDeductionResponse)
def dismiss_unpaid_leave_deduction(
    deduction_id: int,
    payload: DismissDeductionRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    """Dismiss/reject an unpaid leave deduction so it is excluded from payroll."""
    if not payload.reason or len(payload.reason.strip()) < 3:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A valid dismissal reason (minimum 3 characters) is required.")

    ded = db.query(UnpaidLeaveDeduction).filter(UnpaidLeaveDeduction.id == deduction_id).first()
    if not ded:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unpaid leave deduction record not found.")

    if ded.payroll_period_id:
        period = db.query(PayrollPeriod).filter(PayrollPeriod.id == ded.payroll_period_id).first()
        if period and period.status in ["CONFIRMED", "CLOSED"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Payroll period '{period.period_name}' is {period.status} and cannot be modified.")

    ded.status = "DISMISSED"
    ded.dismissal_reason = payload.reason.strip()
    ded.applied_by = admin_user.email
    ded.applied_at = datetime.now()

    audit_entry = AuditLog(
        user_id=admin_user.id,
        user_name=admin_user.email,
        role=admin_user.role,
        action="DISMISS_UNPAID_LEAVE_DEDUCTION",
        target_entity="UnpaidLeaveDeduction",
        target_id=str(ded.id),
        reason=f"Dismissed unpaid leave deduction for guard ID {ded.guard_id}. Reason: {payload.reason.strip()}"
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(ded)

    guard = db.query(Guard).filter(Guard.id == ded.guard_id).first()
    leave = db.query(LeaveRequest).filter(LeaveRequest.id == ded.leave_request_id).first()
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == ded.payroll_period_id).first() if ded.payroll_period_id else None

    return UnpaidLeaveDeductionResponse(
        id=ded.id,
        guard_id=ded.guard_id,
        guard_name=guard.full_name if guard else "Unknown Guard",
        guard_employee_number=guard.employee_number if guard else "CS-00000",
        leave_request_id=ded.leave_request_id,
        payroll_period_id=ded.payroll_period_id,
        period_name=period.period_name if period else "Unassigned Period",
        days_deducted=ded.days_deducted,
        daily_rate=ded.daily_rate,
        amount=ded.amount,
        status=ded.status,
        dismissal_reason=ded.dismissal_reason,
        created_by=ded.created_by,
        created_at=ded.created_at,
        applied_by=ded.applied_by,
        applied_at=ded.applied_at,
        leave_start_date=leave.start_date if leave else date.today(),
        leave_end_date=leave.end_date if leave else date.today(),
        leave_reason=leave.reason if leave else "N/A"
    )

