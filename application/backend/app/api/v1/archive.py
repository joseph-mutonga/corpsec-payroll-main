from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from application.backend.app.api.deps import get_db, require_admin
from application.backend.app.models.payroll import PayrollPeriod, PayrollRecord
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.archive import ArchivePayroll, ArchivePayrollItem
from application.backend.app.models.user import User
from application.backend.app.models.audit import AuditLog
from application.backend.app.schemas.setting import ArchivePayrollResponse

router = APIRouter(prefix="/archive", tags=["Payroll Archive"])


@router.post("/{period_id}", response_model=ArchivePayrollResponse)
def archive_payroll_period(
    period_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Archive a confirmed payroll period for permanent compliance storage (Screen 18).
    Creates immutable ArchivePayroll snapshot and closes the period.
    """
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll period not found")

    if period.status == "CLOSED":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payroll period is already closed and archived.")

    existing_archive = db.query(ArchivePayroll).filter(ArchivePayroll.payroll_period_id == period.id).first()
    if existing_archive:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Period archive snapshot already exists.")

    records = db.query(PayrollRecord).filter(PayrollRecord.payroll_period_id == period.id).all()
    if not records:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No payroll records found to archive.")

    total_gross = sum(r.gross_pay for r in records)
    total_deductions = sum(r.total_deductions for r in records)
    total_net = sum(r.net_pay for r in records)

    archive = ArchivePayroll(
        payroll_period_id=period.id,
        period_name=period.period_name,
        year=period.year,
        month=period.month,
        total_guards=len(records),
        total_gross_pay=round(total_gross, 2),
        total_deductions=round(total_deductions, 2),
        total_net_pay=round(total_net, 2),
        closed_by=admin.email,
        closed_at=datetime.now()
    )
    db.add(archive)
    db.commit()
    db.refresh(archive)

    # Archive items
    archive_items = []
    for rec in records:
        guard = db.query(Guard).filter(Guard.id == rec.guard_id).first()
        site = db.query(Site).filter(Site.id == rec.site_id).first()
        
        emp_num = guard.employee_number if guard else f"CS-{rec.guard_id:05d}"
        gname = guard.full_name if guard else f"Guard #{rec.guard_id}"
        sname = site.site_name if site else "N/A"
        pmethod = guard.payment_method if guard else "Bank Transfer"
        acct = (guard.bank_account if guard and guard.payment_method == "Bank Transfer" else (guard.mpesa_number if guard else "")) or ""

        item = ArchivePayrollItem(
            archive_payroll_id=archive.id,
            guard_id=rec.guard_id,
            employee_number=emp_num,
            guard_name=gname,
            site_name=sname,
            days_worked=rec.days_worked,
            regular_hours=rec.regular_hours,
            overtime_hours=rec.overtime_hours,
            basic_pay=rec.basic_pay,
            overtime_pay=rec.overtime_pay,
            allowances=rec.allowances,
            gross_pay=rec.gross_pay,
            nssf_deduction=rec.nssf_deduction,
            shif_deduction=rec.shif_deduction,
            housing_levy_deduction=rec.housing_levy_deduction,
            paye_deduction=rec.paye_deduction,
            other_deductions=rec.other_deductions,
            total_deductions=rec.total_deductions,
            net_pay=rec.net_pay,
            payment_method=pmethod,
            bank_account_or_mpesa=acct
        )
        archive_items.append(item)
    
    db.add_all(archive_items)

    # Close the payroll period
    period.status = "CLOSED"
    period.closed_at = datetime.now()
    period.closed_by = admin.email

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="ARCHIVE_PAYROLL_PERIOD",
        target_entity="ArchivePayroll",
        target_id=str(archive.id),
        new_values=f"Archived '{period.period_name}' with {len(records)} records (Gross: KES {total_gross:,.2f})",
        reason="Admin permanently archived closed payroll period"
    )
    db.add(audit_entry)
    db.commit()

    return archive


@router.get("", response_model=List[ArchivePayrollResponse])
def list_archived_payrolls(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """List all permanently archived payroll snapshots."""
    return db.query(ArchivePayroll).order_by(ArchivePayroll.year.desc(), ArchivePayroll.month.desc()).all()


@router.get("/{period_id}")
def get_archived_payroll_details(
    period_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Retrieve full historical data of an archived payroll snapshot."""
    archive = db.query(ArchivePayroll).filter(ArchivePayroll.payroll_period_id == period_id).first()
    if not archive:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archived payroll record not found.")

    items = db.query(ArchivePayrollItem).filter(ArchivePayrollItem.archive_payroll_id == archive.id).all()

    return {
        "archive": archive,
        "items": items
    }
