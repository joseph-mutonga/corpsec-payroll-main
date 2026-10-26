import io
import csv
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Response, status, Query
from sqlalchemy.orm import Session

from application.backend.app.api.deps import get_db, require_admin, get_current_user
from application.backend.app.models.payroll import PayrollPeriod, PayrollRecord
from application.backend.app.models.guard import Guard
from application.backend.app.models.user import User
from application.backend.app.models.audit import AuditLog
from application.backend.app.services.p9_service import build_p9_data, generate_p9_pdf

router = APIRouter(prefix="/reports", tags=["Statutory Reports"])


@router.get("/nssf/{period_id}")
def get_nssf_report(
    period_id: int,
    format: Optional[str] = Query("json", description="json or csv"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """NSSF Monthly Statutory Return matching Screen 21."""
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Period not found")

    records = db.query(PayrollRecord).filter(PayrollRecord.payroll_period_id == period.id).all()
    
    rows = []
    total_employee_nssf = 0.0
    total_employer_nssf = 0.0

    for rec in records:
        guard = db.query(Guard).filter(Guard.id == rec.guard_id).first()
        if not guard:
            continue

        emp_nssf = rec.nssf_deduction
        employer_nssf = emp_nssf  # Employer matches employee NSSF 1:1
        tot_nssf = emp_nssf + employer_nssf

        total_employee_nssf += emp_nssf
        total_employer_nssf += employer_nssf

        rows.append({
            "employee_number": guard.employee_number,
            "guard_name": guard.full_name,
            "national_id": guard.national_id,
            "nssf_number": guard.nssf_number or "N/A",
            "gross_pay": rec.gross_pay,
            "employee_deduction": emp_nssf,
            "employer_contribution": employer_nssf,
            "total_nssf": round(tot_nssf, 2)
        })

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Employee ID", "Guard Name", "National ID", "NSSF No", "Gross Pay", "Employee NSSF", "Employer NSSF", "Total NSSF"])
        for r in rows:
            writer.writerow([r["employee_number"], r["guard_name"], r["national_id"], r["nssf_number"], r["gross_pay"], r["employee_deduction"], r["employer_contribution"], r["total_nssf"]])
        
        filename = f"NSSF_Return_{period.period_name.replace(' ', '_')}.csv"
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    return {
        "period_id": period.id,
        "period_name": period.period_name,
        "total_employees": len(rows),
        "total_employee_nssf": round(total_employee_nssf, 2),
        "total_employer_nssf": round(total_employer_nssf, 2),
        "grand_total_nssf": round(total_employee_nssf + total_employer_nssf, 2),
        "items": rows
    }


@router.get("/shif/{period_id}")
def get_shif_report(
    period_id: int,
    format: Optional[str] = Query("json", description="json or csv"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """SHIF Monthly Statutory Return matching Screen 22."""
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Period not found")

    records = db.query(PayrollRecord).filter(PayrollRecord.payroll_period_id == period.id).all()

    rows = []
    total_shif = 0.0

    for rec in records:
        guard = db.query(Guard).filter(Guard.id == rec.guard_id).first()
        if not guard:
            continue

        shif_ded = rec.shif_deduction
        total_shif += shif_ded

        rows.append({
            "employee_number": guard.employee_number,
            "guard_name": guard.full_name,
            "national_id": guard.national_id,
            "shif_number": guard.shif_number or "N/A",
            "gross_pay": rec.gross_pay,
            "shif_deduction": shif_ded
        })

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Employee ID", "Guard Name", "National ID", "SHIF No", "Gross Pay", "SHIF Deduction"])
        for r in rows:
            writer.writerow([r["employee_number"], r["guard_name"], r["national_id"], r["shif_number"], r["gross_pay"], r["shif_deduction"]])

        filename = f"SHIF_Return_{period.period_name.replace(' ', '_')}.csv"
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    return {
        "period_id": period.id,
        "period_name": period.period_name,
        "total_employees": len(rows),
        "total_shif_deduction": round(total_shif, 2),
        "items": rows
    }


@router.get("/housing-levy/{period_id}")
def get_housing_levy_report(
    period_id: int,
    format: Optional[str] = Query("json", description="json or csv"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Housing Levy Monthly Statutory Return matching Screen 23."""
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Period not found")

    records = db.query(PayrollRecord).filter(PayrollRecord.payroll_period_id == period.id).all()

    rows = []
    total_employee_levy = 0.0
    total_employer_levy = 0.0

    for rec in records:
        guard = db.query(Guard).filter(Guard.id == rec.guard_id).first()
        if not guard:
            continue

        emp_levy = rec.housing_levy_deduction
        employer_levy = emp_levy  # Employer matches 1.5% 1:1
        tot_levy = emp_levy + employer_levy

        total_employee_levy += emp_levy
        total_employer_levy += employer_levy

        rows.append({
            "employee_number": guard.employee_number,
            "guard_name": guard.full_name,
            "kra_pin": guard.kra_pin or "N/A",
            "gross_pay": rec.gross_pay,
            "employee_contribution": emp_levy,
            "employer_contribution": employer_levy,
            "total_levy": round(tot_levy, 2)
        })

    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Employee ID", "Guard Name", "KRA PIN", "Gross Pay", "Employee Levy (1.5%)", "Employer Levy (1.5%)", "Total Levy (3.0%)"])
        for r in rows:
            writer.writerow([r["employee_number"], r["guard_name"], r["kra_pin"], r["gross_pay"], r["employee_contribution"], r["employer_contribution"], r["total_levy"]])

        filename = f"Housing_Levy_Return_{period.period_name.replace(' ', '_')}.csv"
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    return {
        "period_id": period.id,
        "period_name": period.period_name,
        "total_employees": len(rows),
        "total_employee_levy": round(total_employee_levy, 2),
        "total_employer_levy": round(total_employer_levy, 2),
        "grand_total_housing_levy": round(total_employee_levy + total_employer_levy, 2),
        "items": rows
    }


@router.get("/p9/{guard_id}/{year}")
def get_p9_report(
    guard_id: int,
    year: int,
    format: Optional[str] = Query("json", description="json or pdf"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """KRA P9 Tax Deduction Card Form matching Screen 24."""
    # Guard self-service restriction
    if current_user.role == "GUARD" and current_user.guard_id != guard_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized to view P9 for other guards")

    p9_data = build_p9_data(db, guard_id, year)
    if not p9_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guard not found")

    if format == "pdf":
        pdf_bytes = generate_p9_pdf(p9_data)
        filename = f"KRA_P9_{p9_data['employee_number']}_{year}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    return p9_data
