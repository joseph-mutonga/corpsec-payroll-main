from typing import List, Union
from sqlalchemy.orm import Session

from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.payroll import PayrollPeriod, PayrollRecord, PayrollError


def validate_payroll_period(db: Session, period_or_id: Union[int, PayrollPeriod]) -> List[PayrollError]:
    """
    Performs pre-confirmation validation on all payroll records for a period.
    Generates and persists PayrollError records in DB.
    """
    if isinstance(period_or_id, (int, str)):
        period_id = int(period_or_id)
    else:
        period_id = int(getattr(period_or_id, "id"))

    records = db.query(PayrollRecord).filter(PayrollRecord.payroll_period_id == period_id).all()
    
    # Delete existing unresolved/open errors for this period before re-scanning
    db.query(PayrollError).filter(
        PayrollError.payroll_period_id == period_id,
        PayrollError.status.in_(["UNRESOLVED", "OPEN"])
    ).delete(synchronize_session=False)
    db.commit()

    errors = []

    for rec in records:
        guard = db.query(Guard).filter(Guard.id == rec.guard_id).first()
        site = db.query(Site).filter(Site.id == rec.site_id).first()

        if not guard:
            continue

        # 1. Missing NSSF number
        if not guard.nssf_number or not guard.nssf_number.strip():
            msg = f"Guard {guard.employee_number} ({guard.full_name}) is missing NSSF statutory number."
            err = PayrollError(
                payroll_period_id=period_id,
                guard_id=guard.id,
                error_type="MISSING_NSSF",
                error_code="MISSING_NSSF",
                error_message=msg,
                description=msg,
                severity="HIGH",
                status="OPEN"
            )
            db.add(err)
            errors.append(err)

        # 2. Missing SHIF number
        if not guard.shif_number or not guard.shif_number.strip():
            msg = f"Guard {guard.employee_number} ({guard.full_name}) is missing SHIF statutory number."
            err = PayrollError(
                payroll_period_id=period_id,
                guard_id=guard.id,
                error_type="MISSING_SHIF",
                error_code="MISSING_SHIF",
                error_message=msg,
                description=msg,
                severity="HIGH",
                status="OPEN"
            )
            db.add(err)
            errors.append(err)

        # 3. Missing Payment Details
        if guard.payment_method == "Bank Transfer" and (not guard.bank_name or not guard.bank_account):
            msg = f"Guard {guard.employee_number} has Bank Transfer selected but bank name/account is missing."
            err = PayrollError(
                payroll_period_id=period_id,
                guard_id=guard.id,
                error_type="MISSING_BANK_DETAILS",
                error_code="MISSING_BANK_DETAILS",
                error_message=msg,
                description=msg,
                severity="HIGH",
                status="OPEN"
            )
            db.add(err)
            errors.append(err)
        elif guard.payment_method == "M-Pesa" and not guard.mpesa_number:
            msg = f"Guard {guard.employee_number} has M-Pesa selected but M-Pesa phone number is missing."
            err = PayrollError(
                payroll_period_id=period_id,
                guard_id=guard.id,
                error_type="MISSING_MPESA_DETAILS",
                error_code="MISSING_MPESA_DETAILS",
                error_message=msg,
                description=msg,
                severity="HIGH",
                status="OPEN"
            )
            db.add(err)
            errors.append(err)

        # 4. Invalid Daily Salary Rate
        if not site or site.daily_rate <= 0:
            msg = f"Site '{site.site_name if site else 'Unknown'}' assigned to Guard {guard.employee_number} has an unconfigured daily rate (KES 0)."
            err = PayrollError(
                payroll_period_id=period_id,
                guard_id=guard.id,
                error_type="ZERO_RATE",
                error_code="ZERO_RATE",
                error_message=msg,
                description=msg,
                severity="CRITICAL",
                status="OPEN"
            )
            db.add(err)
            errors.append(err)

        # 5. Excessive Overtime
        if rec.overtime_hours > 40.0:
            msg = f"Guard {guard.employee_number} logged {rec.overtime_hours} hours of overtime in this period (> 40h threshold)."
            err = PayrollError(
                payroll_period_id=period_id,
                guard_id=guard.id,
                error_type="EXCESSIVE_OVERTIME",
                error_code="EXCESSIVE_OVERTIME",
                error_message=msg,
                description=msg,
                severity="WARNING",
                status="OPEN"
            )
            db.add(err)
            errors.append(err)

    db.commit()
    return errors
