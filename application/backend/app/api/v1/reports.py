import io
import csv
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Response, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from application.backend.app.api.deps import get_db, require_admin, require_admin_or_hr, get_current_user
from application.backend.app.models.payroll import PayrollPeriod, PayrollRecord
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.attendance import Attendance
from application.backend.app.models.user import User
from application.backend.app.models.audit import AuditLog
from application.backend.app.services.p9_service import build_p9_data, generate_p9_pdf

router = APIRouter(prefix="/reports", tags=["Statutory Reports"])


@router.get("/analytics")
def get_analytics_overview(
    period_id: Optional[int] = Query(None, description="Specific payroll period ID to inspect"),
    year: Optional[int] = Query(None, description="Calendar year for monthly activity trend"),
    month: Optional[int] = Query(None, description="Specific calendar month (1-12) to inspect"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """
    Performance Overview Analytics endpoint.
    Retrieves live aggregated metrics from MySQL database:
    1. Top KPI Summary Cards (Gross Payroll, Shifts Logged, Active Guards, Overtime Hours, Company Outflow)
    2. Monthly Activity Trend for the bar chart (Gross & Net payroll per month)
    3. Statutory Deductions Breakdown (PAYE, NSSF, SHIF, Housing Levy)
    4. Site Placement Distribution (guards per site, percentage)
    5. Financial Transactions Ledger for any month & year (Bank & M-Pesa disbursements)
    6. Available Payroll Periods and Active Guards for statutory report downloads
    """
    target_year = year or 2026
    all_periods = db.query(PayrollPeriod).order_by(PayrollPeriod.year.desc(), PayrollPeriod.month.desc()).all()

    active_period = None
    if period_id:
        active_period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
    elif month:
        active_period = db.query(PayrollPeriod).filter(
            PayrollPeriod.year == target_year,
            PayrollPeriod.month == month
        ).first()

    if not active_period and all_periods:
        # Match period in target_year with records, else first in year, else first period
        year_periods = [p for p in all_periods if p.year == target_year]
        for p in year_periods:
            if db.query(PayrollRecord).filter(PayrollRecord.payroll_period_id == p.id).count() > 0:
                active_period = p
                break
        if not active_period and year_periods:
            active_period = year_periods[0]
        elif not active_period:
            active_period = all_periods[0]

    # 1. Selected period payroll calculations & transactions
    total_gross = 0.0
    total_net = 0.0
    total_paye = 0.0
    total_nssf_emp = 0.0
    total_nssf_employer = 0.0
    total_shif = 0.0
    total_housing_emp = 0.0
    total_housing_employer = 0.0
    period_record_count = 0

    transactions_list = []
    bank_total = 0.0
    mpesa_total = 0.0
    bank_count = 0
    mpesa_count = 0

    if active_period:
        records = db.query(PayrollRecord).filter(PayrollRecord.payroll_period_id == active_period.id).all()
        period_record_count = len(records)
        for r in records:
            total_gross += float(r.gross_pay or 0.0)
            total_net += float(r.net_pay or 0.0)
            total_paye += float(r.paye_deduction or 0.0)
            emp_nssf = float(r.nssf_deduction or 0.0)
            employer_nssf = float(getattr(r, "employer_nssf_deduction", None) or emp_nssf)
            total_nssf_emp += emp_nssf
            total_nssf_employer += employer_nssf
            total_shif += float(r.shif_deduction or 0.0)
            emp_hl = float(r.housing_levy_deduction or 0.0)
            employer_hl = float(getattr(r, "employer_housing_levy_deduction", None) or emp_hl)
            total_housing_emp += emp_hl
            total_housing_employer += employer_hl

            # Transactions compilation
            g = db.query(Guard).filter(Guard.id == r.guard_id).first()
            g_name = g.full_name if g else f"Guard #{r.guard_id}"
            g_emp = g.employee_number if g else "CS-00000"
            pay_method = (g.payment_method if g and g.payment_method else "Bank Transfer")
            acc_num = (g.bank_account if pay_method == "Bank Transfer" and g else (g.mpesa_number if g else "-")) or "-"
            bank_name = g.bank_name if g and pay_method == "Bank Transfer" and g.bank_name else ("Safaricom M-Pesa" if pay_method == "M-Pesa" else "Equity Bank")

            net_amt = float(r.net_pay or 0.0)
            if pay_method == "Bank Transfer":
                bank_total += net_amt
                bank_count += 1
            else:
                mpesa_total += net_amt
                mpesa_count += 1

            transactions_list.append({
                "transaction_ref": f"TXN-{active_period.year}{active_period.month:02d}-{r.id:04d}",
                "record_id": r.id,
                "guard_id": r.guard_id,
                "guard_name": g_name,
                "guard_employee_number": g_emp,
                "payment_method": pay_method,
                "institution": bank_name,
                "account_number": acc_num,
                "gross_pay": round(float(r.gross_pay or 0.0), 2),
                "total_deductions": round(float(r.total_deductions or 0.0), 2),
                "amount": round(net_amt, 2),
                "status": "DISBURSED" if active_period.status in ["CONFIRMED", "CLOSED"] else "SCHEDULED",
                "payment_date": active_period.end_date.strftime("%Y-%m-%d") if active_period.end_date else str(date.today())
            })

    total_nssf = total_nssf_emp + total_nssf_employer
    total_housing = total_housing_emp + total_housing_employer
    total_statutory = total_paye + total_nssf + total_shif + total_housing
    total_company_outflow = total_gross + total_nssf_employer + total_housing_employer

    # 2. System-wide KPIs
    active_guards_count = db.query(Guard).filter(Guard.status == "ACTIVE").count()
    all_shifts_count = db.query(Attendance).count()
    all_ot_hours = float(db.query(func.coalesce(func.sum(Attendance.overtime_hours), 0.0)).scalar() or 0.0)

    # 3. Monthly Activity Trend for the requested calendar year
    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    monthly_trend = []
    max_month_gross = 1.0

    for m in range(1, 13):
        m_period = db.query(PayrollPeriod).filter(PayrollPeriod.year == target_year, PayrollPeriod.month == m).first()
        if m_period:
            m_recs = db.query(PayrollRecord).filter(PayrollRecord.payroll_period_id == m_period.id).all()
            m_gross = sum(float(r.gross_pay or 0.0) for r in m_recs)
            m_net = sum(float(r.net_pay or 0.0) for r in m_recs)
            m_shifts = db.query(Attendance).filter(
                Attendance.shift_date >= m_period.start_date,
                Attendance.shift_date <= m_period.end_date
            ).count()
            if m_gross > max_month_gross:
                max_month_gross = m_gross

            monthly_trend.append({
                "month_num": m,
                "month_label": month_names[m - 1],
                "period_id": m_period.id,
                "period_name": m_period.period_name,
                "status": m_period.status,
                "gross_pay": round(m_gross, 2),
                "net_pay": round(m_net, 2),
                "shifts_logged": m_shifts,
                "has_data": len(m_recs) > 0
            })
        else:
            monthly_trend.append({
                "month_num": m,
                "month_label": month_names[m - 1],
                "period_id": None,
                "period_name": f"{month_names[m - 1]} {target_year}",
                "status": "UNCONFIGURED",
                "gross_pay": 0.0,
                "net_pay": 0.0,
                "shifts_logged": 0,
                "has_data": False
            })

    for m in monthly_trend:
        if m["has_data"] and max_month_gross > 0:
            m["gross_pct"] = max(12, min(100, round((m["gross_pay"] / max_month_gross) * 100)))
            m["net_pct"] = max(10, min(95, round((m["net_pay"] / max_month_gross) * 100)))
        else:
            m["gross_pct"] = 8
            m["net_pct"] = 8

    # 4. Site Placement Distribution
    sites = db.query(Site).all()
    site_distribution = []
    for s in sites:
        cnt = db.query(Guard).filter(Guard.primary_site_id == s.id, Guard.status == "ACTIVE").count()
        pct = round((cnt / active_guards_count * 100), 1) if active_guards_count > 0 else 0.0
        site_distribution.append({
            "site_id": s.id,
            "site_name": s.site_name,
            "location": s.location or "Nairobi",
            "guard_count": cnt,
            "percentage": pct
        })

    # 5. List of available periods and available years
    available_years = sorted(list({2024, 2025, 2026, 2027}.union({p.year for p in all_periods})), reverse=True)
    periods_list = [
        {
            "id": p.id,
            "period_name": p.period_name,
            "year": p.year,
            "month": p.month,
            "status": p.status,
            "is_selected": active_period is not None and p.id == active_period.id
        }
        for p in all_periods
    ]

    # 6. Active guards for P9 export
    guards_list = [
        {
            "id": g.id,
            "employee_number": g.employee_number,
            "full_name": g.full_name,
            "national_id": g.national_id,
            "kra_pin": g.kra_pin or "Pending"
        }
        for g in db.query(Guard).filter(Guard.status == "ACTIVE").order_by(Guard.employee_number.asc()).all()
    ]

    return {
        "active_period": {
            "id": active_period.id if active_period else None,
            "name": active_period.period_name if active_period else "No Period Active",
            "status": active_period.status if active_period else "NONE",
            "year": active_period.year if active_period else target_year,
            "month": active_period.month if active_period else None,
            "records_count": period_record_count
        },
        "kpis": {
            "monthly_payroll_gross": round(total_gross, 2),
            "monthly_payroll_net": round(total_net, 2),
            "total_company_cost": round(total_company_outflow, 2),
            "completed_shifts": all_shifts_count,
            "active_guards": active_guards_count,
            "overtime_hours": round(all_ot_hours, 1)
        },
        "company_finances": {
            "period_name": active_period.period_name if active_period else f"{target_year}",
            "gross_payroll": round(total_gross, 2),
            "net_disbursed": round(total_net, 2),
            "employer_statutory_obligations": round(total_nssf_employer + total_housing_employer, 2),
            "total_company_outflow": round(total_company_outflow, 2),
            "total_transactions_count": period_record_count,
            "bank_disbursed": round(bank_total, 2),
            "bank_transactions_count": bank_count,
            "mpesa_disbursed": round(mpesa_total, 2),
            "mpesa_transactions_count": mpesa_count,
            "transactions": transactions_list
        },
        "statutory_deductions": {
            "total_deductions": round(total_statutory, 2),
            "paye": round(total_paye, 2),
            "nssf_employee": round(total_nssf_emp, 2),
            "nssf_employer": round(total_nssf_employer, 2),
            "nssf_total": round(total_nssf, 2),
            "shif": round(total_shif, 2),
            "housing_employee": round(total_housing_emp, 2),
            "housing_employer": round(total_housing_employer, 2),
            "housing_total": round(total_housing, 2)
        },
        "available_years": available_years,
        "monthly_trend": monthly_trend,
        "site_distribution": site_distribution,
        "periods": periods_list,
        "guards": guards_list
    }


@router.get("/nssf/{period_id}")
def get_nssf_report(
    period_id: int,
    format: Optional[str] = Query("json", description="json or csv"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
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

        emp_nssf = rec.nssf_deduction or 0.0
        stored_employer = getattr(rec, "employer_nssf_deduction", None)
        employer_nssf = emp_nssf if stored_employer is None else stored_employer
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
    admin: User = Depends(require_admin_or_hr)
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
    admin: User = Depends(require_admin_or_hr)
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

        emp_levy = rec.housing_levy_deduction or 0.0
        stored_employer_levy = getattr(rec, "employer_housing_levy_deduction", None)
        if stored_employer_levy is None:
            employer_levy = emp_levy
        else:
            employer_levy = stored_employer_levy
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
    # Role restrictions: Supervisors cannot access statutory tax cards
    if current_user.role == "SUPERVISOR":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Supervisor role is unauthorized to view KRA P9 statutory reports."
        )

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
