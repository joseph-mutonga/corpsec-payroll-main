from datetime import datetime, date
from typing import Tuple, List, Dict, Any, Optional
from sqlalchemy.orm import Session

from application.backend.app.models.attendance import Attendance, OvertimeClaim
from application.backend.app.models.guard import Guard


def calculate_shift_hours(clock_in: datetime, clock_out: datetime, scheduled_duration_hours: float = 12.0) -> Tuple[float, float]:
    """
    Calculates total hours worked from clock-in and clock-out timestamps.
    Handles midnight-crossing shifts correctly (e.g. 18:00 to 06:00 next day = 12 hours).
    Standard regular shift hours: up to scheduled_duration_hours (default 12.0 hours).
    Overtime hours: hours beyond scheduled_duration_hours.
    Returns: (regular_hours, overtime_hours)
    """
    if not clock_in or not clock_out or clock_out <= clock_in:
        return 0.0, 0.0

    duration_seconds = (clock_out - clock_in).total_seconds()
    total_hours = round(duration_seconds / 3600.0, 2)

    if total_hours <= scheduled_duration_hours:
        regular_hours = total_hours
        overtime_hours = 0.0
    else:
        regular_hours = scheduled_duration_hours
        overtime_hours = round(total_hours - scheduled_duration_hours, 2)

    return regular_hours, overtime_hours


def sync_overtime_claim(db: Session, att: Attendance) -> Optional[OvertimeClaim]:
    """
    Synchronizes an OvertimeClaim record for an Attendance entry when overtime_hours > 0.
    Creates a claim in PENDING status if none exists, or updates hours if still PENDING.
    Determines 1.5x (standard) vs 2.0x (Sunday/Public Holiday) rate multiplier.
    """
    existing_claim = db.query(OvertimeClaim).filter(OvertimeClaim.attendance_id == att.id).first()

    if att.overtime_hours > 0:
        multiplier = 2.0 if (att.shift_date and att.shift_date.weekday() == 6) else 1.5
        reason = f"Automated shift overtime claim for {att.overtime_hours}h worked on {att.shift_date}"

        if not existing_claim:
            claim = OvertimeClaim(
                guard_id=att.guard_id,
                attendance_id=att.id,
                claim_date=att.shift_date,
                hours_claimed=att.overtime_hours,
                multiplier=multiplier,
                reason=reason,
                status="PENDING"
            )
            db.add(claim)
            return claim
        else:
            if existing_claim.status == "PENDING":
                existing_claim.hours_claimed = att.overtime_hours
                existing_claim.multiplier = multiplier
                existing_claim.reason = reason
            return existing_claim
    else:
        if existing_claim and existing_claim.status == "PENDING":
            db.delete(existing_claim)
        return None


def scan_pre_payroll_anomalies(db: Session, start_date: date, end_date: date) -> List[Dict[str, Any]]:
    """
    Scans attendance records for anomalies prior to payroll processing:
    1. Missing clock-out (Clocked in but never clocked out)
    2. Excessive hours (> 16 hours in a single shift)
    """
    query = db.query(Attendance).filter(
        Attendance.shift_date >= start_date,
        Attendance.shift_date <= end_date
    )

    records = query.all()
    anomalies = []

    for att in records:
        guard = db.query(Guard).filter(Guard.id == att.guard_id).first()
        gname = guard.full_name if guard else f"Guard #{att.guard_id}"

        if att.actual_clock_in and not att.actual_clock_out:
            anomalies.append({
                "guard_id": att.guard_id,
                "guard_name": gname,
                "shift_date": att.shift_date,
                "anomaly_type": "MISSING_CLOCK_OUT",
                "severity": "CRITICAL",
                "description": f"Guard {gname} clocked in at {att.actual_clock_in.strftime('%H:%M')} but has no clock-out record."
            })
        elif att.regular_hours + att.overtime_hours > 16.0:
            anomalies.append({
                "guard_id": att.guard_id,
                "guard_name": gname,
                "shift_date": att.shift_date,
                "anomaly_type": "EXCESSIVE_HOURS",
                "severity": "WARNING",
                "description": f"Guard {gname} logged {att.regular_hours + att.overtime_hours} hours on {att.shift_date}."
            })

    return anomalies


detect_attendance_anomalies = scan_pre_payroll_anomalies
