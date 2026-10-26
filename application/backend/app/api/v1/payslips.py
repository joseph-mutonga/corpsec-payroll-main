import io
import zipfile
from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Response, status, Query
from sqlalchemy.orm import Session

from application.backend.app.api.deps import get_db, require_admin, require_guard, get_current_user
from application.backend.app.models.payroll import PayrollPeriod, PayrollRecord, Payslip
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.user import User, UserRole
from application.backend.app.models.audit import AuditLog
from application.backend.app.services.pdf_service import generate_payslip_pdf

router = APIRouter(prefix="/payslips", tags=["Payslips Management"])


def build_payslip_dict(rec: PayrollRecord, guard: Guard, site: Optional[Site], period: PayrollPeriod, db: Optional[Session] = None) -> dict:
    import json
    from application.backend.app.models.payroll import UnpaidLeaveDeduction
    paye_b = None
    if getattr(rec, 'paye_breakdown_json', None):
        try:
            paye_b = json.loads(rec.paye_breakdown_json)
        except Exception:
            paye_b = None

    has_real_attendance = bool(rec and rec.days_worked > 0)
    days_w = rec.days_worked if has_real_attendance else 26

    unpaid_days = 0
    if db and rec:
        applied_deds = db.query(UnpaidLeaveDeduction).filter(
            UnpaidLeaveDeduction.guard_id == rec.guard_id,
            UnpaidLeaveDeduction.payroll_period_id == rec.payroll_period_id,
            UnpaidLeaveDeduction.status == "APPLIED"
        ).all()
        unpaid_days = sum(d.days_deducted for d in applied_deds)

    period_start = period.start_date
    period_end = period.end_date
    days_in_month = (period_end - period_start).days + 1
    emp_start = max(period_start, guard.hire_date) if guard.hire_date else period_start
    emp_end = period_end
    if emp_start > period_end:
        days_employed = 0
    else:
        days_employed = (emp_end - emp_start).days + 1
    days_employed = min(days_employed, days_in_month)

    return {
        "payslip_number": f"PAY-{period.year}{period.month:02d}-{guard.employee_number}",
        "period_name": period.period_name,
        "employee_number": guard.employee_number,
        "guard_name": guard.full_name,
        "site_name": site.site_name if site else "N/A",
        "payment_method": guard.payment_method or "Bank Transfer",
        "nssf_number": guard.nssf_number or "N/A",
        "shif_number": guard.shif_number or "N/A",
        "days_worked": days_w,
        "days_employed": days_employed,
        "days_in_month": days_in_month,
        "has_real_attendance": has_real_attendance,
        "unpaid_leave_days": unpaid_days,
        "regular_hours": rec.regular_hours,
        "overtime_hours": rec.overtime_hours,
        "basic_pay": rec.basic_pay,
        "overtime_pay": rec.overtime_pay,
        "allowances": rec.allowances,
        "gross_pay": rec.gross_pay,
        "nssf_deduction": rec.nssf_deduction,
        "shif_deduction": rec.shif_deduction,
        "housing_levy_deduction": rec.housing_levy_deduction,
        "paye_deduction": rec.paye_deduction,
        "paye_breakdown": paye_b,
        "unpaid_leave_deduction": getattr(rec, "unpaid_leave_deduction", 0.0),
        "other_deductions": rec.other_deductions,
        "total_deductions": rec.total_deductions,
        "net_pay": rec.net_pay,
    }


@router.get("/preview/{payroll_record_id}")
def preview_payslip(
    payroll_record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Preview Payslip earnings and deductions breakdown matching Screen 12."""
    rec = db.query(PayrollRecord).filter(PayrollRecord.id == payroll_record_id).first()
    if not rec:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payroll record not found"
        )

    if current_user.role == UserRole.GUARD.value and current_user.guard_id != rec.guard_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized to view this payslip"
        )

    guard = db.query(Guard).filter(Guard.id == rec.guard_id).first()
    site = db.query(Site).filter(Site.id == rec.site_id).first()
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == rec.payroll_period_id).first()

    return build_payslip_dict(rec, guard, site, period, db)


@router.get("/my-latest/pdf")
def download_my_latest_payslip_pdf(
    db: Session = Depends(get_db),
    guard_user: User = Depends(require_guard)
):
    """Download latest Payslip PDF for current logged-in guard."""
    guard = db.query(Guard).filter(Guard.id == guard_user.guard_id).first()
    if not guard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Guard profile not found"
        )

    rec = db.query(PayrollRecord).filter(
        PayrollRecord.guard_id == guard.id
    ).order_by(PayrollRecord.id.desc()).first()

    site = db.query(Site).filter(Site.id == guard.primary_site_id).first()

    if rec:
        period = db.query(PayrollPeriod).filter(PayrollPeriod.id == rec.payroll_period_id).first()
        data = build_payslip_dict(rec, guard, site, period, db)
    else:
        # Generate estimated current payslip if no payroll run exists yet
        today = date.today()
        period_name = today.strftime("%B %Y")
        base = guard.basic_salary or 18000.0
        housing_levy = round(base * 0.015, 2)
        nssf = 1080.0
        shif = round(base * 0.0275, 2)
        paye = round(base * 0.10, 2)
        tot_ded = housing_levy + nssf + shif + paye
        net = base - tot_ded
        data = {
            "payslip_number": f"PAY-{today.strftime('%Y%m')}-{guard.employee_number}",
            "period_name": period_name,
            "employee_number": guard.employee_number,
            "guard_name": guard.full_name,
            "site_name": site.site_name if site else "Assigned Site",
            "payment_method": guard.payment_method or "BANK_TRANSFER",
            "nssf_number": guard.nssf_number or "NSSF-PENDING",
            "shif_number": guard.shif_number or "SHIF-PENDING",
            "days_worked": 26,
            "has_real_attendance": False,
            "unpaid_leave_days": 0,
            "regular_hours": 208.0,
            "overtime_hours": 0.0,
            "basic_pay": base,
            "overtime_pay": 0.0,
            "allowances": 0.0,
            "gross_pay": base,
            "nssf_deduction": nssf,
            "shif_deduction": shif,
            "housing_levy_deduction": housing_levy,
            "paye_deduction": paye,
            "other_deductions": 0.0,
            "total_deductions": tot_ded,
            "net_pay": net,
        }

    pdf_bytes = generate_payslip_pdf(data)
    filename = f"Payslip_{guard.employee_number}_{data['period_name'].replace(' ', '_')}.pdf"

    audit_entry = AuditLog(
        user_id=guard_user.id,
        user_name=guard_user.email,
        role=guard_user.role,
        action="GENERATE_PAYSLIP_PDF",
        target_entity="Payslip",
        target_id=data["payslip_number"],
        reason="Downloaded latest PDF payslip"
    )
    db.add(audit_entry)
    db.commit()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/{payroll_record_id}/pdf")
def download_payslip_pdf(
    payroll_record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Download individual Payslip as PDF file."""
    rec = db.query(PayrollRecord).filter(PayrollRecord.id == payroll_record_id).first()
    if not rec:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payroll record not found"
        )

    if current_user.role == UserRole.GUARD.value and current_user.guard_id != rec.guard_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized to download this payslip"
        )

    guard = db.query(Guard).filter(Guard.id == rec.guard_id).first()
    site = db.query(Site).filter(Site.id == rec.site_id).first()
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == rec.payroll_period_id).first()

    data = build_payslip_dict(rec, guard, site, period, db)
    pdf_bytes = generate_payslip_pdf(data)

    filename = f"Payslip_{guard.employee_number}_{period.period_name.replace(' ', '_')}.pdf"

    audit_entry = AuditLog(
        user_id=current_user.id,
        user_name=current_user.email,
        role=current_user.role,
        action="GENERATE_PAYSLIP_PDF",
        target_entity="Payslip",
        target_id=data["payslip_number"],
        reason="Downloaded PDF payslip"
    )
    db.add(audit_entry)
    db.commit()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/bulk-zip/{period_id}")
@router.post("/bulk-generate")
def bulk_generate_payslips(
    period_id: int,
    only_active: bool = Query(True),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Bulk generate PDF payslips for a period archived into a single ZIP file (matching Screen 13)."""
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
    if not period:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payroll period not found"
        )

    records = db.query(PayrollRecord).filter(PayrollRecord.payroll_period_id == period.id).all()
    if not records:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No calculated payroll records found for this period."
        )

    zip_buffer = io.BytesIO()
    count = 0

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for rec in records:
            guard = db.query(Guard).filter(Guard.id == rec.guard_id).first()
            if not guard:
                continue
            if only_active and guard.status != "ACTIVE":
                continue

            site = db.query(Site).filter(Site.id == rec.site_id).first()
            data = build_payslip_dict(rec, guard, site, period, db)
            pdf_bytes = generate_payslip_pdf(data)
            
            filename = f"Payslip_{guard.employee_number}_{guard.full_name.replace(' ', '_')}.pdf"
            zf.writestr(filename, pdf_bytes)
            count += 1

    zip_buffer.seek(0)

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="BULK_PAYSLIP_GENERATE",
        target_entity="PayrollPeriod",
        target_id=str(period.id),
        new_values=f"Generated {count} PDF payslips in ZIP bundle",
        reason="Bulk payslip generation"
    )
    db.add(audit_entry)
    db.commit()

    zip_name = f"Payslips_Bulk_{period.period_name.replace(' ', '_')}.zip"
    return Response(
        content=zip_buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={zip_name}"}
    )
