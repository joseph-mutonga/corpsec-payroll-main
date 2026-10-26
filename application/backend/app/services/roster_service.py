import calendar
from datetime import date, datetime, timedelta
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException, status

from application.backend.app.models.roster import RosterPattern, RosterAssignment
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.shift import Shift
from application.backend.app.models.leave import LeaveRequest
from application.backend.app.models.off_day import OffDayRequest, RelieverAssignment
from application.backend.app.models.attendance import Attendance
from application.backend.app.schemas.roster import (
    RosterPatternCreate, RosterOverrideCreate, RosterGridResponse, RosterGridRow, RosterGridCell
)


def get_month_date_range(year: int, month: int):
    _, last_day = calendar.monthrange(year, month)
    start_date = date(year, month, 1)
    end_date = date(year, month, last_day)
    return start_date, end_date, last_day


def get_rolling_window_end_date(start_from: date) -> date:
    """Returns end of next month from start_from date."""
    year = start_from.year
    month = start_from.month
    next_month = month + 1
    next_year = year
    if next_month > 12:
        next_month = 1
        next_year += 1
    _, last_day = calendar.monthrange(next_year, next_month)
    return date(next_year, next_month, last_day)


def generate_assignments_for_pattern(db: Session, pattern: RosterPattern, start_date: date, end_date: date):
    """
    Materializes RosterAssignment rows for a pattern across a date range.
    Does NOT overwrite any cell where is_override is True.
    """
    try:
        active_days = set(int(d.strip()) for d in pattern.days_of_week.split(",") if d.strip().isdigit())
    except Exception:
        active_days = {0, 1, 2, 3, 4}

    calc_start = max(pattern.start_date, start_date)
    calc_end = end_date
    if pattern.end_date and pattern.end_date < calc_end:
        calc_end = pattern.end_date

    curr = calc_start
    while curr <= calc_end:
        is_workday = curr.weekday() in active_days
        existing = db.query(RosterAssignment).filter(
            RosterAssignment.guard_id == pattern.guard_id,
            RosterAssignment.shift_date == curr
        ).first()

        if is_workday:
            if existing:
                if not existing.is_override:
                    existing.site_id = pattern.site_id
                    existing.shift_id = pattern.shift_id
                    existing.pattern_id = pattern.id
                    existing.updated_at = datetime.now()
            else:
                new_assignment = RosterAssignment(
                    guard_id=pattern.guard_id,
                    site_id=pattern.site_id,
                    shift_id=pattern.shift_id,
                    shift_date=curr,
                    is_override=False,
                    pattern_id=pattern.id
                )
                db.add(new_assignment)
        else:
            # If not a workday, remove any pattern-generated assignment (keep overrides intact)
            if existing and not existing.is_override and existing.pattern_id == pattern.id:
                db.delete(existing)

        curr += timedelta(days=1)


def create_or_update_pattern(db: Session, payload: RosterPatternCreate) -> RosterPattern:
    """Create or update a recurring pattern and generate rolling assignments."""
    guard = db.query(Guard).filter(Guard.id == payload.guard_id).first()
    if not guard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Guard #{payload.guard_id} not found")

    site = db.query(Site).filter(Site.id == payload.site_id).first()
    if not site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Site #{payload.site_id} not found")

    shift = db.query(Shift).filter(Shift.id == payload.shift_id).first()
    if not shift:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Shift #{payload.shift_id} not found")

    # Deactivate existing pattern for guard if any
    existing_patterns = db.query(RosterPattern).filter(
        RosterPattern.guard_id == payload.guard_id,
        RosterPattern.is_active == True
    ).all()
    for p in existing_patterns:
        p.is_active = False

    days_str = ",".join(str(d) for d in payload.days_of_week)
    pattern = RosterPattern(
        guard_id=payload.guard_id,
        site_id=payload.site_id,
        shift_id=payload.shift_id,
        days_of_week=days_str,
        start_date=payload.start_date,
        end_date=payload.end_date,
        is_active=True
    )
    db.add(pattern)
    db.commit()
    db.refresh(pattern)

    # Generate assignments for current month + next month
    window_end = get_rolling_window_end_date(payload.start_date)
    generate_assignments_for_pattern(db, pattern, payload.start_date, window_end)
    db.commit()

    return pattern


def create_or_update_override(db: Session, payload: RosterOverrideCreate) -> RosterAssignment:
    """Sets a single-day admin override for a guard."""
    guard = db.query(Guard).filter(Guard.id == payload.guard_id).first()
    if not guard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Guard #{payload.guard_id} not found")

    if payload.site_id is not None and payload.shift_id is not None:
        check_roster_conflict(db, payload.guard_id, payload.site_id, payload.shift_id, payload.shift_date)

    existing = db.query(RosterAssignment).filter(
        RosterAssignment.guard_id == payload.guard_id,
        RosterAssignment.shift_date == payload.shift_date
    ).first()

    if payload.site_id is None or payload.shift_id is None:
        # Single day off override
        if existing:
            existing.site_id = None
            existing.shift_id = None
            existing.is_override = True
            existing.notes = payload.notes or "Admin Day Off Override"
            existing.updated_at = datetime.now()
            assignment = existing
        else:
            assignment = RosterAssignment(
                guard_id=payload.guard_id,
                site_id=None,
                shift_id=None,
                shift_date=payload.shift_date,
                is_override=True,
                notes=payload.notes or "Admin Day Off Override"
            )
            db.add(assignment)
    else:
        site = db.query(Site).filter(Site.id == payload.site_id).first()
        if not site:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Site #{payload.site_id} not found")

        shift = db.query(Shift).filter(Shift.id == payload.shift_id).first()
        if not shift:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Shift #{payload.shift_id} not found")

        if existing:
            existing.site_id = payload.site_id
            existing.shift_id = payload.shift_id
            existing.is_override = True
            existing.notes = payload.notes or "Admin Schedule Override"
            existing.updated_at = datetime.now()
            assignment = existing
        else:
            assignment = RosterAssignment(
                guard_id=payload.guard_id,
                site_id=payload.site_id,
                shift_id=payload.shift_id,
                shift_date=payload.shift_date,
                is_override=True,
                notes=payload.notes or "Admin Schedule Override"
            )
            db.add(assignment)

    db.commit()
    db.refresh(assignment)
    return assignment


def check_roster_conflict(db: Session, guard_id: int, site_id: int, shift_id: int, shift_date: date, exclude_assignment_id: Optional[int] = None):
    """
    Conflict Detection: Check if guard is already assigned to a DIFFERENT site/shift on the same date,
    or is on approved leave.
    If conflict exists, raise HTTP 400.
    """
    # 1. Approved Leave Conflict Check
    leave_conflict = db.query(LeaveRequest).filter(
        LeaveRequest.guard_id == guard_id,
        LeaveRequest.status == "APPROVED",
        LeaveRequest.start_date <= shift_date,
        LeaveRequest.end_date >= shift_date
    ).first()
    if leave_conflict:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Leave conflict detected: Guard is on approved leave ({leave_conflict.leave_type}) from {leave_conflict.start_date} to {leave_conflict.end_date}"
        )

    # 2. Site/Shift Assignment Conflict Check
    query = db.query(RosterAssignment).filter(
        RosterAssignment.guard_id == guard_id,
        RosterAssignment.shift_date == shift_date
    )
    if exclude_assignment_id:
        query = query.filter(RosterAssignment.id != exclude_assignment_id)

    existing = query.first()
    if existing and existing.site_id and existing.site_id != site_id:
        existing_site = db.query(Site).filter(Site.id == existing.site_id).first()
        site_name = existing_site.site_name if existing_site else f"Site #{existing.site_id}"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Conflict detected: Guard is already assigned to {site_name} on {shift_date.strftime('%Y-%m-%d')}"
        )


def get_roster_grid(db: Session, year: int, month: int) -> RosterGridResponse:
    """Generates the full monthly roster matrix grid for admin UI."""
    start_date, end_date, days_in_month = get_month_date_range(year, month)

    # Make sure active patterns have generated assignments for this month
    active_patterns = db.query(RosterPattern).filter(RosterPattern.is_active == True).all()
    for p in active_patterns:
        generate_assignments_for_pattern(db, p, start_date, end_date)
    db.commit()

    guards = db.query(Guard).filter(Guard.status == "ACTIVE").order_by(Guard.id).all()
    assignments = db.query(RosterAssignment).options(
        joinedload(RosterAssignment.site),
        joinedload(RosterAssignment.shift)
    ).filter(
        RosterAssignment.shift_date >= start_date,
        RosterAssignment.shift_date <= end_date
    ).all()

    # Fetch approved leave requests overlapping this month
    leave_requests = db.query(LeaveRequest).filter(
        LeaveRequest.status == "APPROVED",
        LeaveRequest.start_date <= end_date,
        LeaveRequest.end_date >= start_date
    ).all()
    leave_map: Dict[tuple, LeaveRequest] = {}
    for lr in leave_requests:
        curr_l = max(lr.start_date, start_date)
        l_end = min(lr.end_date, end_date)
        while curr_l <= l_end:
            leave_map[(lr.guard_id, curr_l)] = lr
            curr_l += timedelta(days=1)

    # Fetch approved off-day requests overlapping this month
    off_day_reqs = db.query(OffDayRequest).filter(
        OffDayRequest.status == "APPROVED",
        OffDayRequest.start_date <= end_date,
        OffDayRequest.end_date >= start_date
    ).all()
    off_day_map: Dict[tuple, OffDayRequest] = {}
    for od in off_day_reqs:
        curr_o = max(od.start_date, start_date)
        o_end = min(od.end_date, end_date)
        while curr_o <= o_end:
            off_day_map[(od.guard_id, curr_o)] = od
            curr_o += timedelta(days=1)

    # Fetch reliever assignments overlapping this month
    reliever_asgns = db.query(RelieverAssignment).options(
        joinedload(RelieverAssignment.site),
        joinedload(RelieverAssignment.covering_for_guard)
    ).filter(
        RelieverAssignment.shift_date >= start_date,
        RelieverAssignment.shift_date <= end_date
    ).all()
    reliever_map: Dict[tuple, RelieverAssignment] = {}
    for r in reliever_asgns:
        reliever_map[(r.reliever_guard_id, r.shift_date)] = r

    # Fetch attendance records for attendance status precedence
    attendances = db.query(Attendance).filter(
        Attendance.shift_date >= start_date,
        Attendance.shift_date <= end_date,
        Attendance.status.in_(["PRESENT", "LATE", "OVERTIME"])
    ).all()
    attendance_map: Dict[tuple, Attendance] = {}
    for att in attendances:
        attendance_map[(att.guard_id, att.shift_date)] = att

    # Map (guard_id, shift_date) -> RosterAssignment
    assignment_map: Dict[tuple, RosterAssignment] = {}
    for a in assignments:
        assignment_map[(a.guard_id, a.shift_date)] = a

    rows: List[RosterGridRow] = []

    for guard in guards:
        cells: Dict[str, RosterGridCell] = {}
        for d in range(1, days_in_month + 1):
            curr_date = date(year, month, d)
            date_str = curr_date.strftime("%Y-%m-%d")
            asgn = assignment_map.get((guard.id, curr_date))
            l_req = leave_map.get((guard.id, curr_date))
            off_req = off_day_map.get((guard.id, curr_date))
            reliever_asgn = reliever_map.get((guard.id, curr_date))
            att_rec = attendance_map.get((guard.id, curr_date))

            # Priority 1: Real Clock-In Attendance (Guard returned & attended)
            if att_rec:
                cells[date_str] = RosterGridCell(
                    date=date_str,
                    assignment_id=asgn.id if asgn else None,
                    site_id=asgn.site_id if asgn else guard.primary_site_id,
                    site_name=asgn.site.site_name if (asgn and asgn.site) else (guard.site.site_name if guard.site else "Attended"),
                    shift_id=asgn.shift_id if asgn else None,
                    shift_name=att_rec.status,
                    is_night_shift=asgn.shift.is_night_shift if (asgn and asgn.shift) else False,
                    is_override=False,
                    is_off=False,
                    is_leave=False,
                    duration_hours=None
                )
            elif l_req:
                # Approved leave takes visual precedence
                cells[date_str] = RosterGridCell(
                    date=date_str,
                    assignment_id=asgn.id if asgn else None,
                    site_id=None,
                    site_name=f"On Leave ({l_req.leave_type})",
                    shift_id=None,
                    shift_name="Leave",
                    is_night_shift=False,
                    is_override=asgn.is_override if asgn else False,
                    is_off=True,
                    is_leave=True,
                    duration_hours=None
                )
            elif off_req:
                # Approved Off Day
                cells[date_str] = RosterGridCell(
                    date=date_str,
                    assignment_id=asgn.id if asgn else None,
                    site_id=None,
                    site_name="OFF (Off Day)",
                    shift_id=None,
                    shift_name="Off",
                    is_night_shift=False,
                    is_override=True,
                    is_off=True,
                    is_leave=False,
                    duration_hours=None
                )
            elif reliever_asgn:
                # Reliever covering assignment
                cov_name = reliever_asgn.covering_for_guard.full_name if reliever_asgn.covering_for_guard else f"Guard #{reliever_asgn.covering_for_guard_id}"
                site_lbl = reliever_asgn.site.site_name if reliever_asgn.site else f"Site #{reliever_asgn.site_id}"
                cells[date_str] = RosterGridCell(
                    date=date_str,
                    assignment_id=None,
                    site_id=reliever_asgn.site_id,
                    site_name=f"RELIEVER ({site_lbl})",
                    shift_id=reliever_asgn.shift_id,
                    shift_name=f"Covering {cov_name}",
                    is_night_shift=False,
                    is_override=True,
                    is_off=False,
                    is_leave=False,
                    duration_hours=None
                )
            elif asgn and asgn.site_id and asgn.shift_id:
                cells[date_str] = RosterGridCell(
                    date=date_str,
                    assignment_id=asgn.id,
                    site_id=asgn.site_id,
                    site_name=asgn.site.site_name if asgn.site else f"Site #{asgn.site_id}",
                    shift_id=asgn.shift_id,
                    shift_name=asgn.shift.name if asgn.shift else f"Shift #{asgn.shift_id}",
                    is_night_shift=asgn.shift.is_night_shift if asgn.shift else False,
                    is_override=asgn.is_override,
                    is_off=False,
                    is_leave=False,
                    duration_hours=asgn.shift.duration_hours if asgn.shift else None
                )
            elif asgn and asgn.is_override and asgn.site_id is None:
                # Explicit Day Off override
                cells[date_str] = RosterGridCell(
                    date=date_str,
                    assignment_id=asgn.id,
                    site_id=None,
                    site_name="Day Off",
                    shift_id=None,
                    shift_name="Off",
                    is_night_shift=False,
                    is_override=True,
                    is_off=True,
                    is_leave=False,
                    duration_hours=None
                )
            else:
                # Unassigned / Day Off
                cells[date_str] = RosterGridCell(
                    date=date_str,
                    assignment_id=None,
                    site_id=None,
                    site_name="Off",
                    shift_id=None,
                    shift_name="Off",
                    is_night_shift=False,
                    is_override=False,
                    is_off=True,
                    is_leave=False,
                    duration_hours=None
                )

        rows.append(RosterGridRow(
            guard_id=guard.id,
            employee_number=guard.employee_number,
            full_name=guard.full_name,
            cells=cells
        ))

    return RosterGridResponse(
        year=year,
        month=month,
        days_in_month=days_in_month,
        start_date=start_date.strftime("%Y-%m-%d"),
        end_date=end_date.strftime("%Y-%m-%d"),
        rows=rows
    )
