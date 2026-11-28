from datetime import datetime, date, timedelta
from typing import List, Optional, Tuple
from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from application.backend.app.core.config import settings
from application.backend.app.api.deps import (
    get_db, require_admin, require_guard, get_current_user,
    require_admin_or_supervisor
)
from application.backend.app.models.attendance import Attendance
from application.backend.app.models.guard import Guard
from application.backend.app.models.shift import Shift
from application.backend.app.models.site import Site
from application.backend.app.models.audit import AuditLog
from application.backend.app.models.user import User, UserRole
from application.backend.app.schemas.attendance import (
    AttendanceLogRequest, AttendanceCorrectionRequest, AttendanceResponse, AnomalyResponse,
    ClockInPayload, ClockOutPayload, AttendanceReviewApproveRequest
)
from application.backend.app.services.attendance_service import (
    calculate_shift_hours, scan_pre_payroll_anomalies, sync_overtime_claim
)

from application.backend.app.models.roster import RosterAssignment

def is_guard_under_supervisor(db: Session, guard_id: int, supervisor_user_id: int, site_id: Optional[int] = None) -> bool:
    """
    Checks if a guard is under the mandate of a supervisor:
    1. Guard directly assigned to the supervisor (Guard.supervisor_id == supervisor_user_id)
    2. Guard stationed at a site supervised by this supervisor (Site.supervisor_id == supervisor_user_id)
    3. Attendance record is associated with a site supervised by this supervisor
    4. Guard has roster assignments at a site supervised by this supervisor
    """
    guard = db.query(Guard).filter(Guard.id == guard_id).first()
    if not guard:
        return False
    if guard.supervisor_id == supervisor_user_id:
        return True

    sup_site_ids = [s[0] for s in db.query(Site.id).filter(Site.supervisor_id == supervisor_user_id).all()]
    if sup_site_ids:
        if guard.primary_site_id and guard.primary_site_id in sup_site_ids:
            return True
        if site_id and site_id in sup_site_ids:
            return True
        rostered = db.query(RosterAssignment).filter(
            RosterAssignment.guard_id == guard_id,
            RosterAssignment.site_id.in_(sup_site_ids)
        ).first()
        if rostered:
            return True

    return False


router = APIRouter(prefix="/attendance", tags=["Attendance Management"])


def calculate_haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    import math
    R = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2.0)**2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def auto_close_past_unclosed_shifts(db: Session, guard_id: int, current_date: date):
    """
    Automatically closes any stale unclosed attendance records from previous dates (< current_date).
    Guards occasionally forget to clock out at shift completion; past forgotten shifts must never
    prevent them from clocking in on a new day.
    """
    past_unclosed = db.query(Attendance).filter(
        Attendance.guard_id == guard_id,
        Attendance.shift_date < current_date,
        Attendance.actual_clock_in.isnot(None),
        Attendance.actual_clock_out.is_(None)
    ).all()

    for past_att in past_unclosed:
        shift_duration = 12.0
        if past_att.shift_id:
            s_obj = db.query(Shift).filter(Shift.id == past_att.shift_id).first()
            if s_obj and s_obj.duration_hours:
                shift_duration = float(s_obj.duration_hours)

        past_att.actual_clock_out = past_att.actual_clock_in + timedelta(hours=shift_duration)
        past_att.regular_hours = shift_duration
        past_att.overtime_hours = 0.0
        prev_note = past_att.notes or ""
        past_att.notes = f"{prev_note} | Auto-closed: previous unclosed shift upon next shift clock-in".strip(" |")

    if past_unclosed:
        db.commit()


def normalize_naive_datetime(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone().replace(tzinfo=None)
    return dt


def evaluate_offline_timestamp(
    device_ts: Optional[datetime],
    server_now: datetime,
    clock_skew_ms: Optional[int],
    is_offline: bool
) -> Tuple[Optional[datetime], bool, List[str]]:
    """
    Evaluates untrusted device_timestamp and clock_skew_ms against server_now.
    Never silently adjusts payroll times using clock_skew_ms.
    Flags:
    - abs(clock_skew_ms) > OFFLINE_SYNC_MAX_CLOCK_SKEW_MINUTES (default 5m)
    - device_ts > server_now + OFFLINE_SYNC_MAX_FUTURE_MINUTES (default 5m)
    - device_ts < server_now - OFFLINE_SYNC_MAX_PAST_HOURS (default 48h)
    - (server_now - device_ts) > OFFLINE_SYNC_LATE_THRESHOLD_MINUTES (default 30m)
    """
    raw_dt = normalize_naive_datetime(device_ts)
    reasons: List[str] = []
    needs_review = False

    max_skew_ms = settings.OFFLINE_SYNC_MAX_CLOCK_SKEW_MINUTES * 60 * 1000
    if clock_skew_ms is not None and abs(clock_skew_ms) > max_skew_ms:
        needs_review = True
        skew_min = round(abs(clock_skew_ms) / 60000.0, 1)
        reasons.append(f"Clock skew exceeds {settings.OFFLINE_SYNC_MAX_CLOCK_SKEW_MINUTES}m ({skew_min}m)")

    if raw_dt is not None:
        future_limit = server_now + timedelta(minutes=settings.OFFLINE_SYNC_MAX_FUTURE_MINUTES)
        past_limit = server_now - timedelta(hours=settings.OFFLINE_SYNC_MAX_PAST_HOURS)
        late_threshold = timedelta(minutes=settings.OFFLINE_SYNC_LATE_THRESHOLD_MINUTES)

        if raw_dt > future_limit:
            needs_review = True
            diff_min = int((raw_dt - server_now).total_seconds() // 60)
            reasons.append(f"Device timestamp is {diff_min}m in the future (>{settings.OFFLINE_SYNC_MAX_FUTURE_MINUTES}m limit)")
        elif raw_dt < past_limit:
            needs_review = True
            diff_hr = round((server_now - raw_dt).total_seconds() / 3600.0, 1)
            reasons.append(f"Device timestamp is {diff_hr}h old (>{settings.OFFLINE_SYNC_MAX_PAST_HOURS}h limit)")
        elif is_offline and (server_now - raw_dt) > late_threshold:
            needs_review = True
            delay_min = int((server_now - raw_dt).total_seconds() // 60)
            reasons.append(f"Late offline sync ({delay_min}m delay > {settings.OFFLINE_SYNC_LATE_THRESHOLD_MINUTES}m threshold)")

    return raw_dt, needs_review, reasons


@router.post("/clock-in", response_model=AttendanceResponse)
def clock_in(
    shift_id: Optional[int] = Query(None),
    latitude: Optional[float] = Query(None),
    longitude: Optional[float] = Query(None),
    client_uuid: Optional[str] = Query(None),
    submitted_offline: Optional[bool] = Query(False),
    clock_skew_ms: Optional[int] = Query(None),
    payload: Optional[ClockInPayload] = Body(None),
    db: Session = Depends(get_db),
    guard_user: User = Depends(require_guard)
):
    """Guard Mobile Clock-In Endpoint matching Screen 19 (with offline sync & idempotency support)."""
    guard = db.query(Guard).filter(Guard.id == guard_user.guard_id).first()
    if not guard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guard profile not found")

    eff_shift_id = payload.shift_id if (payload and payload.shift_id is not None) else shift_id
    eff_lat = payload.latitude if (payload and payload.latitude is not None) else latitude
    eff_lon = payload.longitude if (payload and payload.longitude is not None) else longitude
    eff_uuid = (payload.client_uuid if (payload and payload.client_uuid) else client_uuid) or None
    if eff_uuid:
        eff_uuid = eff_uuid.strip()[:64]
    is_offline = bool((payload and payload.submitted_offline) or submitted_offline)
    eff_skew = payload.clock_skew_ms if (payload and payload.clock_skew_ms is not None) else clock_skew_ms
    raw_device_input = payload.device_timestamp if payload else None

    # 0. Idempotency check: duplicate (guard_id, client_uuid) returns existing record immediately
    if eff_uuid:
        existing_by_uuid = db.query(Attendance).filter(
            Attendance.guard_id == guard.id,
            Attendance.client_uuid == eff_uuid
        ).first()
        if existing_by_uuid:
            return existing_by_uuid

    now = datetime.now()
    raw_device_ts, needs_review, review_reasons = evaluate_offline_timestamp(
        raw_device_input, now, eff_skew, is_offline
    )
    effective_clock_in = raw_device_ts if (is_offline and raw_device_ts is not None) else now
    today = effective_clock_in.date()

    check_period_not_locked(db, today)

    # 1. Automatically close any stale unclosed shifts from previous days
    auto_close_past_unclosed_shifts(db, guard.id, today)

    # 2. Check if guard already has an active clock-in for TODAY
    today_active = db.query(Attendance).filter(
        Attendance.guard_id == guard.id,
        Attendance.shift_date == today,
        Attendance.actual_clock_in.isnot(None),
        Attendance.actual_clock_out.is_(None)
    ).first()
    if today_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Guard is already clocked in for today's shift (Clocked in at {today_active.actual_clock_in.strftime('%H:%M')}). Please clock out first before starting a new shift."
        )

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
    elif eff_shift_id:
        shift = db.query(Shift).filter(Shift.id == eff_shift_id).first()
        if not shift:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shift not found")
        resolved_shift_id = shift.id
        resolved_site_id = guard.primary_site_id if guard.primary_site_id else 1
    elif guard.shift_id and guard.primary_site_id:
        resolved_shift_id = guard.shift_id
        resolved_site_id = guard.primary_site_id
    else:
        first_shift = db.query(Shift).first()
        if not first_shift:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No shifts configured in the database. Please create a shift first."
            )
        resolved_shift_id = first_shift.id
        resolved_site_id = guard.primary_site_id

    existing = db.query(Attendance).filter(
        Attendance.guard_id == guard.id,
        Attendance.shift_date == today
    ).first()

    notes_val = "Roster-driven clock in" if is_rostered else "Unrostered clock in"
    if is_offline:
        notes_val += " (Synced from offline queue)"

    # 200m Geofence verification within site perimeter
    target_site = db.query(Site).filter(Site.id == resolved_site_id).first() if resolved_site_id else None
    if target_site and target_site.latitude is not None and target_site.longitude is not None:
        radius = float(target_site.geofence_radius) if target_site.geofence_radius else 200.0
        if eff_lat is not None and eff_lon is not None:
            dist = calculate_haversine_meters(eff_lat, eff_lon, target_site.latitude, target_site.longitude)
            if dist > radius:
                if is_offline:
                    # Do NOT auto-reject offline geofence failures on sync — flag for supervisor review
                    needs_review = True
                    review_reasons.append(
                        f"Offline geofence mismatch: {int(dist)}m from '{target_site.site_name}' (limit {int(radius)}m)"
                    )
                    notes_val += f" | Offline GPS outside geofence: {int(dist)}m > {int(radius)}m (flagged for review)"
                else:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Clock-in rejected: You are {int(dist)} metres away from '{target_site.site_name}'. You must be within {int(radius)} metres radius to sign in."
                    )
            else:
                notes_val += f" | GPS verified: {int(dist)}m from site perimeter"
        elif is_offline:
            needs_review = True
            review_reasons.append("Offline clock-in missing GPS coordinates for geofenced site")

    review_reason_str = "; ".join(review_reasons) if review_reasons else None

    if not existing:
        existing = Attendance(
            guard_id=guard.id,
            shift_id=resolved_shift_id,
            site_id=resolved_site_id,
            shift_date=today,
            actual_clock_in=effective_clock_in,
            status="PRESENT",
            notes=notes_val,
            client_uuid=eff_uuid,
            device_clock_in_at=raw_device_ts or now,
            server_clock_in_received_at=now,
            clock_skew_ms=eff_skew,
            submitted_offline=is_offline,
            needs_supervisor_review=needs_review,
            review_reason=review_reason_str,
        )
        db.add(existing)
    else:
        existing.shift_id = resolved_shift_id
        existing.site_id = resolved_site_id
        existing.actual_clock_in = effective_clock_in
        existing.actual_clock_out = None
        existing.regular_hours = 0.0
        existing.overtime_hours = 0.0
        existing.status = "PRESENT"
        existing.notes = notes_val
        existing.client_uuid = eff_uuid
        existing.device_clock_in_at = raw_device_ts or now
        existing.server_clock_in_received_at = now
        existing.clock_skew_ms = eff_skew
        existing.submitted_offline = is_offline
        existing.needs_supervisor_review = needs_review
        existing.review_reason = review_reason_str

    db.commit()
    db.refresh(existing)
    return existing


@router.post("/clock-out", response_model=AttendanceResponse)
def clock_out(
    client_uuid: Optional[str] = Query(None),
    submitted_offline: Optional[bool] = Query(False),
    clock_skew_ms: Optional[int] = Query(None),
    payload: Optional[ClockOutPayload] = Body(None),
    db: Session = Depends(get_db),
    guard_user: User = Depends(require_guard)
):
    """Guard Mobile Clock-Out Endpoint matching Screen 19 (with offline sync, idempotency & orphaned clock-out handling)."""
    eff_uuid = (payload.client_uuid if (payload and payload.client_uuid) else client_uuid) or None
    if eff_uuid:
        eff_uuid = eff_uuid.strip()[:64]
    is_offline = bool((payload and payload.submitted_offline) or submitted_offline)
    eff_skew = payload.clock_skew_ms if (payload and payload.clock_skew_ms is not None) else clock_skew_ms
    raw_device_input = payload.device_timestamp if payload else None
    parent_uuid = (payload.parent_clock_in_uuid.strip()[:64] if (payload and payload.parent_clock_in_uuid) else None)
    orphaned_reason = payload.orphaned_clock_in_reason if payload else None

    # 0. Idempotency check on (guard_id, clock_out_client_uuid)
    if eff_uuid:
        existing_out = db.query(Attendance).filter(
            Attendance.guard_id == guard_user.guard_id,
            Attendance.clock_out_client_uuid == eff_uuid
        ).first()
        if existing_out:
            return existing_out

    now = datetime.now()
    raw_device_ts, needs_review, review_reasons = evaluate_offline_timestamp(
        raw_device_input, now, eff_skew, is_offline
    )
    effective_clock_out = raw_device_ts if (is_offline and raw_device_ts is not None) else now
    today = effective_clock_out.date()

    check_period_not_locked(db, today)

    att = None
    if parent_uuid:
        att = db.query(Attendance).filter(
            Attendance.guard_id == guard_user.guard_id,
            Attendance.client_uuid == parent_uuid
        ).first()

    if not att:
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
        if today_att and today_att.actual_clock_out and not is_offline:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already clocked out for today")

        if is_offline or orphaned_reason:
            # Dependent / Orphaned offline clock-out: preceding clock-in failed or is missing.
            # Never silently drop! Create a PENDING_REVIEW record so supervisors can reconcile it
            # without miscounting it as a paid PRESENT shift in payroll before approval.
            guard = db.query(Guard).filter(Guard.id == guard_user.guard_id).first()
            fallback_shift_id = (guard.shift_id if guard and guard.shift_id else None)
            if not fallback_shift_id:
                first_shift = db.query(Shift).first()
                fallback_shift_id = first_shift.id if first_shift else 1
            fallback_site_id = guard.primary_site_id if guard and guard.primary_site_id else 1

            orphan_msg = "Orphaned offline clock-out: preceding clock-in missing or failed"
            if orphaned_reason:
                orphan_msg += f" ({orphaned_reason})"
            all_reasons = [orphan_msg] + review_reasons

            orphan_att = Attendance(
                guard_id=guard_user.guard_id,
                shift_id=fallback_shift_id,
                site_id=fallback_site_id,
                shift_date=today,
                actual_clock_in=None,
                actual_clock_out=effective_clock_out,
                regular_hours=0.0,
                overtime_hours=0.0,
                status="PENDING_REVIEW",
                notes=f"Offline clock-out recorded without active clock-in | {orphan_msg}",
                clock_out_client_uuid=eff_uuid,
                device_clock_out_at=raw_device_ts or now,
                server_clock_out_received_at=now,
                clock_skew_ms=eff_skew,
                submitted_offline=True,
                needs_supervisor_review=True,
                review_reason="; ".join(all_reasons),
            )
            db.add(orphan_att)
            db.commit()
            db.refresh(orphan_att)
            return orphan_att

        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active clock-in record found for today")

    att.actual_clock_out = effective_clock_out
    att.clock_out_client_uuid = eff_uuid
    att.device_clock_out_at = raw_device_ts or now
    att.server_clock_out_received_at = now
    if eff_skew is not None:
        att.clock_skew_ms = eff_skew
    if is_offline:
        att.submitted_offline = True
        att.notes = f"{att.notes or ''} | Clock-out synced from offline queue".strip(" |")

    if needs_review:
        att.needs_supervisor_review = True
        combined_reasons = [att.review_reason] + review_reasons if att.review_reason else review_reasons
        att.review_reason = "; ".join([r for r in combined_reasons if r])

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
    current_user: User = Depends(require_admin_or_supervisor)
):
    """
    Log manual shift attendance record.
    Accessible to ADMIN, HR, and FIELD SUPERVISORS for their assigned guards.
    """
    check_period_not_locked(db, payload.shift_date)

    role_upper = (current_user.role or "").upper()
    if role_upper == UserRole.SUPERVISOR.value:
        if not is_guard_under_supervisor(db, payload.guard_id, current_user.id, payload.site_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Supervisor Mandate Restriction: You are only authorized to log attendance for guards under your supervision or assigned sites."
            )

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

    actor_label = "Supervisor" if role_upper == UserRole.SUPERVISOR.value else "Admin"
    user_name_display = current_user.full_name or current_user.email
    notes_val = f"Logged by {actor_label} ({user_name_display}): {payload.notes}" if payload.notes else f"Logged by {actor_label} ({user_name_display})"

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
        notes=notes_val
    )
    db.add(att)
    db.flush()
    
    sync_overtime_claim(db, att)

    audit_entry = AuditLog(
        user_id=current_user.id,
        user_name=current_user.email,
        role=current_user.role,
        action="MANUAL_LOG_ATTENDANCE",
        target_entity="Attendance",
        target_id=str(att.id),
        reason=f"Manual attendance #{att.id} created for Guard #{payload.guard_id} by {actor_label} ({current_user.email})"
    )
    db.add(audit_entry)

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
    current_user: User = Depends(require_admin_or_supervisor)
):
    """Pre-payroll anomaly scanner matching Screen 9."""
    role_upper = (current_user.role or "").upper()
    guard_ids = None
    if role_upper == UserRole.SUPERVISOR.value:
        sup_site_ids = [s[0] for s in db.query(Site.id).filter(Site.supervisor_id == current_user.id).all()]
        guard_ids = [g[0] for g in db.query(Guard.id).filter(
            (Guard.supervisor_id == current_user.id) | (Guard.primary_site_id.in_(sup_site_ids))
        ).all()]
    anomalies = scan_pre_payroll_anomalies(db, start_date, end_date, guard_ids=guard_ids)
    return anomalies


@router.put("/{attendance_id}/correct", response_model=AttendanceResponse)
def correct_attendance_record(
    attendance_id: int,
    payload: AttendanceCorrectionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_supervisor)
):
    """
    Mandate endpoint to correct attendance record.
    Accessible to ADMIN, HR, and FIELD SUPERVISORS for their assigned guards.
    """
    att = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if not att:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance record not found")

    check_period_not_locked(db, att.shift_date)

    role_upper = (current_user.role or "").upper()
    if role_upper == UserRole.SUPERVISOR.value:
        if not is_guard_under_supervisor(db, att.guard_id, current_user.id, att.site_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Supervisor Mandate Restriction: You are only authorized to correct attendance records for guards under your supervision or assigned sites."
            )

    att.actual_clock_in = payload.actual_clock_in
    att.actual_clock_out = payload.actual_clock_out
    att.status = payload.status

    actor_label = "Supervisor" if role_upper == UserRole.SUPERVISOR.value else "Admin"
    user_name_display = current_user.full_name or current_user.email
    att.notes = f"Corrected by {actor_label} ({user_name_display}): {payload.reason}"
    att.needs_supervisor_review = False
    att.reviewed_by = current_user.email
    att.reviewed_at = datetime.now()

    if att.status in ["ABSENT", "OFF"]:
        att.regular_hours = 0.0
        att.overtime_hours = 0.0
    elif att.actual_clock_in and att.actual_clock_out:
        shift_duration = 12.0
        if att.shift_id:
            shift = db.query(Shift).filter(Shift.id == att.shift_id).first()
            if shift:
                shift_duration = shift.duration_hours
        reg_hrs, ot_hrs = calculate_shift_hours(att.actual_clock_in, att.actual_clock_out, shift_duration)
        att.regular_hours = reg_hrs
        att.overtime_hours = ot_hrs
    else:
        att.regular_hours = 0.0
        att.overtime_hours = 0.0

    sync_overtime_claim(db, att)

    audit_entry = AuditLog(
        user_id=current_user.id,
        user_name=current_user.email,
        role=current_user.role,
        action="CORRECT_ATTENDANCE",
        target_entity="Attendance",
        target_id=str(att.id),
        reason=f"Attendance #{att.id} (Guard #{att.guard_id}) corrected by {actor_label} ({current_user.email}): {payload.reason}"
    )
    db.add(audit_entry)

    db.commit()
    db.refresh(att)
    return att


@router.post("/{attendance_id}/approve-review", response_model=AttendanceResponse)
def approve_flagged_attendance_review(
    attendance_id: int,
    payload: Optional[AttendanceReviewApproveRequest] = Body(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_supervisor)
):
    """
    Approves a flagged offline attendance record after supervisor or admin review.
    Clears needs_supervisor_review, records reviewer identity & timestamp, and recalculates
    shift hours if clock-in/clock-out timestamps were supplied or present.
    """
    att = db.query(Attendance).filter(Attendance.id == attendance_id).first()
    if not att:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attendance record not found")

    check_period_not_locked(db, att.shift_date)

    role_upper = (current_user.role or "").upper()
    if role_upper == UserRole.SUPERVISOR.value:
        if not is_guard_under_supervisor(db, att.guard_id, current_user.id, att.site_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Supervisor Mandate Restriction: You are only authorized to review attendance records for guards under your supervision or assigned sites."
            )

    if payload:
        if payload.actual_clock_in is not None:
            att.actual_clock_in = normalize_naive_datetime(payload.actual_clock_in)
        if payload.actual_clock_out is not None:
            att.actual_clock_out = normalize_naive_datetime(payload.actual_clock_out)
        if payload.status:
            att.status = payload.status

    if att.status == "PENDING_REVIEW" and att.actual_clock_in:
        att.status = "PRESENT"

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

    att.needs_supervisor_review = False
    att.reviewed_by = current_user.email
    att.reviewed_at = datetime.now()
    note_suffix = f"Approved offline review by {current_user.email}"
    if payload and payload.notes:
        note_suffix += f" ({payload.notes})"
    att.notes = f"{att.notes or ''} | {note_suffix}".strip(" |")

    db.add(AuditLog(
        user_id=current_user.id,
        user_name=current_user.email,
        role=current_user.role,
        action="APPROVE_OFFLINE_ATTENDANCE_REVIEW",
        target_entity="Attendance",
        target_id=str(att.id),
        reason=note_suffix
    ))
    db.commit()
    db.refresh(att)
    return att


@router.get("", response_model=List[AttendanceResponse])
def list_attendance_records(
    guard_id: Optional[int] = Query(None),
    site_id: Optional[int] = Query(None),
    shift_id: Optional[int] = Query(None),
    shift_type: Optional[str] = Query(None),
    is_night_shift: Optional[bool] = Query(None),
    shift_date: Optional[date] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    needs_supervisor_review: Optional[bool] = Query(None),
    submitted_offline: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fetch attendance records matching Screen 9 with site and shift type filtering."""
    query = db.query(Attendance).options(
        joinedload(Attendance.guard),
        joinedload(Attendance.site),
        joinedload(Attendance.shift)
    )

    if current_user.role == UserRole.GUARD.value:
        query = query.filter(Attendance.guard_id == current_user.guard_id)
    elif current_user.role == UserRole.SUPERVISOR.value:
        sup_site_ids = [s[0] for s in db.query(Site.id).filter(Site.supervisor_id == current_user.id).all()]
        assigned_guard_ids = [g[0] for g in db.query(Guard.id).filter(
            (Guard.supervisor_id == current_user.id) | (Guard.primary_site_id.in_(sup_site_ids))
        ).all()]
        if sup_site_ids:
            query = query.filter(
                (Attendance.guard_id.in_(assigned_guard_ids)) | (Attendance.site_id.in_(sup_site_ids))
            )
        else:
            query = query.filter(Attendance.guard_id.in_(assigned_guard_ids))
    elif guard_id:
        query = query.filter(Attendance.guard_id == guard_id)

    if site_id:
        query = query.filter(Attendance.site_id == site_id)
    if shift_id:
        query = query.filter(Attendance.shift_id == shift_id)

    if is_night_shift is not None:
        query = query.join(Attendance.shift).filter(Shift.is_night_shift == is_night_shift)
    elif shift_type:
        st = shift_type.strip().upper()
        if st in ["NIGHT", "TRUE", "1"]:
            query = query.join(Attendance.shift).filter(Shift.is_night_shift.is_(True))
        elif st in ["DAY", "FALSE", "0"]:
            query = query.join(Attendance.shift).filter(Shift.is_night_shift.is_(False))
        else:
            query = query.join(Attendance.shift).filter(Shift.shift_type == st)

    if shift_date:
        query = query.filter(Attendance.shift_date == shift_date)
    if start_date:
        query = query.filter(Attendance.shift_date >= start_date)
    if end_date:
        query = query.filter(Attendance.shift_date <= end_date)
    if needs_supervisor_review is not None:
        query = query.filter(Attendance.needs_supervisor_review == needs_supervisor_review)
    if submitted_offline is not None:
        query = query.filter(Attendance.submitted_offline == submitted_offline)

    if search:
        search_term = f"%{search.strip()}%"
        query = query.join(Attendance.guard).outerjoin(Attendance.site).filter(
            (Guard.full_name.ilike(search_term)) |
            (Guard.employee_number.ilike(search_term)) |
            (Site.site_name.ilike(search_term))
        )

    return query.order_by(Attendance.shift_date.desc(), Attendance.id.desc()).all()




# ==================== SUPER GUARD SITE MANDATE ====================

def _resolve_super_guard(db: Session, current_user: User):
    """Helper to verify caller is a Super Guard and get their assigned site."""
    if current_user.role in [UserRole.ADMIN.value, UserRole.SUPERVISOR.value]:
        first_site = db.query(Site).first()
        acting_guard = db.query(Guard).first()
        return (acting_guard, first_site)

    if not current_user.guard_id:
        raise HTTPException(status_code=403, detail="User account is not linked to a guard profile.")

    guard = db.query(Guard).filter(Guard.id == current_user.guard_id).first()
    if not guard:
        raise HTTPException(status_code=404, detail="Guard profile not found.")

    site = None
    if guard.primary_site_id:
        site = db.query(Site).filter(Site.id == guard.primary_site_id).first()
    if not site:
        site = db.query(Site).filter(Site.super_guard_id == guard.id).first()

    has_mandate = bool(getattr(guard, "is_super_guard", False) and site and site.super_guard_id == guard.id)
    if not has_mandate:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Guard Mandate Required: You do not have authorization to clock in/out fellow guards at this site."
        )

    return (guard, site)


@router.get("/super-guard/guards")
def list_super_guard_site_guards(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns all guards stationed at the Super Guard's assigned site along with their today clock-in status.
    Designed so the Super Guard can sign in/out guards who do not own smartphones.
    """
    super_guard, site = _resolve_super_guard(db, current_user)
    if not site:
        raise HTTPException(status_code=400, detail="Super Guard has no site assigned.")

    today = date.today()
    stationed_guards = db.query(Guard).filter(
        Guard.primary_site_id == site.id,
        Guard.status == "ACTIVE"
    ).order_by(Guard.full_name.asc()).all()

    results = []
    for g in stationed_guards:
        today_att = db.query(Attendance).filter(
            Attendance.guard_id == g.id,
            Attendance.shift_date == today
        ).first()

        is_in = bool(today_att and today_att.actual_clock_in and not today_att.actual_clock_out)
        is_completed = bool(today_att and today_att.actual_clock_in and today_att.actual_clock_out)
        shift_name = g.shift.name if g.shift else "Unassigned"
        
        results.append({
            "guard_id": g.id,
            "employee_number": g.employee_number,
            "full_name": g.full_name,
            "phone": g.phone,
            "shift_name": shift_name,
            "is_super_guard": bool(getattr(g, "is_super_guard", False)),
            "is_clocked_in": is_in,
            "is_completed": is_completed,
            "clock_in_time": today_att.actual_clock_in.strftime("%H:%M") if (today_att and today_att.actual_clock_in) else None,
            "clock_out_time": today_att.actual_clock_out.strftime("%H:%M") if (today_att and today_att.actual_clock_out) else None,
            "hours_worked": today_att.regular_hours if today_att else 0.0,
            "status": today_att.status if today_att else "NOT_CLOCKED_IN"
        })

    return {
        "site_id": site.id,
        "site_name": site.site_name,
        "super_guard_name": super_guard.full_name if super_guard else current_user.email,
        "total_stationed": len(results),
        "guards": results,
        "stationed_guards": results
    }


@router.post("/super-guard/guards/{target_guard_id}/clock-in")
def super_guard_mandate_clock_in(
    target_guard_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Super Guard clocks in a stationed guard at their site who does not possess a smartphone.
    """
    super_guard, site = _resolve_super_guard(db, current_user)
    target_guard = db.query(Guard).filter(Guard.id == target_guard_id).first()
    if not target_guard:
        raise HTTPException(status_code=404, detail="Guard not found")

    if site and target_guard.primary_site_id != site.id and current_user.role not in [UserRole.ADMIN.value, UserRole.SUPERVISOR.value]:
        raise HTTPException(
            status_code=403,
            detail=f"Guard '{target_guard.full_name}' is stationed at another site. You only have mandate for {site.site_name}."
        )

    today = date.today()
    now = datetime.now()

    check_period_not_locked(db, today)

    # 1. Automatically close any stale unclosed shifts from previous days
    auto_close_past_unclosed_shifts(db, target_guard.id, today)

    # 2. Check if target guard already has an active clock-in for TODAY
    today_active = db.query(Attendance).filter(
        Attendance.guard_id == target_guard.id,
        Attendance.shift_date == today,
        Attendance.actual_clock_in.isnot(None),
        Attendance.actual_clock_out.is_(None)
    ).first()
    if today_active:
        raise HTTPException(
            status_code=400,
            detail=f"Guard '{target_guard.full_name}' is already clocked in today at {today_active.actual_clock_in.strftime('%H:%M')}."
        )

    resolved_shift_id = target_guard.shift_id or 1
    resolved_site_id = target_guard.primary_site_id or (site.id if site else 1)

    mandate_note = f"Mandate Clock-In by Super Guard {super_guard.full_name if super_guard else current_user.email} (No smartphone)"

    att = db.query(Attendance).filter(
        Attendance.guard_id == target_guard.id,
        Attendance.shift_date == today
    ).first()

    if not att:
        att = Attendance(
            guard_id=target_guard.id,
            shift_id=resolved_shift_id,
            site_id=resolved_site_id,
            shift_date=today,
            actual_clock_in=now,
            actual_clock_out=None,
            status="PRESENT",
            regular_hours=12.0,
            overtime_hours=0.0,
            notes=mandate_note
        )
        db.add(att)
    else:
        att.actual_clock_in = now
        att.actual_clock_out = None
        att.status = "PRESENT"
        att.regular_hours = 12.0
        att.overtime_hours = 0.0
        att.notes = mandate_note

    audit = AuditLog(
        user_id=current_user.id,
        user_name=current_user.email,
        role=current_user.role,
        action="SUPER_GUARD_MANDATE_CLOCK_IN",
        target_entity="Attendance",
        target_id=str(target_guard.id),
        reason=f"Super Guard clocked in {target_guard.full_name} at site {site.site_name if site else ''}"
    )
    db.add(audit)
    db.commit()
    db.refresh(att)

    return {
        "message": f"Successfully clocked in {target_guard.full_name} under Super Guard mandate.",
        "guard_id": target_guard.id,
        "guard_name": target_guard.full_name,
        "clock_in_time": now.strftime("%H:%M:%S"),
        "shift_date": str(today),
        "status": att.status
    }


@router.post("/super-guard/guards/{target_guard_id}/clock-out")
def super_guard_mandate_clock_out(
    target_guard_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Super Guard clocks out a stationed guard at their site who does not possess a smartphone.
    """
    super_guard, site = _resolve_super_guard(db, current_user)
    target_guard = db.query(Guard).filter(Guard.id == target_guard_id).first()
    if not target_guard:
        raise HTTPException(status_code=404, detail="Guard not found")

    if site and target_guard.primary_site_id != site.id and current_user.role not in [UserRole.ADMIN.value, UserRole.SUPERVISOR.value]:
        raise HTTPException(
            status_code=403,
            detail=f"Guard '{target_guard.full_name}' is stationed at another site. You only have mandate for {site.site_name}."
        )

    today = date.today()
    now = datetime.now()

    att = db.query(Attendance).filter(
        Attendance.guard_id == target_guard.id,
        Attendance.actual_clock_in.isnot(None),
        Attendance.actual_clock_out.is_(None)
    ).order_by(Attendance.shift_date.desc()).first()

    if not att:
        today_att = db.query(Attendance).filter(
            Attendance.guard_id == target_guard.id,
            Attendance.shift_date == today
        ).first()
        if today_att and today_att.actual_clock_out:
            raise HTTPException(status_code=400, detail=f"Guard '{target_guard.full_name}' is already clocked out.")
        raise HTTPException(status_code=400, detail=f"No active clock-in session found for guard '{target_guard.full_name}'.")

    att.actual_clock_out = now
    shift_duration = 12.0
    if att.shift_id:
        s_obj = db.query(Shift).filter(Shift.id == att.shift_id).first()
        if s_obj and s_obj.duration_hours:
            shift_duration = s_obj.duration_hours

    reg_hrs, ot_hrs = calculate_shift_hours(att.actual_clock_in, att.actual_clock_out, shift_duration)
    att.regular_hours = reg_hrs
    att.overtime_hours = ot_hrs
    att.notes = (att.notes or "") + f" | Mandate Clock-Out by Super Guard {super_guard.full_name if super_guard else current_user.email}"
    sync_overtime_claim(db, att)

    audit = AuditLog(
        user_id=current_user.id,
        user_name=current_user.email,
        role=current_user.role,
        action="SUPER_GUARD_MANDATE_CLOCK_OUT",
        target_entity="Attendance",
        target_id=str(target_guard.id),
        reason=f"Super Guard clocked out {target_guard.full_name} (Hours: {reg_hrs}h, OT: {ot_hrs}h)"
    )
    db.add(audit)
    db.commit()
    db.refresh(att)

    return {
        "message": f"Successfully clocked out {target_guard.full_name} under Super Guard mandate.",
        "guard_id": target_guard.id,
        "guard_name": target_guard.full_name,
        "clock_out_time": now.strftime("%H:%M:%S"),
        "regular_hours": att.regular_hours,
        "overtime_hours": att.overtime_hours,
        "status": att.status
    }
