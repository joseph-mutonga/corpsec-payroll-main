from datetime import datetime, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from application.backend.app.api.deps import get_db, require_admin, get_current_user
from application.backend.app.models.payroll import (
    PayrollPeriod, PayrollRecord, PayrollError, Payslip, BankPaymentSchedule, BankPaymentItem, UnpaidLeaveDeduction
)
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.attendance import Attendance
from application.backend.app.models.user import User, UserRole
from application.backend.app.models.audit import AuditLog
from application.backend.app.models.off_day import OffDayAllowance, OffDayRequest, RelieverAssignment
from application.backend.app.schemas.payroll import (
    PayrollPeriodCreate, PayrollPeriodResponse, PayrollRecordResponse,
    PayrollCalculationSummary, PayrollErrorResponse, ResolveErrorRequest
)
from application.backend.app.services.payroll_engine import (
    calculate_guard_payroll, get_active_statutory_rates, calculate_nssf, calculate_shif, calculate_housing_levy, calculate_paye_details
)
from application.backend.app.models.attendance import OvertimeClaim
from application.backend.app.services.payroll_validator import validate_payroll_period

router = APIRouter(prefix="/payroll", tags=["Payroll Calculation Engine"])


@router.post("/periods", response_model=PayrollPeriodResponse, status_code=status.HTTP_201_CREATED)
def create_payroll_period(
    payload: PayrollPeriodCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Create a new payroll period (Screen 11)."""
    existing = db.query(PayrollPeriod).filter(
        PayrollPeriod.year == payload.year,
        PayrollPeriod.month == payload.month
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payroll period for {payload.period_name} already exists."
        )

    period = PayrollPeriod(
        year=payload.year,
        month=payload.month,
        period_name=payload.period_name,
        start_date=payload.start_date,
        end_date=payload.end_date,
        status="DRAFT"
    )
    db.add(period)
    
    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="CREATE_PAYROLL_PERIOD",
        target_entity="PayrollPeriod",
        target_id=payload.period_name,
        reason="Created payroll calculation period"
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(period)
    return period


@router.get("/periods", response_model=List[PayrollPeriodResponse])
def list_payroll_periods(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Fetch all payroll periods."""
    return db.query(PayrollPeriod).order_by(PayrollPeriod.year.desc(), PayrollPeriod.month.desc()).all()


@router.post("/{period_id}/calculate", response_model=PayrollCalculationSummary)
def execute_payroll_calculation(
    period_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Guided Payroll Engine Step: Execute calculations (Screen 11).
    Calculates Gross Pay, Overtime, NSSF, SHIF, Housing Levy, and PAYE for all active guards.
    """
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll period not found")

    if period.status in ["CONFIRMED", "CLOSED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payroll period is Closed ({period.status}) and cannot be recalculated."
        )

    # Clear previous draft records for this period
    db.query(PayrollRecord).filter(PayrollRecord.payroll_period_id == period.id).delete()

    active_guards = db.query(Guard).filter(Guard.status == "ACTIVE").all()
    calculated_records = []
    
    total_gross = 0.0
    total_net = 0.0
    total_nssf = 0.0
    total_shif = 0.0
    total_housing = 0.0
    total_paye = 0.0

    for guard in active_guards:
        # Sum guard attendance for the period (include PRESENT, LATE, and OVERTIME statuses)
        attendances = db.query(Attendance).filter(
            Attendance.guard_id == guard.id,
            Attendance.shift_date >= period.start_date,
            Attendance.shift_date <= period.end_date,
            Attendance.status.in_(["PRESENT", "LATE", "OVERTIME"])
        ).all()

        days_worked = len(attendances)
        reg_hours = sum(a.regular_hours for a in attendances)

        # Overtime calculation: ONLY include hours & pay from APPROVED OvertimeClaims
        att_ids = [a.id for a in attendances]
        approved_ot_hours = 0.0
        approved_ot_pay = 0.0

        site = db.query(Site).filter(Site.id == guard.primary_site_id).first()
        try:
            effective_basic_salary = guard.effective_basic_salary
        except ValueError as err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(err)
            )

        hourly_rate = effective_basic_salary / 26.0 / 12.0
        night_allowance = site.night_allowance if site else 0.0

        if att_ids:
            approved_claims = db.query(OvertimeClaim).filter(
                OvertimeClaim.attendance_id.in_(att_ids),
                OvertimeClaim.status == "APPROVED"
            ).all()

            raw_ot_pay = 0.0
            for claim in approved_claims:
                approved_ot_hours += claim.hours_claimed
                raw_ot_pay += (claim.hours_claimed * hourly_rate * claim.multiplier)
            approved_ot_pay = round(raw_ot_pay, 2)

        # Proration calculation for mid-month hires / exits
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
        proration_factor = days_employed / float(days_in_month) if days_in_month > 0 else 1.0

        # Query Reliever Assignments for this guard in this period
        reliever_asgns = db.query(RelieverAssignment).filter(
            RelieverAssignment.reliever_guard_id == guard.id,
            RelieverAssignment.shift_date >= period.start_date,
            RelieverAssignment.shift_date <= period.end_date
        ).all()
        raw_reliever_earnings = 0.0
        for r_asgn in reliever_asgns:
            c_site = db.query(Site).filter(Site.id == r_asgn.site_id).first()
            if not c_site or c_site.basic_salary is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Reliever calculation error: Site #{r_asgn.site_id} has no basic salary configured."
                )
            raw_reliever_earnings += (c_site.basic_salary / 26.0)
        reliever_earnings = round(raw_reliever_earnings, 2)

        calc_result = calculate_guard_payroll(
            basic_salary=effective_basic_salary,
            daily_rate=site.daily_rate if site else 1200.0,
            days_worked=days_worked,
            overtime_hours=approved_ot_hours,
            allowances=night_allowance,
            reliever_earnings=reliever_earnings,
            proration_factor=proration_factor,
            db=db,
            target_date=period.start_date
        )

        if approved_ot_hours > 0 and approved_ot_pay > 0:
            calc_result["overtime_pay"] = approved_ot_pay
            calc_result["gross_pay"] = round(calc_result["basic_pay"] + approved_ot_pay + calc_result["allowances"] + reliever_earnings, 2)

            stat_rates = get_active_statutory_rates(db, period.start_date)
            nssf_ded = calculate_nssf(calc_result["gross_pay"], nssf_tiers=stat_rates["nssf_tiers"]) if stat_rates else calculate_nssf(calc_result["gross_pay"])
            shif_ded = calculate_shif(calc_result["gross_pay"], shif_obj=stat_rates["shif"]) if stat_rates else calculate_shif(calc_result["gross_pay"])
            housing_levy_ded = calculate_housing_levy(calc_result["gross_pay"], housing_obj=stat_rates["housing"]) if stat_rates else calculate_housing_levy(calc_result["gross_pay"])
            taxable_pay = max(0.0, calc_result["gross_pay"] - nssf_ded)
            paye_details = calculate_paye_details(taxable_pay, paye_bands=stat_rates["paye_bands"], relief_obj=stat_rates["paye_relief"]) if stat_rates else calculate_paye_details(taxable_pay)

            calc_result["nssf_deduction"] = nssf_ded
            calc_result["nssf"] = nssf_ded
            calc_result["shif_deduction"] = shif_ded
            calc_result["shif"] = shif_ded
            calc_result["housing_levy_deduction"] = housing_levy_ded
            calc_result["housing_levy"] = housing_levy_ded
            calc_result["paye_deduction"] = paye_details["net_paye"]
            calc_result["paye"] = paye_details["net_paye"]

        # Query APPLIED unpaid leave deductions for this guard and period
        applied_leave_deds = db.query(UnpaidLeaveDeduction).filter(
            UnpaidLeaveDeduction.guard_id == guard.id,
            UnpaidLeaveDeduction.payroll_period_id == period.id,
            UnpaidLeaveDeduction.status == "APPLIED"
        ).all()
        raw_unpaid_leave_amount = round(sum(d.amount for d in applied_leave_deds), 2)
        unpaid_leave_amount = min(raw_unpaid_leave_amount, calc_result["basic_pay"])

        # Query APPROVED Off-Day Requests for this guard overlapping this period
        approved_off_requests = db.query(OffDayRequest).filter(
            OffDayRequest.guard_id == guard.id,
            OffDayRequest.status == "APPROVED",
            OffDayRequest.start_date <= period.end_date,
            OffDayRequest.end_date >= period.start_date
        ).all()

        off_day_count = 0
        for off_req in approved_off_requests:
            c_start = max(off_req.start_date, period.start_date)
            c_end = min(off_req.end_date, period.end_date)
            if c_end >= c_start:
                off_day_count += (c_end - c_start).days + 1

        raw_off_day_deduction = round(off_day_count * (effective_basic_salary / 26.0), 2)
        off_day_deduction_amount = min(raw_off_day_deduction, calc_result["basic_pay"])

        statutory_deds = round(calc_result["nssf"] + calc_result["shif"] + calc_result["housing_levy"] + calc_result["paye"], 2)
        calc_result["unpaid_leave_deduction"] = unpaid_leave_amount
        calc_result["off_day_deduction"] = off_day_deduction_amount
        calc_result["reliever_earnings"] = reliever_earnings
        calc_result["total_deductions"] = round(statutory_deds + unpaid_leave_amount + off_day_deduction_amount, 2)
        calc_result["net_pay"] = round(max(0.0, calc_result["gross_pay"] - calc_result["total_deductions"]), 2)

        import json
        paye_json_str = json.dumps(calc_result.get("paye_breakdown", {}))

        rec = PayrollRecord(
            payroll_period_id=period.id,
            guard_id=guard.id,
            site_id=guard.primary_site_id or (site.id if site else 1),
            days_worked=days_worked,
            regular_hours=reg_hours,
            overtime_hours=approved_ot_hours,
            basic_pay=calc_result["basic_pay"],
            overtime_pay=calc_result["overtime_pay"],
            allowances=calc_result["allowances"],
            gross_pay=calc_result["gross_pay"],
            nssf_deduction=calc_result["nssf"],
            shif_deduction=calc_result["shif"],
            housing_levy_deduction=calc_result["housing_levy"],
            paye_deduction=calc_result["paye"],
            employer_nssf_deduction=calc_result.get("employer_nssf", calc_result["nssf"]),
            employer_housing_levy_deduction=calc_result.get("employer_housing_levy", calc_result["housing_levy"]),
            paye_breakdown_json=paye_json_str,
            other_deductions=0.0,
            unpaid_leave_deduction=unpaid_leave_amount,
            off_day_deduction=off_day_deduction_amount,
            reliever_earnings=reliever_earnings,
            total_deductions=calc_result["total_deductions"],
            net_pay=calc_result["net_pay"]
        )
        calculated_records.append(rec)

        total_gross += calc_result["gross_pay"]
        total_net += calc_result["net_pay"]
        total_nssf += calc_result["nssf"]
        total_shif += calc_result["shif"]
        total_housing += calc_result["housing_levy"]
        total_paye += calc_result["paye"]

    db.add_all(calculated_records)
    db.commit()

    # Run Pre-payroll Validation Scanner after records are generated
    errors = validate_payroll_period(db, period)

    period.status = "CALCULATED"
    period.calculated_at = datetime.now()

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="CALCULATE_PAYROLL",
        target_entity="PayrollPeriod",
        target_id=str(period.id),
        new_values=f"Calculated {len(active_guards)} guards (Total Gross: KES {total_gross:,.2f})",
        reason="Executed guided payroll calculation engine"
    )
    db.add(audit_entry)
    db.commit()

    return PayrollCalculationSummary(
        period_id=period.id,
        period_name=period.period_name,
        total_employees=len(active_guards),
        total_gross_payroll=round(total_gross, 2),
        total_net_payroll=round(total_net, 2),
        total_nssf=round(total_nssf, 2),
        total_shif=round(total_shif, 2),
        total_housing_levy=round(total_housing, 2),
        total_paye=round(total_paye, 2),
        total_employer_nssf=round(total_nssf, 2),
        total_employer_housing_levy=round(total_housing, 2),
        total_employer_statutory=round(total_nssf + total_housing, 2),
        error_count=len([e for e in errors if e.status in ["UNRESOLVED", "OPEN"]]),
        status=period.status
    )


@router.get("/{period_id}/records", response_model=List[PayrollRecordResponse])
def get_payroll_records(
    period_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Gross-to-Net Payroll Review Table (Screen 11)."""
    import json
    records = db.query(PayrollRecord).options(
        joinedload(PayrollRecord.guard)
    ).filter(PayrollRecord.payroll_period_id == period_id).all()

    # Fetch period for date context
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
    ref_date = period.start_date if period else date.today()

    result = []
    for rec in records:
        paye_b = None
        if rec.paye_breakdown_json:
            try:
                paye_b = json.loads(rec.paye_breakdown_json)
            except Exception:
                paye_b = None

        if not paye_b:
            # Recompute on the fly for display if legacy record
            taxable = max(0.0, rec.gross_pay - rec.nssf_deduction)
            from application.backend.app.services.payroll_engine import calculate_paye_details, get_active_statutory_rates
            rates = get_active_statutory_rates(db, ref_date)
            paye_b = calculate_paye_details(
                taxable,
                paye_bands=rates.get("paye_bands"),
                relief_obj=rates.get("paye_relief")
            )

        emp_nssf = getattr(rec, 'employer_nssf_deduction', None) or rec.nssf_deduction
        emp_housing = getattr(rec, 'employer_housing_levy_deduction', None) or rec.housing_levy_deduction
        total_emp_stat = round(emp_nssf + emp_housing, 2)

        result.append(PayrollRecordResponse(
            id=rec.id,
            payroll_period_id=rec.payroll_period_id,
            guard_id=rec.guard_id,
            employee_number=rec.guard.employee_number if rec.guard else f"CS-{rec.guard_id:05d}",
            guard_name=rec.guard.full_name if rec.guard else "N/A",
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
            other_deductions=getattr(rec, 'other_deductions', 0.0),
            unpaid_leave_deduction=getattr(rec, 'unpaid_leave_deduction', 0.0),
            off_day_deduction=getattr(rec, 'off_day_deduction', 0.0),
            reliever_earnings=getattr(rec, 'reliever_earnings', 0.0),
            total_deductions=rec.total_deductions,
            net_pay=rec.net_pay,
            employer_nssf_deduction=emp_nssf,
            employer_housing_levy_deduction=emp_housing,
            total_employer_statutory=total_emp_stat,
            paye_breakdown=paye_b
        ))
    return result


@router.get("/{period_id}/errors", response_model=List[PayrollErrorResponse])
def get_payroll_validation_errors(
    period_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Pre-payroll Error Table matching Screen 11."""
    errors = db.query(PayrollError).options(
        joinedload(PayrollError.guard)
    ).filter(PayrollError.payroll_period_id == period_id).all()

    result = []
    for err in errors:
        result.append(PayrollErrorResponse(
            id=err.id,
            payroll_period_id=err.payroll_period_id,
            guard_id=err.guard_id,
            employee_number=err.guard.employee_number if err.guard else None,
            guard_name=err.guard.full_name if err.guard else None,
            error_code=err.error_code,
            error_message=err.error_message,
            severity=err.severity,
            status=err.status,
            resolution_notes=err.resolution_notes
        ))
    return result


@router.post("/errors/{error_id}/resolve")
def resolve_payroll_validation_error(
    error_id: int,
    payload: ResolveErrorRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Resolve or Ignore Pre-Payroll Error with mandatory audit trail (Screen 11)."""
    err = db.query(PayrollError).filter(PayrollError.id == error_id).first()
    if not err:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Error record not found")

    err.status = payload.status
    err.resolved_by = admin.email
    err.resolved_at = datetime.now()
    err.resolution_notes = payload.reason

    action_name = "IGNORE_PAYROLL_ERROR" if payload.status == "IGNORED" else "RESOLVE_PAYROLL_ERROR"
    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action=action_name,
        target_entity="PayrollError",
        target_id=str(err.id),
        new_values=f"Status -> {payload.status}; Notes: {payload.reason}",
        reason=payload.reason
    )
    db.add(audit_entry)
    db.commit()
    return {"status": payload.status, "message": f"Error resolved as {payload.status}"}


@router.post("/errors/{error_id}/ignore")
def ignore_payroll_validation_error(
    error_id: int,
    payload: ResolveErrorRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Ignore Pre-Payroll Error with mandatory audit trail (Screen 11)."""
    payload.status = "IGNORED"
    return resolve_payroll_validation_error(error_id=error_id, payload=payload, db=db, admin=admin)


@router.post("/{period_id}/confirm")
def confirm_and_lock_payroll(
    period_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Lock & Confirm Payroll Period (Screen 11).
    Generates Payslips & Bank Payment Schedules for statutory and banking processing.
    """
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll period not found")

    if period.status != "CALCULATED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot confirm period with status '{period.status}'. Must be CALCULATED first."
        )

    # Ensure no unresolved high/critical errors remain
    unresolved_errors = db.query(PayrollError).filter(
        PayrollError.payroll_period_id == period.id,
        PayrollError.status.in_(["UNRESOLVED", "OPEN"]),
        PayrollError.severity.in_(["CRITICAL", "HIGH"])
    ).count()

    if unresolved_errors > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot confirm payroll: {unresolved_errors} critical/high unresolved errors remain."
        )

    records = db.query(PayrollRecord).filter(PayrollRecord.payroll_period_id == period.id).all()

    # Generate Payslips
    for rec in records:
        existing_slip = db.query(Payslip).filter(
            Payslip.payroll_record_id == rec.id
        ).first()

        if not existing_slip:
            slip_no = f"PAY-{period.year}{period.month:02d}-{rec.guard_id:04d}"
            payslip = Payslip(
                payroll_record_id=rec.id,
                payroll_period_id=period.id,
                guard_id=rec.guard_id,
                payslip_number=slip_no
            )
            db.add(payslip)

    period.status = "CONFIRMED"
    period.confirmed_at = datetime.now()

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="CONFIRM_PAYROLL",
        target_entity="PayrollPeriod",
        target_id=str(period.id),
        new_values=f"Confirmed & locked payroll for period '{period.period_name}'",
        reason="Finalized payroll calculation & generated payslips"
    )
    db.add(audit_entry)
    db.commit()

    return {"status": "CONFIRMED", "message": f"Payroll period '{period.period_name}' successfully confirmed and locked."}
