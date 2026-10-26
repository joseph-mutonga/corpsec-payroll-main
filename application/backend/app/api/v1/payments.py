from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from application.backend.app.api.deps import get_db, require_admin
from application.backend.app.models.payroll import PayrollPeriod
from application.backend.app.models.user import User
from application.backend.app.models.audit import AuditLog
from application.backend.app.services.payment_service import build_payment_schedules_and_reconciliation, mask_sensitive_account
from application.backend.app.services.excel_service import generate_bank_schedule_excel, generate_mpesa_schedule_excel

router = APIRouter(prefix="/payments", tags=["Payment Schedules"])


@router.get("/reconciliation/{period_id}")
def get_payment_reconciliation(
    period_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
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
    admin: User = Depends(require_admin)
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
    admin: User = Depends(require_admin)
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
    admin: User = Depends(require_admin)
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
    admin: User = Depends(require_admin)
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
