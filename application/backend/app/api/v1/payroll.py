from datetime import datetime, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, Response
from application.backend.app.services.excel_service import generate_statutory_payroll_template_excel
from sqlalchemy.orm import Session, joinedload

from application.backend.app.api.deps import get_db, require_admin, require_admin_or_hr, get_current_user
from application.backend.app.models.payroll import (
    PayrollPeriod, PayrollRecord, PayrollError, Payslip, BankPaymentSchedule, BankPaymentItem, UnpaidLeaveDeduction
)
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.attendance import Attendance
from application.backend.app.models.user import User, UserRole
from application.backend.app.models.audit import AuditLog
from application.backend.app.models.off_day import OffDayAllowance, OffDayRequest, RelieverAssignment
from application.backend.app.models.salary_advance import SalaryAdvance
from application.backend.app.models.asset import AssetDamageDeduction
from sqlalchemy import or_, and_
from application.backend.app.schemas.payroll import (
    PayrollPeriodCreate, PayrollPeriodResponse, PayrollRecordResponse,
    PayrollCalculationSummary, PayrollErrorResponse, ResolveErrorRequest
)
from application.backend.app.services.payroll_engine import (
    calculate_guard_payroll, get_active_statutory_rates, calculate_nssf, calculate_shif, calculate_housing_levy, calculate_paye_details,
    calculate_month_to_date_guard_pay, format_pay_period_label
)
from application.backend.app.models.attendance import OvertimeClaim
from application.backend.app.services.payroll_validator import validate_payroll_period

router = APIRouter(prefix="/payroll", tags=["Payroll Calculation Engine"])


@router.post("/periods", response_model=PayrollPeriodResponse, status_code=status.HTTP_201_CREATED)
def create_payroll_period(
    payload: PayrollPeriodCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
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


def ensure_current_month_payroll_period(db: Session, admin_user: Optional[User] = None) -> PayrollPeriod:
    """
    Ensures that a payroll period for the current month and year always exists,
    and has calculated records generated so payment schedules can be viewed
    in advance even if payment has not yet been disbursed to workers.
    """
    import calendar
    now = datetime.now()
    cur_year = now.year
    cur_month = now.month
    period_name = now.strftime("%B %Y")
    _, last_day = calendar.monthrange(cur_year, cur_month)

    period = db.query(PayrollPeriod).filter(
        PayrollPeriod.year == cur_year,
        PayrollPeriod.month == cur_month
    ).first()

    if not period:
        period = PayrollPeriod(
            year=cur_year,
            month=cur_month,
            period_name=period_name,
            start_date=date(cur_year, cur_month, 1),
            end_date=date(cur_year, cur_month, last_day),
            status="CALCULATED",
            created_at=now,
            calculated_at=now
        )
        db.add(period)
        db.commit()
        db.refresh(period)

    # Check if records are calculated
    rec_count = db.query(PayrollRecord).filter(PayrollRecord.payroll_period_id == period.id).count()
    if rec_count == 0:
        if not admin_user:
            admin_user = db.query(User).filter(User.role == "ADMIN").first()
        if admin_user:
            try:
                execute_payroll_calculation(period.id, db, admin_user)
            except Exception as e:
                pass

    return period


@router.get("/periods", response_model=List[PayrollPeriodResponse])
def list_payroll_periods(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """Fetch all payroll periods, ensuring the current month period is present and calculated."""
    ensure_current_month_payroll_period(db, admin)
    return db.query(PayrollPeriod).order_by(PayrollPeriod.year.desc(), PayrollPeriod.month.desc()).all()


@router.get("/{period_id}/flagged-attendance")
def list_period_flagged_offline_attendance(
    period_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """
    Returns unresolved flagged offline attendance records (needs_supervisor_review=True
    or status='PENDING_REVIEW') within the payroll period date range.
    Under Option B Payroll Policy, these records are excluded from paid days_worked
    until reviewed and approved by a Supervisor or Admin.
    """
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll period not found")

    flagged = db.query(Attendance).options(
        joinedload(Attendance.guard),
        joinedload(Attendance.site),
        joinedload(Attendance.shift),
    ).filter(
        Attendance.shift_date >= period.start_date,
        Attendance.shift_date <= period.end_date,
        or_(
            Attendance.needs_supervisor_review == True,
            Attendance.status == "PENDING_REVIEW",
        ),
    ).order_by(Attendance.shift_date.desc(), Attendance.id.desc()).all()

    items = []
    for att in flagged:
        g = att.guard
        s = att.site
        items.append({
            "id": att.id,
            "guard_id": att.guard_id,
            "guard_name": g.full_name if g else f"Guard #{att.guard_id}",
            "employee_number": g.employee_number if g else "CS-00000",
            "site_name": s.site_name if s else "Unassigned Site",
            "shift_date": str(att.shift_date),
            "actual_clock_in": att.actual_clock_in.isoformat() if att.actual_clock_in else None,
            "actual_clock_out": att.actual_clock_out.isoformat() if att.actual_clock_out else None,
            "status": att.status,
            "submitted_offline": bool(att.submitted_offline),
            "needs_supervisor_review": bool(att.needs_supervisor_review),
            "review_reason": att.review_reason or "Flagged offline attendance requires supervisor approval",
        })

    return {
        "period_id": period.id,
        "period_name": period.period_name,
        "start_date": str(period.start_date),
        "end_date": str(period.end_date),
        "unresolved_count": len(items),
        "records": items,
    }


@router.post("/{period_id}/calculate", response_model=PayrollCalculationSummary)
def execute_payroll_calculation(
    period_id: int,
    as_of_date: Optional[str] = Query(None, description="Optional YYYY-MM-DD evaluation cutoff date"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """
    Guided Payroll Engine Step: Execute calculations (Screen 11).
    Dynamically calculates Month-to-Date (MTD) accrued salary strictly based on actual
    days worked (job entries) from Day 1 up to today's date (inclusive),
    accounting for 4 paid off-days per month.
    """
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payroll period not found")

    if period.status in ["CONFIRMED", "CLOSED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payroll period is Closed ({period.status}) and cannot be recalculated."
        )

    # Determine cutoff date for month-to-date calculation
    now = datetime.now()
    today_date = now.date()

    # Check if this payroll period has any attendance tracking captured
    period_has_attendance = db.query(Attendance).filter(
        Attendance.shift_date >= period.start_date,
        Attendance.shift_date <= period.end_date
    ).first() is not None

    if as_of_date:
        try:
            today_date = datetime.strptime(as_of_date.strip(), "%Y-%m-%d").date()
        except Exception:
            pass
        eval_end_date = min(period.end_date, today_date)
        is_month_to_date = bool(eval_end_date < period.end_date)
    else:
        # Check if attendance records exist beyond today in this period (e.g. simulated batch test or completed month)
        future_attendance = db.query(Attendance).filter(
            Attendance.shift_date >= period.start_date,
            Attendance.shift_date <= period.end_date,
            Attendance.shift_date > today_date
        ).first()

        is_current_month = bool(period.year == today_date.year and period.month == today_date.month)
        if is_current_month and not future_attendance:
            eval_end_date = min(period.end_date, today_date)
            is_month_to_date = bool(eval_end_date < period.end_date)
        else:
            eval_end_date = period.end_date
            is_month_to_date = False

    billing_period = format_pay_period_label(period.start_date, eval_end_date)
    days_in_month = (period.end_date - period.start_date).days + 1
    elapsed_days = (eval_end_date - period.start_date).days + 1

    # Reset any salary advances previously deducted for this period back to APPROVED
    prev_advances = db.query(SalaryAdvance).filter(
        SalaryAdvance.payroll_period_id == period.id,
        SalaryAdvance.status == "DEDUCTED"
    ).all()
    for p_adv in prev_advances:
        p_adv.status = "APPROVED"
        p_adv.deducted_at = None

    # Reset any property damage deductions previously deducted for this period back to PENDING
    prev_damages = db.query(AssetDamageDeduction).filter(
        AssetDamageDeduction.payroll_period_id == period.id,
        AssetDamageDeduction.status == "DEDUCTED"
    ).all()
    for p_dmg in prev_damages:
        p_dmg.status = "PENDING"
        p_dmg.deducted_at = None

    # Preserve any active salary holds or hold notes across recalculations
    existing_holds = {}
    for r in db.query(PayrollRecord).filter(
        PayrollRecord.payroll_period_id == period.id,
        PayrollRecord.is_on_hold == True
    ).all():
        existing_holds[r.guard_id] = {
            "is_on_hold": r.is_on_hold,
            "hold_reason": r.hold_reason,
            "held_by": r.held_by,
            "held_at": r.held_at,
            "released_by": r.released_by,
            "released_at": r.released_at,
            "release_notes": r.release_notes
        }

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
    total_advances = 0.0
    total_damages = 0.0

    for guard in active_guards:
        # Sum guard attendance strictly up to eval_end_date (Month-to-Date only)
        attendances = db.query(Attendance).filter(
            Attendance.guard_id == guard.id,
            Attendance.shift_date >= period.start_date,
            Attendance.shift_date <= eval_end_date,
            Attendance.status.in_(["PRESENT", "LATE", "OVERTIME"])
        ).all()

        # Contractual standard working days for a full month
        contractual_target_days = 26

        if attendances:
            days_worked = len(attendances)
            # Regular hours per shift attended capped at 12.0h (standard shift duration);
            # Default to 12.0h if regular_hours was not recorded for a marked present shift
            reg_hours = sum(min(a.regular_hours if a.regular_hours > 0 else 12.0, 12.0) for a in attendances)
        elif not period_has_attendance:
            # If no attendance has been captured across the entire period in the system,
            # active guards receive their standard contractual monthly baseline
            days_worked = contractual_target_days
            reg_hours = contractual_target_days * 12.0  # 312.0 hours
        else:
            # Attendance is actively tracked for this period, but this guard had 0 shifts attended
            days_worked = 0
            reg_hours = 0.0

        # Overtime calculation: ONLY include hours & pay from APPROVED OvertimeClaims up to eval_end_date
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

        # Query Reliever Assignments for this guard up to eval_end_date
        reliever_asgns = db.query(RelieverAssignment).filter(
            RelieverAssignment.reliever_guard_id == guard.id,
            RelieverAssignment.shift_date >= period.start_date,
            RelieverAssignment.shift_date <= eval_end_date
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

        # Query APPROVED Off-Day Requests for this guard overlapping [period.start_date, eval_end_date]
        approved_off_requests = db.query(OffDayRequest).filter(
            OffDayRequest.guard_id == guard.id,
            OffDayRequest.status == "APPROVED",
            OffDayRequest.start_date <= eval_end_date,
            OffDayRequest.end_date >= period.start_date
        ).all()

        off_day_count = 0
        for off_req in approved_off_requests:
            c_start = max(off_req.start_date, period.start_date)
            c_end = min(off_req.end_date, eval_end_date)
            if c_end >= c_start:
                off_day_count += (c_end - c_start).days + 1

        # Also count attendance entries logged as 'OFF' up to eval_end_date
        off_attendance_count = db.query(Attendance).filter(
            Attendance.guard_id == guard.id,
            Attendance.shift_date >= period.start_date,
            Attendance.shift_date <= eval_end_date,
            Attendance.status == "OFF"
        ).count()
        off_day_count += off_attendance_count

        has_explicit_off = (off_day_count > 0 or len(approved_off_requests) > 0)

        # Off-day allowance (standard company entitlement is 4 days per month)
        allowance_entry = db.query(OffDayAllowance).filter(
            OffDayAllowance.guard_id == guard.id,
            OffDayAllowance.year == period.year,
            OffDayAllowance.month == period.month
        ).first()
        allowed_off_days = allowance_entry.days_allowed if allowance_entry else 4

        # Dynamic Month-to-Date Guard Pay Calculation
        mtd_calc = calculate_month_to_date_guard_pay(
            monthly_salary=effective_basic_salary,
            days_worked=days_worked,
            off_days_taken=off_day_count,
            has_explicit_off_days=has_explicit_off,
            period_start=period.start_date,
            period_end=period.end_date,
            as_of_date=eval_end_date,
            monthly_off_days_allowance=allowed_off_days
        )

        if is_month_to_date:
            basic_pay = mtd_calc["accrued_amount"]
            proration_factor = mtd_calc["total_payable_days"] / float(days_in_month) if days_in_month > 0 else 1.0
        else:
            # Proration calculation for mid-month hires / exits in a full month
            emp_start = max(period.start_date, guard.hire_date) if guard.hire_date else period.start_date
            emp_end = period.end_date
            if emp_start > period.end_date:
                days_employed = 0
            else:
                days_employed = (emp_end - emp_start).days + 1
            days_employed = min(days_employed, days_in_month)
            proration_factor = days_employed / float(days_in_month) if days_in_month > 0 else 1.0
            basic_pay = round(effective_basic_salary * proration_factor, 2)

        total_allowances = round(night_allowance * proration_factor, 2)
        gross_pay = round(basic_pay + approved_ot_pay + total_allowances + reliever_earnings, 2)

        # Statutory deductions (NSSF, SHIF, Housing Levy, PAYE) on gross_pay
        stat_rates = get_active_statutory_rates(db, period.start_date)
        if stat_rates:
            nssf_ded = calculate_nssf(gross_pay, nssf_tiers=stat_rates["nssf_tiers"])
            shif_ded = calculate_shif(gross_pay, shif_obj=stat_rates["shif"])
            housing_levy_ded = calculate_housing_levy(gross_pay, housing_obj=stat_rates["housing"])
            taxable_pay = max(0.0, gross_pay - nssf_ded)
            paye_details = calculate_paye_details(taxable_pay, paye_bands=stat_rates["paye_bands"], relief_obj=stat_rates["paye_relief"])
        else:
            nssf_ded = calculate_nssf(gross_pay)
            shif_ded = calculate_shif(gross_pay)
            housing_levy_ded = calculate_housing_levy(gross_pay)
            taxable_pay = max(0.0, gross_pay - nssf_ded)
            paye_details = calculate_paye_details(taxable_pay)

        paye_ded = paye_details["net_paye"]
        statutory_deds = round(nssf_ded + shif_ded + housing_levy_ded + paye_ded, 2)

        # Query APPLIED unpaid leave deductions up to eval_end_date
        applied_leave_deds = db.query(UnpaidLeaveDeduction).filter(
            UnpaidLeaveDeduction.guard_id == guard.id,
            UnpaidLeaveDeduction.payroll_period_id == period.id,
            UnpaidLeaveDeduction.status == "APPLIED"
        ).all()
        raw_unpaid_leave_amount = round(sum(d.amount for d in applied_leave_deds), 2)
        unpaid_leave_amount = min(raw_unpaid_leave_amount, basic_pay)

        # Automatic absenteeism & off-day deduction:
        effective_allowed_off_days = max(allowed_off_days, days_in_month - contractual_target_days)
        unworked_days = max(0, days_in_month - days_worked)
        excess_unworked_days = max(0, unworked_days - effective_allowed_off_days)
        excess_off_requests = max(0, off_day_count - allowed_off_days)
        unworked_shift_days = max(excess_off_requests, excess_unworked_days)

        # Partial shift shortfall: when a guard attended a shift but worked fewer than 12 standard hours
        shift_shortfall_hours = max(0.0, (days_worked * 12.0) - reg_hours) if attendances else 0.0
        shift_shortfall_days = round(shift_shortfall_hours / 12.0, 4)
        effective_deductible_days = unworked_shift_days + shift_shortfall_days

        # Reliever coverage deduction: check if any relievers were assigned to cover shifts for this regular guard
        reliever_covered_asgns = db.query(RelieverAssignment).filter(
            RelieverAssignment.covering_for_guard_id == guard.id,
            RelieverAssignment.shift_date >= period.start_date,
            RelieverAssignment.shift_date <= eval_end_date
        ).all()
        reliever_coverage_deduction = 0.0
        for r_cov in reliever_covered_asgns:
            cov_site = db.query(Site).filter(Site.id == r_cov.site_id).first()
            site_basic = (cov_site.basic_salary if cov_site and cov_site.basic_salary else effective_basic_salary)
            reliever_coverage_deduction += (site_basic / 26.0)
        reliever_coverage_deduction = round(reliever_coverage_deduction, 2)

        if is_month_to_date:
            raw_off_day_deduction = reliever_coverage_deduction
        else:
            raw_off_day_deduction = max(round(effective_deductible_days * (effective_basic_salary / 26.0), 2), reliever_coverage_deduction)

        off_day_deduction_amount = min(raw_off_day_deduction, basic_pay)

        # Query Mid-Month Salary Advances up to eval_end_date
        guard_advances = db.query(SalaryAdvance).filter(
            SalaryAdvance.advance_type == "GUARD",
            SalaryAdvance.guard_id == guard.id,
            SalaryAdvance.status.in_(["APPROVED", "PENDING"]),
            or_(
                SalaryAdvance.payroll_period_id == period.id,
                and_(
                    SalaryAdvance.disbursement_date >= period.start_date,
                    SalaryAdvance.disbursement_date <= eval_end_date
                )
            )
        ).all()
        total_adv_amount = sum(float(a.amount) for a in guard_advances)
        net_before_advance = max(0.0, gross_pay - (statutory_deds + unpaid_leave_amount + off_day_deduction_amount))
        advance_deduction_amount = min(round(total_adv_amount, 2), net_before_advance)

        for a in guard_advances:
            a.status = "DEDUCTED"
            a.payroll_period_id = period.id
            a.deducted_at = datetime.now()

        # Query Mid-Month Property / Equipment Damage Deductions up to eval_end_date
        guard_damage_deds = db.query(AssetDamageDeduction).filter(
            AssetDamageDeduction.guard_id == guard.id,
            AssetDamageDeduction.status.in_(["PENDING", "APPROVED"]),
            or_(
                AssetDamageDeduction.payroll_period_id == period.id,
                and_(
                    AssetDamageDeduction.payroll_period_id.is_(None),
                    AssetDamageDeduction.incident_date <= eval_end_date
                )
            )
        ).all()
        total_dmg_amount = sum(float(d.deduction_amount) for d in guard_damage_deds)
        net_before_damage = max(0.0, net_before_advance - advance_deduction_amount)
        damage_deduction_amount = min(round(total_dmg_amount, 2), net_before_damage)

        for d in guard_damage_deds:
            d.status = "DEDUCTED"
            d.payroll_period_id = period.id
            d.deducted_at = datetime.now()

        total_deductions = round(statutory_deds + unpaid_leave_amount + off_day_deduction_amount + advance_deduction_amount + damage_deduction_amount, 2)
        net_pay = round(max(0.0, gross_pay - total_deductions), 2)

        employer_nssf = nssf_ded
        employer_housing_levy = housing_levy_ded
        import json
        paye_json_str = json.dumps(paye_details)

        rec = PayrollRecord(
            payroll_period_id=period.id,
            guard_id=guard.id,
            site_id=guard.primary_site_id or (site.id if site else 1),
            days_worked=mtd_calc["days_worked"] if is_month_to_date else days_worked,
            off_days_taken=mtd_calc["off_days_used"] if is_month_to_date else off_day_count,
            off_days_remaining=mtd_calc["off_days_remaining"] if is_month_to_date else max(0, allowed_off_days - off_day_count),
            total_payable_days=mtd_calc["total_payable_days"] if is_month_to_date else days_worked,
            accrued_payable=net_pay,
            calculation_cutoff_date=eval_end_date,
            regular_hours=reg_hours,
            overtime_hours=approved_ot_hours,
            basic_pay=basic_pay,
            overtime_pay=approved_ot_pay,
            allowances=total_allowances,
            gross_pay=gross_pay,
            nssf_deduction=nssf_ded,
            shif_deduction=shif_ded,
            housing_levy_deduction=housing_levy_ded,
            paye_deduction=paye_ded,
            employer_nssf_deduction=employer_nssf,
            employer_housing_levy_deduction=employer_housing_levy,
            paye_breakdown_json=paye_json_str,
            other_deductions=0.0,
            unpaid_leave_deduction=unpaid_leave_amount,
            off_day_deduction=off_day_deduction_amount,
            salary_advance_deduction=advance_deduction_amount,
            damage_deduction=damage_deduction_amount,
            reliever_earnings=reliever_earnings,
            total_deductions=total_deductions,
            net_pay=net_pay,
            is_on_hold=existing_holds.get(guard.id, {}).get("is_on_hold", False),
            hold_reason=existing_holds.get(guard.id, {}).get("hold_reason"),
            held_by=existing_holds.get(guard.id, {}).get("held_by"),
            held_at=existing_holds.get(guard.id, {}).get("held_at"),
            released_by=existing_holds.get(guard.id, {}).get("released_by"),
            released_at=existing_holds.get(guard.id, {}).get("released_at"),
            release_notes=existing_holds.get(guard.id, {}).get("release_notes")
        )
        calculated_records.append(rec)

        total_gross += gross_pay
        total_net += net_pay
        total_nssf += nssf_ded
        total_shif += shif_ded
        total_housing += housing_levy_ded
        total_paye += paye_ded
        total_advances += advance_deduction_amount
        total_damages += damage_deduction_amount

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
        new_values=f"Calculated {len(active_guards)} guards (Cutoff: {eval_end_date}, Total Gross: KES {total_gross:,.2f})",
        reason="Executed guided payroll calculation engine"
    )
    db.add(audit_entry)
    db.commit()

    return PayrollCalculationSummary(
        period_id=period.id,
        period_name=period.period_name,
        billing_period=billing_period,
        is_month_to_date=is_month_to_date,
        cutoff_date=eval_end_date.isoformat(),
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
        total_salary_advances=round(total_advances, 2),
        total_damage_deductions=round(total_damages, 2),
        error_count=len([e for e in errors if e.status in ["UNRESOLVED", "OPEN"]]),
        status=period.status
    )


@router.get("/{period_id}/records", response_model=List[PayrollRecordResponse])
def get_payroll_records(
    period_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
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
            salary_advance_deduction=getattr(rec, 'salary_advance_deduction', 0.0),
            damage_deduction=getattr(rec, 'damage_deduction', 0.0),
            reliever_earnings=getattr(rec, 'reliever_earnings', 0.0),
            total_deductions=rec.total_deductions,
            net_pay=rec.net_pay,
            is_on_hold=getattr(rec, 'is_on_hold', False),
            hold_reason=getattr(rec, 'hold_reason', None),
            held_by=getattr(rec, 'held_by', None),
            held_at=getattr(rec, 'held_at', None),
            released_by=getattr(rec, 'released_by', None),
            released_at=getattr(rec, 'released_at', None),
            release_notes=getattr(rec, 'release_notes', None),
            employer_nssf_deduction=emp_nssf,
            employer_housing_levy_deduction=emp_housing,
            total_employer_statutory=total_emp_stat,
            paye_breakdown=paye_b
        ))
    return result



@router.get("/guard/{guard_id}/records", response_model=List[PayrollRecordResponse])
@router.get("/records/guard/{guard_id}", response_model=List[PayrollRecordResponse])
def get_guard_payroll_records(
    guard_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fetch payroll records history for a specific guard from the database."""
    if current_user.role == UserRole.SUPERVISOR.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied: Supervisors cannot view payroll records")
    if current_user.role == UserRole.GUARD.value and current_user.guard_id != guard_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied: Cannot view other guards' payroll records")

    records = db.query(PayrollRecord).options(
        joinedload(PayrollRecord.guard),
        joinedload(PayrollRecord.period)
    ).filter(PayrollRecord.guard_id == guard_id).order_by(PayrollRecord.id.desc()).all()

    result = []
    for rec in records:
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
            salary_advance_deduction=getattr(rec, 'salary_advance_deduction', 0.0),
            damage_deduction=getattr(rec, 'damage_deduction', 0.0),
            reliever_earnings=getattr(rec, 'reliever_earnings', 0.0),
            total_deductions=rec.total_deductions,
            net_pay=rec.net_pay,
            is_on_hold=getattr(rec, 'is_on_hold', False),
            hold_reason=getattr(rec, 'hold_reason', None),
            held_by=getattr(rec, 'held_by', None),
            held_at=getattr(rec, 'held_at', None),
            released_by=getattr(rec, 'released_by', None),
            released_at=getattr(rec, 'released_at', None),
            release_notes=getattr(rec, 'release_notes', None),
            employer_nssf_deduction=emp_nssf,
            employer_housing_levy_deduction=emp_housing,
            total_employer_statutory=total_emp_stat,
            paye_breakdown=None
        ))
    return result


@router.get("/{period_id}/errors", response_model=List[PayrollErrorResponse])
def get_payroll_validation_errors(
    period_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
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
    admin: User = Depends(require_admin_or_hr)
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
    admin: User = Depends(require_admin_or_hr)
):
    """Ignore Pre-Payroll Error with mandatory audit trail (Screen 11)."""
    payload.status = "IGNORED"
    return resolve_payroll_validation_error(error_id=error_id, payload=payload, db=db, admin=admin)


@router.post("/{period_id}/confirm")
def confirm_and_lock_payroll(
    period_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
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


@router.get("/template/statutory-nhif")
@router.get("/template/statutory-payroll")
def download_payroll_statutory_template(
    admin: User = Depends(require_admin_or_hr)
):
    """Download official blank Statutory Payroll Template (.xlsx) matching User Reference Image 1."""
    excel_bytes = generate_statutory_payroll_template_excel([], period_name="Template")
    filename = "Payroll_Template_Statutory.xlsx"
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/{period_id}/export-statutory-template")
def export_payroll_statutory_template(
    period_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """Export populated official Statutory NHIF/SHIF Payroll Template (.xlsx) matching User Reference Image 1."""
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Period not found")

    records = db.query(PayrollRecord).filter(PayrollRecord.payroll_period_id == period.id).all()
    records_data = []

    for rec in records:
        guard = db.query(Guard).filter(Guard.id == rec.guard_id).first()
        if not guard:
            continue

        records_data.append({
            "employee_number": guard.employee_number,
            "payroll_number": guard.employee_number,
            "full_name": guard.full_name,
            "guard_name": guard.full_name,
            "identity_type": "National ID",
            "national_id": guard.national_id,
            "id_no": guard.national_id,
            "kra_pin": guard.kra_pin or "",
            "nhif_no": guard.shif_number or guard.national_id or "",
            "shif_number": guard.shif_number or "",
            "contribution_amount": rec.shif_deduction or 0.0,
            "shif_deduction": rec.shif_deduction or 0.0,
            "phone": guard.phone or ""
        })

    excel_bytes = generate_statutory_payroll_template_excel(records_data, period_name=period.period_name)

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="EXPORT_PAYROLL_STATUTORY_TEMPLATE",
        target_entity="PayrollPeriod",
        target_id=str(period.id),
        new_values=f"Exported {len(records_data)} statutory payroll records for '{period.period_name}'",
        reason="Exported Statutory Payroll Return Excel matching Image 1"
    )
    db.add(audit_entry)
    db.commit()

    filename = f"Statutory_Payroll_Return_{period.period_name.replace(' ', '_')}.xlsx"
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
