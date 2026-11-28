import re
from datetime import datetime, date, timedelta
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from application.backend.app.models.payroll import PayrollPeriod, PayrollRecord
from application.backend.app.models.guard import Guard
from application.backend.app.models.user import User
from application.backend.app.models.attendance import Attendance
from application.backend.app.models.off_day import OffDayRequest, OffDayAllowance, GuardOffDaySchedule
from application.backend.app.services.payroll_engine import calculate_month_to_date_guard_pay, format_pay_period_label


from application.backend.app.core.phone import validate_kenyan_phone


def validate_bank_details(bank_name: Optional[str], bank_account: Optional[str]) -> Tuple[bool, Optional[str]]:
    """
    Validates bank name and account number.
    Returns (is_valid, error_message).
    """
    if not bank_name or not bank_name.strip() or bank_name.strip().upper() in ("N/A", "NONE"):
        return False, "Missing or invalid bank name"

    if not bank_account or not bank_account.strip() or bank_account.strip() in ("000000000", "00000000", "N/A", "NONE"):
        return False, "Missing or invalid bank account number"

    cleaned_acc = re.sub(r"[\s\-]", "", bank_account.strip())
    if len(cleaned_acc) < 5 or not cleaned_acc.isalnum():
        return False, f"Bank account number '{bank_account}' fails format criteria"

    return True, None


def mask_sensitive_account(account_str: str) -> str:
    """
    Masks bank account or phone number for safe audit logging.
    e.g., '1234567890' -> '****7890'
    """
    if not account_str or len(account_str) < 4:
        return "****"
    return "*" * (len(account_str) - 4) + account_str[-4:]


def build_payment_schedules_and_reconciliation(
    db: Session,
    period_id: int,
    as_of_date: Optional[date] = None
) -> Dict[str, Any]:
    """
    Core Payment Routing & Financial Reconciliation Engine.
    Dynamically calculates Month-to-Date (MTD) accrued salary based strictly on actual
    days worked (job entries) from Day 1 of the month up to Today's date (inclusive),
    accounting for 4 paid off-days per month.
    """
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
    if not period:
        raise ValueError(f"Payroll period #{period_id} not found")

    now = datetime.now()
    today_date = as_of_date or now.date()
    is_current_month = bool(period.year == today_date.year and period.month == today_date.month)
    if is_current_month:
        eval_end_date = min(period.end_date, today_date)
    else:
        eval_end_date = min(period.end_date, today_date) if today_date < period.end_date else period.end_date

    billing_period = format_pay_period_label(period.start_date, eval_end_date)
    is_month_to_date = bool(eval_end_date < period.end_date)
    total_days_in_month = (period.end_date - period.start_date).days + 1
    elapsed_calendar_days = (eval_end_date - period.start_date).days + 1

    records = db.query(PayrollRecord).filter(
        PayrollRecord.payroll_period_id == period_id
    ).all()

    # If records not yet calculated for this period, auto-calculate with MTD cutoff
    if not records and period.status in ["CALCULATED", "CONFIRMED"]:
        from application.backend.app.api.v1.payroll import execute_payroll_calculation
        admin_user = db.query(User).filter(User.role == "ADMIN").first()
        if admin_user:
            try:
                execute_payroll_calculation(period_id=period.id, db=db, admin=admin_user, as_of_date=eval_end_date.isoformat())
                records = db.query(PayrollRecord).filter(
                    PayrollRecord.payroll_period_id == period_id
                ).all()
            except Exception:
                pass

    is_paid = bool(period.status in ["CLOSED", "PAID"])
    item_status = "PAID" if is_paid else "READY (UNPAID)"

    bank_items: List[Dict[str, Any]] = []
    mpesa_items: List[Dict[str, Any]] = []
    held_items: List[Dict[str, Any]] = []
    unrouted_items: List[Dict[str, Any]] = []
    duplicate_warnings: List[Dict[str, Any]] = []

    seen_bank_accounts: Dict[str, str] = {}  # bank_account -> guard_id/name
    seen_mpesa_phones: Dict[str, str] = {}   # phone -> guard_id/name

    total_payroll_net_pay = sum(round(rec.net_pay, 2) for rec in records)

    for rec in records:
        net_pay = round(rec.net_pay, 2)
        guard = db.query(Guard).filter(Guard.id == rec.guard_id).first()

        if not guard:
            unrouted_items.append({
                "payroll_record_id": rec.id,
                "guard_id": rec.guard_id,
                "employee_number": f"CS-{rec.guard_id:05d}",
                "guard_name": "Unknown Guard Record",
                "billing_period": billing_period,
                "days_worked": 0,
                "off_days_used": 0,
                "off_days_remaining": 4,
                "off_days_display": "0 used / 4 remaining",
                "total_payable_days": 0,
                "accrued_amount": net_pay,
                "daily_rate": 0.0,
                "net_pay": net_pay,
                "reason": "GUARD_RECORD_MISSING",
                "payment_method": "UNKNOWN"
            })
            continue

        # Evaluate Month-to-Date attendance, job entries, and off-days
        has_mtd_record = (
            getattr(rec, "calculation_cutoff_date", None) == eval_end_date and
            getattr(rec, "total_payable_days", None) is not None
        )

        if has_mtd_record:
            item_days_worked = rec.days_worked or 0
            item_off_days_used = rec.off_days_taken or 0
            item_off_days_remaining = rec.off_days_remaining if rec.off_days_remaining is not None else 4
            item_total_payable_days = rec.total_payable_days or 0
            daily_rate = round(guard.effective_basic_salary / total_days_in_month, 2) if total_days_in_month > 0 else 0.0
        else:
            attendances = db.query(Attendance).filter(
                Attendance.guard_id == guard.id,
                Attendance.shift_date >= period.start_date,
                Attendance.shift_date <= eval_end_date,
                Attendance.status.in_(["PRESENT", "LATE", "OVERTIME"])
            ).all()
            item_days_worked = len(attendances)

            approved_off_requests = db.query(OffDayRequest).filter(
                OffDayRequest.guard_id == guard.id,
                OffDayRequest.status == "APPROVED",
                OffDayRequest.start_date <= eval_end_date,
                OffDayRequest.end_date >= period.start_date
            ).all()

            off_dates_set = set()
            for off_req in approved_off_requests:
                c_start = max(off_req.start_date, period.start_date)
                c_end = min(off_req.end_date, eval_end_date)
                curr = c_start
                while curr <= c_end:
                    off_dates_set.add(curr)
                    curr += timedelta(days=1)

            for att_off in db.query(Attendance.shift_date).filter(
                Attendance.guard_id == guard.id,
                Attendance.shift_date >= period.start_date,
                Attendance.shift_date <= eval_end_date,
                Attendance.status == "OFF"
            ).all():
                off_dates_set.add(att_off[0])

            for sched in db.query(GuardOffDaySchedule.off_date).filter(
                GuardOffDaySchedule.guard_id == guard.id,
                GuardOffDaySchedule.off_date >= period.start_date,
                GuardOffDaySchedule.off_date <= eval_end_date
            ).all():
                off_dates_set.add(sched[0])

            off_day_count = len(off_dates_set)
            has_explicit_off = (off_day_count > 0 or len(approved_off_requests) > 0)

            allowance_entry = db.query(OffDayAllowance).filter(
                OffDayAllowance.guard_id == guard.id,
                OffDayAllowance.year == period.year,
                OffDayAllowance.month == period.month
            ).first()
            allowed_off_days = allowance_entry.days_allowed if allowance_entry else 4

            mtd = calculate_month_to_date_guard_pay(
                monthly_salary=guard.effective_basic_salary,
                days_worked=item_days_worked,
                off_days_taken=off_day_count,
                has_explicit_off_days=has_explicit_off,
                period_start=period.start_date,
                period_end=period.end_date,
                as_of_date=eval_end_date,
                monthly_off_days_allowance=allowed_off_days
            )
            item_days_worked = mtd["days_worked"]
            item_off_days_used = mtd["off_days_used"]
            item_off_days_remaining = mtd["off_days_remaining"]
            item_total_payable_days = mtd["total_payable_days"]
            daily_rate = mtd["daily_rate"]

        item_off_days_display = f"{item_off_days_used} used / {item_off_days_remaining} remaining"

        # Check if record is currently placed on hold by HR / Admin
        if getattr(rec, "is_on_hold", False):
            held_items.append({
                "payroll_record_id": rec.id,
                "guard_id": guard.id,
                "employee_number": guard.employee_number,
                "guard_name": guard.full_name,
                "billing_period": billing_period,
                "days_worked": item_days_worked,
                "off_days_used": item_off_days_used,
                "off_days_remaining": item_off_days_remaining,
                "off_days_display": item_off_days_display,
                "total_payable_days": item_total_payable_days,
                "daily_rate": daily_rate,
                "accrued_amount": net_pay,
                "payment_method": guard.payment_method or "Bank Transfer",
                "bank_name": guard.bank_name or "M-Pesa",
                "account_number": guard.bank_account if (guard.payment_method or "").strip() == "Bank Transfer" else (guard.mpesa_number or guard.phone or "—"),
                "amount": net_pay,
                "hold_reason": getattr(rec, "hold_reason", None) or "Salary placed on hold pending review/resolution",
                "held_by": getattr(rec, "held_by", None) or "HR/Admin",
                "held_at": getattr(rec, "held_at", None).strftime("%Y-%m-%d %H:%M") if getattr(rec, "held_at", None) else None,
                "status": "ON_HOLD"
            })
            continue

        payment_method = (guard.payment_method or "").strip()

        if payment_method == "Bank Transfer":
            is_valid, err_msg = validate_bank_details(guard.bank_name, guard.bank_account)
            if is_valid:
                bank_acc_clean = guard.bank_account.strip()
                if bank_acc_clean in seen_bank_accounts:
                    duplicate_warnings.append({
                        "type": "DUPLICATE_BANK_ACCOUNT",
                        "account": mask_sensitive_account(bank_acc_clean),
                        "guard_1": seen_bank_accounts[bank_acc_clean],
                        "guard_2": f"{guard.full_name} ({guard.employee_number})"
                    })
                else:
                    seen_bank_accounts[bank_acc_clean] = f"{guard.full_name} ({guard.employee_number})"

                bank_items.append({
                    "payroll_record_id": rec.id,
                    "guard_id": guard.id,
                    "employee_number": guard.employee_number,
                    "guard_name": guard.full_name,
                    "billing_period": billing_period,
                    "days_worked": item_days_worked,
                    "off_days_used": item_off_days_used,
                    "off_days_remaining": item_off_days_remaining,
                    "off_days_display": item_off_days_display,
                    "total_payable_days": item_total_payable_days,
                    "daily_rate": daily_rate,
                    "accrued_amount": net_pay,
                    "bank_name": guard.bank_name.strip(),
                    "bank_account": bank_acc_clean,
                    "amount": net_pay,
                    "reference_number": f"SAL-{period.year}{period.month:02d}-{guard.employee_number}",
                    "status": item_status,
                    "is_paid": is_paid,
                    "payment_status": "PAID" if is_paid else "UNPAID"
                })
            else:
                unrouted_items.append({
                    "payroll_record_id": rec.id,
                    "guard_id": guard.id,
                    "employee_number": guard.employee_number,
                    "guard_name": guard.full_name,
                    "billing_period": billing_period,
                    "days_worked": item_days_worked,
                    "off_days_used": item_off_days_used,
                    "off_days_remaining": item_off_days_remaining,
                    "off_days_display": item_off_days_display,
                    "total_payable_days": item_total_payable_days,
                    "daily_rate": daily_rate,
                    "accrued_amount": net_pay,
                    "net_pay": net_pay,
                    "reason": err_msg,
                    "payment_method": "Bank Transfer"
                })

        elif payment_method == "M-Pesa":
            phone_to_check = guard.mpesa_number or guard.phone
            is_valid, clean_phone, err_msg = validate_kenyan_phone(phone_to_check)
            if is_valid:
                if clean_phone in seen_mpesa_phones:
                    duplicate_warnings.append({
                        "type": "DUPLICATE_MPESA_PHONE",
                        "phone": clean_phone,
                        "guard_1": seen_mpesa_phones[clean_phone],
                        "guard_2": f"{guard.full_name} ({guard.employee_number})"
                    })
                else:
                    seen_mpesa_phones[clean_phone] = f"{guard.full_name} ({guard.employee_number})"

                mpesa_items.append({
                    "payroll_record_id": rec.id,
                    "guard_id": guard.id,
                    "employee_number": guard.employee_number,
                    "guard_name": guard.full_name,
                    "billing_period": billing_period,
                    "days_worked": item_days_worked,
                    "off_days_used": item_off_days_used,
                    "off_days_remaining": item_off_days_remaining,
                    "off_days_display": item_off_days_display,
                    "total_payable_days": item_total_payable_days,
                    "daily_rate": daily_rate,
                    "accrued_amount": net_pay,
                    "mpesa_number": clean_phone,
                    "amount": net_pay,
                    "reference_number": f"MPS-{period.year}{period.month:02d}-{guard.employee_number}",
                    "status": item_status,
                    "is_paid": is_paid,
                    "payment_status": "PAID" if is_paid else "UNPAID"
                })
            else:
                unrouted_items.append({
                    "payroll_record_id": rec.id,
                    "guard_id": guard.id,
                    "employee_number": guard.employee_number,
                    "guard_name": guard.full_name,
                    "billing_period": billing_period,
                    "days_worked": item_days_worked,
                    "off_days_used": item_off_days_used,
                    "off_days_remaining": item_off_days_remaining,
                    "off_days_display": item_off_days_display,
                    "total_payable_days": item_total_payable_days,
                    "daily_rate": daily_rate,
                    "accrued_amount": net_pay,
                    "net_pay": net_pay,
                    "reason": err_msg,
                    "payment_method": "M-Pesa"
                })

        else:
            unrouted_items.append({
                "payroll_record_id": rec.id,
                "guard_id": guard.id,
                "employee_number": guard.employee_number,
                "guard_name": guard.full_name,
                "billing_period": billing_period,
                "days_worked": item_days_worked,
                "off_days_used": item_off_days_used,
                "off_days_remaining": item_off_days_remaining,
                "off_days_display": item_off_days_display,
                "total_payable_days": item_total_payable_days,
                "daily_rate": daily_rate,
                "accrued_amount": net_pay,
                "net_pay": net_pay,
                "reason": f"Unsupported or unspecified payment method: '{payment_method}'",
                "payment_method": payment_method or "UNSPECIFIED"
            })

    total_bank_amount = round(sum(item["amount"] for item in bank_items), 2)
    total_mpesa_amount = round(sum(item["amount"] for item in mpesa_items), 2)
    total_held_amount = round(sum(item["amount"] for item in held_items), 2)
    total_unrouted_amount = round(sum(item["net_pay"] for item in unrouted_items), 2)

    total_routed_and_unrouted = round(total_bank_amount + total_mpesa_amount + total_held_amount + total_unrouted_amount, 2)
    discrepancy = round(total_payroll_net_pay - total_routed_and_unrouted, 2)
    is_reconciled = (discrepancy == 0.0)

    return {
        "period_id": period.id,
        "period_name": period.period_name,
        "billing_period": billing_period,
        "eval_end_date": eval_end_date.isoformat(),
        "is_month_to_date": is_month_to_date,
        "total_days_in_month": total_days_in_month,
        "elapsed_calendar_days": elapsed_calendar_days,
        "payroll_status": period.status,
        "is_current_month": is_current_month,
        "is_paid": is_paid,
        "total_records_count": len(records),
        "bank_records_count": len(bank_items),
        "mpesa_records_count": len(mpesa_items),
        "held_records_count": len(held_items),
        "unrouted_records_count": len(unrouted_items),
        "total_payroll_net_pay": round(total_payroll_net_pay, 2),
        "total_bank_amount": total_bank_amount,
        "total_mpesa_amount": total_mpesa_amount,
        "total_held_amount": total_held_amount,
        "total_unrouted_amount": total_unrouted_amount,
        "discrepancy": discrepancy,
        "is_reconciled": is_reconciled,
        "bank_items": bank_items,
        "mpesa_items": mpesa_items,
        "held_items": held_items,
        "unrouted_items": unrouted_items,
        "duplicate_warnings": duplicate_warnings
    }
