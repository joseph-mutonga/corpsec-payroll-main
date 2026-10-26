from datetime import datetime, date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from application.backend.app.api.deps import get_db, require_admin, require_guard, get_current_user
from application.backend.app.models.attendance import Attendance
from application.backend.app.models.guard import Guard
from application.backend.app.models.shift import Shift
from application.backend.app.models.user import User, UserRole
from application.backend.app.schemas.attendance import (
    AttendanceLogRequest, AttendanceCorrectionRequest, AttendanceResponse, AnomalyResponse
)
from application.backend.app.services.attendance_service import (
    calculate_shift_hours, scan_pre_payroll_anomalies, sync_overtime_claim
)

from application.backend.app.models.roster import RosterAssignment

router = APIRouter(prefix="/attendance", tags=["Attendance Management"])


@router.post("/clock-in", response_model=AttendanceResponse)
def clock_in(
    shift_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    guard_user: User = Depends(require_guard)
):
    """Guard Mobile Clock-In Endpoint matching Screen 19."""
    guard = db.query(Guard).filter(Guard.id == guard_user.guard_id).first()
    if not guard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guard profile not found")

    today = date.today()
    now = datetime.now()

    check_period_not_locked(db, today)

    # Query today's roster assignment for the guard
    today_asgn = db.query(RosterAssignment).filter(
        RosterAssignment.guard_id == guard.id,
        RosterAssignment.shift_date == today
    ).first()

    resolved_site_id = None
    resolved_shift_id = None
    is_rostered = False

    if today_asgn and today_asgn.site_id and today_asgn.shift_id:
        resolved_site_id = today_asgn.site_id
        resolved_shift_id = today_asgn.shift_id
        is_rostered = True
    elif shift_id:
        shift = db.query(Shift).filter(Shift.id == shift_id).first()
        if not shift:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift not found")
        resolved_shift_id = shift.id
        resolved_site_id = guard.primary_site_id if guard.primary_site_id else 1
    elif guard.shift_id and guard.primary_site_id:
        resolved_shift_id = guard.shift_id
        resolved_site_id = guard.primary_site_id
    else:
        # Default fallback shift #1 (Day Shift)
        first_shift = db.query(Shift).first()
        resolved_shift_id = first_shift.id if first_shift else 1
        resolved_site_id = guard.primary_site_id if guard.primary_site_id else 1

    active_unclosed = db.query(Attendance).filter(
        Attendance.guard_id == guard.id,
        Attendance.actual_clock_in.isnot(None),
        Attendance.actual_clock_out.is_(None)
    ).first()
    if active_unclosed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Guard has an active unclosed shift. Please clock out first before starting a new shift."
        )

    existing = db.query(Attendance).filter(
        Attendance.guard_id == guard.id,
        Attendance.shift_date == today
    ).first()

    notes_val = "Roster-driven clock in" if is_rostered else "Unrostered clock in"

    if not existing:
        existing = Attendance(
            guard_id=guard.id,
            shift_id=resolved_shift_id,
            site_id=resolved_site_id,
            shift_date=today,
            actual_clock_in=now,
            status="PRESENT",
            notes=notes_val
        )
        db.add(existing)
    else:
        existing.shift_id = resolved_shift_id
        existing.site_id = resolved_site_id
        existing.actual_clock_in = now
        existing.actual_clock_out = None
        existing.regular_hours = 0.0
        existing.overtime_hours = 0.0
        existing.status = "PRESENT"
        existing.notes = notes_val

    db.commit()
    db.refresh(existing)
    return existing


@router.post("/clock-out", response_model=AttendanceResponse)
def clock_out(
    db: Session = Depends(get_db),
    guard_user: User = Depends(require_guard)
):
    """Guard Mobile Clock-Out Endpoint matching Screen 19."""
    today = date.today()
    now = datetime.now()

    check_period_not_locked(db, today)

    att = db.query(Attendance).filter(
        Attendance.guard_id == guard_user.guard_id,
        Attendance.actual_clock_in.isnot(None),
        Attendance.actual_clock_out.is_(None)
    ).order_by(Attendance.shift_date.desc()).first()

    if not att:
        today_att = db.query(Attendance).filter(
            Attendance.guard_id == guard_user.guard_id,
            Attendance.shift_date == today
        ).first()
        if today_att and today_att.actual_clock_out:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already clocked out for today")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active clock-in record found for today")

    att.actual_clock_out = now

    shift_duration = 12.0
    if att.shift_id:
        shift = db.query(Shift).filter(Shift.id == att.shift_id).first()
        if shift:
            shift_duration = shift.duration_hours

    reg_hrs, ot_hrs = calculate_shift_hours(att.actual_clock_in, att.actual_clock_out, shift_duration)
    att.regular_hours = reg_hrs
    att.overtime_hours = ot_hrs
    
    sync_overtime_claim(db, att)

    db.commit()
    db.refresh(att)
    return att


def check_period_not_locked(db: Session, target_date: date):
    from application.backend.app.models.payroll import PayrollPeriod
    period = db.query(PayrollPeriod).filter(
        PayrollPeriod.start_date <= target_date,
        PayrollPeriod.end_date >= target_date,
        PayrollPeriod.status.in_(["CONFIRMED", "CLOSED"])
    ).first()
    if period:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot create or modify attendance for {target_date}: payroll period '{period.period_name}' is already {period.status} and locked."
        )


@router.post("/log", response_model=AttendanceResponse, status_code=status.HTTP_201_CREATED)
def manual_log_attendance(
    payload: AttendanceLogRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Admin endpoint to log manual shift attendance record."""
    check_period_not_locked(db, payload.shift_date)

    shift_duration = 12.0
    if payload.shift_id:
        shift = db.query(Shift).filter(Shift.id == payload.shift_id).first()
        if shift:
            shift_duration = shift.duration_hours

    reg_hrs, ot_hrs = calculate_shift_hours(payload.actual_clock_in, payload.actual_clock_out, shift_duration)

    site_id = payload.site_id
    if not site_id:
        guard = db.query(Guard).filter(Guard.id == payload.guard_id).first()
        site_id = guard.primary_site_id if guard and guard.primary_site_id else 1

    att = Attendance(
        guard_id=payload.guard_id,
        shift_id=payload.shift_id,
        site_id=site_id,
        shift_date=payload.shift_date,
        actual_clock_in=payload.actual_clock_in,
        actual_clock_out=payload.actual_clock_out,
        regular_hours=reg_hrs,
        overtime_hours=ot_hrs,
        status="PRESENT",
        notes=payload.notes
    )
    db.add(att)
    db.flush()
    
    sync_overtime_claim(db, att)

    db.commit()
    db.refresh(att)
    return att


@router.get("/my-attendance", response_model=List[AttendanceResponse])
def get_my_attendance(
    db: Session = Depends(get_db),
    guard_user: User = Depends(require_guard)
):
    """Fetch logged-in guard's attendance history."""
    return db.query(Attendance).filter(Attendance.guard_id == guard_user.guard_id).order_by(Attendance.shift_date.desc()).all()


@router.get("/anomalies", response_model=List[AnomalyResponse])
def get_attendance_anomalies(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Pre-payroll anomaly scanner matching Screen 9."""
    anomalies = scan_pre_payroll_anomalies(db, start_date, end_date)
    return anomalies


@router.put("/{attendance_id}/correct", response_model=AttendanceResponse)
def correct_attendance_record(
    attendance_id: int,
    payload: AttendanceCorrectionRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Admin attendance correction modal endpoint matching Screen 9."""
    att = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if not att:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance record not found")

    check_period_not_locked(db, att.shift_date)

    att.actual_clock_in = payload.actual_clock_in
    att.actual_clock_out = payload.actual_clock_out
    att.status = payload.status
    att.notes = f"Corrected by Admin: {payload.reason}"

    if att.actual_clock_in and att.actual_clock_out:
        shift_duration = 12.0
        if att.shift_id:
            shift = db.query(Shift).filter(Shift.id == att.shift_id).first()
            if shift:
                shift_duration = shift.duration_hours
        reg_hrs, ot_hrs = calculate_shift_hours(att.actual_clock_in, att.actual_clock_out, shift_duration)
        att.regular_hours = reg_hrs
        att.overtime_hours = ot_hrs

    sync_overtime_claim(db, att)

    db.commit()
    db.refresh(att)
    return att


@router.get("", response_model=List[AttendanceResponse])
def list_attendance_records(
    guard_id: Optional[int] = Query(None),
    site_id: Optional[int] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fetch attendance records matching Screen 9."""
    query = db.query(Attendance)

    if current_user.role == UserRole.GUARD.value:
        query = query.filter(Attendance.guard_id == current_user.guard_id)
    elif guard_id:
        query = query.filter(Attendance.guard_id == guard_id)

    if site_id:
        query = query.filter(Attendance.site_id == site_id)
    if start_date:
        query = query.filter(Attendance.shift_date >= start_date)
    if end_date:
        query = query.filter(Attendance.shift_date <= end_date)

    return query.order_by(Attendance.shift_date.desc()).all()
