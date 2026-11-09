from datetime import datetime
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from application.backend.app.api.deps import get_db, require_admin, require_admin_or_hr
from application.backend.app.models.payroll import PayrollPeriod, PayrollRecord
from application.backend.app.models.user import User
from application.backend.app.models.audit import AuditLog
from application.backend.app.schemas.payroll import HoldSalaryRequest, ReleaseHoldRequest
from application.backend.app.services.payment_service import build_payment_schedules_and_reconciliation, mask_sensitive_account
from application.backend.app.services.excel_service import generate_bank_schedule_excel, generate_mpesa_schedule_excel

router = APIRouter(prefix="/payments", tags=["Payment Schedules"])


@router.get("/reconciliation/{period_id}")
def get_payment_reconciliation(
    period_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """
    Financial Reconciliation Endpoint matching Phase 11 Requirements.
    Verifies Sum(Bank Net Pay) + Sum(M-Pesa Net Pay) + Sum(Unrouted Net Pay) == Total Payroll Net Pay.
    Exposes any unrouted records or duplicate warnings.
    """
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Payroll period #{period_id} not found")

    recon_data = build_payment_schedules_and_reconciliation(db, period_id)

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="GET_RECONCILIATION",
        target_entity="PaymentSchedule",
        target_id=str(period_id),
        new_values=f"Reconciliation run for '{period.period_name}'. Reconciled: {recon_data['is_reconciled']}",
        reason="Admin financial reconciliation audit"
    )
    db.add(audit_entry)
    db.commit()

    return recon_data


@router.get("/bank/{period_id}")
def get_bank_schedule(
    period_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """Retrieve Bank Payment Schedule data matching Screen 14 & Phase 11 requirements."""
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Payroll period #{period_id} not found")

    recon_data = build_payment_schedules_and_reconciliation(db, period_id)

    return {
        "period_id": period.id,
        "period_name": period.period_name,
        "total_employees": recon_data["bank_records_count"],
        "total_amount": recon_data["total_bank_amount"],
        "unrouted_count": recon_data["unrouted_records_count"],
        "duplicate_warnings": recon_data["duplicate_warnings"],
        "items": recon_data["bank_items"]
    }


@router.get("/bank/{period_id}/export-excel")
def export_bank_schedule_excel(
    period_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """Export Bank Payment Schedule as CorpSec formatted Excel workbook (.xlsx)."""
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Payroll period #{period_id} not found")

    recon_data = build_payment_schedules_and_reconciliation(db, period_id)
    items = recon_data["bank_items"]
    excel_bytes = generate_bank_schedule_excel(items, period.period_name)

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="EXPORT_BANK_SCHEDULE",
        target_entity="PaymentSchedule",
        target_id=str(period.id),
        new_values=f"Exported {len(items)} bank payment items (Total: KES {recon_data['total_bank_amount']:,.2f})",
        reason="Exported Bank Payment Schedule Excel"
    )
    db.add(audit_entry)
    db.commit()

    filename = f"Bank_Payment_Schedule_{period.period_name.replace(' ', '_')}.xlsx"
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/mpesa/{period_id}")
def get_mpesa_schedule(
    period_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """Retrieve M-Pesa Payment Schedule data matching Screen 15 & Phase 11 requirements."""
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Payroll period #{period_id} not found")

    recon_data = build_payment_schedules_and_reconciliation(db, period_id)

    return {
        "period_id": period.id,
        "period_name": period.period_name,
        "total_employees": recon_data["mpesa_records_count"],
        "total_amount": recon_data["total_mpesa_amount"],
        "unrouted_count": recon_data["unrouted_records_count"],
        "duplicate_warnings": recon_data["duplicate_warnings"],
        "items": recon_data["mpesa_items"]
    }


@router.get("/mpesa/{period_id}/export-excel")
def export_mpesa_schedule_excel(
    period_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """Export M-Pesa Payment Schedule as CorpSec formatted Excel workbook (.xlsx)."""
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Payroll period #{period_id} not found")

    recon_data = build_payment_schedules_and_reconciliation(db, period_id)
    items = recon_data["mpesa_items"]
    excel_bytes = generate_mpesa_schedule_excel(items, period.period_name)

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="EXPORT_MPESA_SCHEDULE",
        target_entity="PaymentSchedule",
        target_id=str(period.id),
        new_values=f"Exported {len(items)} M-Pesa payment items (Total: KES {recon_data['total_mpesa_amount']:,.2f})",
        reason="Exported M-Pesa Payment Schedule Excel"
    )
    db.add(audit_entry)
    db.commit()

    filename = f"M-Pesa_Payment_Schedule_{period.period_name.replace(' ', '_')}.xlsx"
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ==================== SALARY PAYMENT HOLD & RELEASE ====================

@router.post("/records/{record_id}/hold")
def hold_salary_payment(
    record_id: int,
    payload: HoldSalaryRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """
    Place an employee's monthly salary on hold due to pending issues (damages, disciplinary, etc.).
    Excludes the employee from bank and M-Pesa disbursement schedule export files until resolved.
    """
    rec = db.query(PayrollRecord).filter(PayrollRecord.id == record_id).first()
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll record not found")

    rec.is_on_hold = True
    rec.hold_reason = payload.reason.strip()
    rec.held_by = admin.email
    rec.held_at = datetime.now()
    if payload.notes:
        rec.hold_reason = f"{rec.hold_reason} [Notes: {payload.notes.strip()}]"

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="HOLD_SALARY_PAYMENT",
        target_entity="PayrollRecord",
        target_id=str(record_id),
        new_values=f"Guard ID #{rec.guard_id} placed on hold. Reason: {rec.hold_reason}. Net Pay: KES {rec.net_pay:,.2f}",
        reason="Administrative salary hold"
    )
    db.add(audit_entry)
    db.commit()

    return {
        "success": True,
        "message": f"Salary for employee #{rec.guard_id} successfully placed on HOLD. Excluded from disbursement export files.",
        "record_id": rec.id,
        "is_on_hold": True,
        "hold_reason": rec.hold_reason,
        "held_by": rec.held_by,
        "held_at": rec.held_at
    }


@router.post("/records/{record_id}/release")
def release_salary_hold(
    record_id: int,
    payload: ReleaseHoldRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """
    Release a salary payment hold after issue resolution so the employee can be paid and exported.
    """
    rec = db.query(PayrollRecord).filter(PayrollRecord.id == record_id).first()
    if not rec:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll record not found")

    if not rec.is_on_hold:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This salary record is not on hold.")

    rec.is_on_hold = False
    rec.released_by = admin.email
    rec.released_at = datetime.now()
    rec.release_notes = payload.resolution_notes

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="RELEASE_SALARY_HOLD",
        target_entity="PayrollRecord",
        target_id=str(record_id),
        new_values=f"Guard ID #{rec.guard_id} hold released by {admin.email}. Resolution: {payload.resolution_notes or 'Cleared for payment'}",
        reason="Administrative salary hold release"
    )
    db.add(audit_entry)
    db.commit()

    return {
        "success": True,
        "message": "Salary hold released successfully. Employee has been restored to active disbursement schedules.",
        "record_id": rec.id,
        "is_on_hold": False,
        "released_by": rec.released_by,
        "released_at": rec.released_at,
        "release_notes": rec.release_notes
    }


@router.get("/held/{period_id}")
def get_held_salaries(
    period_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """Retrieve all salary records currently on hold for a specific payroll period."""
    recon = build_payment_schedules_and_reconciliation(db, period_id)
    return {
        "period_id": period_id,
        "total_held_count": recon["held_records_count"],
        "total_held_amount": recon["total_held_amount"],
        "items": recon["held_items"]
    }


@router.get("/guard/{guard_id}/active-record")
def get_guard_active_payroll_record(
    guard_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """
    Retrieve the most recent payroll record for a guard to facilitate
    direct salary holds from Incident Reports and Personnel Files.
    """
    from application.backend.app.models.guard import Guard
    rec = (
        db.query(PayrollRecord)
        .filter(PayrollRecord.guard_id == guard_id)
        .order_by(PayrollRecord.payroll_period_id.desc(), PayrollRecord.id.desc())
        .first()
    )
    if not rec:
        return {"found": False, "message": "No payroll record found for this employee."}

    guard = db.query(Guard).filter(Guard.id == guard_id).first()
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == rec.payroll_period_id).first()

    return {
        "found": True,
        "record_id": rec.id,
        "payroll_period_id": rec.payroll_period_id,
        "period_name": f"{period.month}/{period.year}" if period else "Current Period",
        "guard_id": rec.guard_id,
        "guard_name": guard.full_name if guard else f"Guard #{guard_id}",
        "employee_number": guard.employee_number if guard else f"CS-{guard_id:04d}",
        "net_pay": rec.net_pay,
        "is_on_hold": bool(rec.is_on_hold),
        "hold_reason": rec.hold_reason or "",
        "damage_deduction": rec.damage_deduction or 0.0
    }

