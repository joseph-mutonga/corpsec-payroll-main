"""
Supervisor Portal API — allows supervisors (and admins) to:
1. View their assigned guards & client sites
2. Mark guards present / absent / late for a given date
3. Clock in / out assigned guards
4. Admin: create supervisor accounts, assign sites and guards to supervisors
"""
from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, EmailStr
from sqlalchemy import or_
from sqlalchemy.orm import Session
import secrets

from application.backend.app.api.deps import get_db, require_admin, require_admin_or_supervisor, require_admin_or_hr
from application.backend.app.core.security import get_password_hash
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.attendance import Attendance
from application.backend.app.models.shift import Shift
from application.backend.app.models.audit import AuditLog

router = APIRouter(prefix="/supervisors", tags=["Supervisor Management"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class SupervisorCreate(BaseModel):
    full_name: str
    email: EmailStr
    phone: str
    password: Optional[str] = None  # auto-generated if not given


class SupervisorResponse(BaseModel):
    id: int
    full_name: Optional[str] = None
    email: str
    phone: str
    role: str
    status: str
    assigned_guard_count: int = 0
    assigned_site_count: int = 0
    assigned_site_names: List[str] = []
    temporary_password: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AssignGuardsRequest(BaseModel):
    guard_ids: List[int]


class AssignSitesRequest(BaseModel):
    site_ids: List[int]


class GuardAttendanceMark(BaseModel):
    guard_id: int
    shift_date: date
    attendance_status: str  # PRESENT, ABSENT, LATE
    shift_id: Optional[int] = None
    notes: Optional[str] = None


class BulkAttendanceMarkRequest(BaseModel):
    records: List[GuardAttendanceMark]


class AttendanceMarkResponse(BaseModel):
    guard_id: int
    guard_name: str
    shift_date: date
    attendance_status: str
    attendance_id: int

    model_config = ConfigDict(from_attributes=True)


class SupervisorGuardResponse(BaseModel):
    id: int
    employee_number: str
    full_name: str
    phone: str
    site_id: Optional[int] = None
    site_name: Optional[str] = None
    shift_id: Optional[int] = None
    shift_name: Optional[str] = None
    status: str
    supervisor_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class SupervisorAttendanceStatusResponse(BaseModel):
    guard_id: int
    employee_number: str
    full_name: str
    phone: str
    site_id: Optional[int] = None
    site_name: Optional[str] = None
    shift_id: Optional[int] = None
    shift_name: Optional[str] = None
    supervisor_id: Optional[int] = None
    attendance_id: Optional[int] = None
    attendance_status: str = "NOT_MARKED"  # PRESENT, ABSENT, LATE, NOT_MARKED
    actual_clock_in: Optional[datetime] = None
    actual_clock_out: Optional[datetime] = None
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ── Admin: List all supervisors ───────────────────────────────────────────────

@router.get("", response_model=List[SupervisorResponse])
def list_supervisors(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """List all supervisor user accounts with assigned sites and guards."""
    supervisors = db.query(User).filter(User.role == UserRole.SUPERVISOR.value).all()
    results = []
    for sup in supervisors:
        sup_sites = db.query(Site).filter(Site.supervisor_id == sup.id).all()
        site_names = [s.site_name for s in sup_sites]
        site_ids = [s.id for s in sup_sites]

        guards_filter = [Guard.supervisor_id == sup.id]
        if site_ids:
            guards_filter.append(Guard.primary_site_id.in_(site_ids))

        guard_count = db.query(Guard).filter(
            Guard.status == "ACTIVE",
            or_(*guards_filter)
        ).count()

        results.append(SupervisorResponse(
            id=sup.id,
            full_name=sup.full_name or (sup.email.split('@')[0].replace('.', ' ').title()),
            email=sup.email,
            phone=sup.phone,
            role=sup.role,
            status=sup.status,
            assigned_guard_count=guard_count,
            assigned_site_count=len(sup_sites),
            assigned_site_names=site_names
        ))
    return results


# ── Admin: Create a supervisor account ───────────────────────────────────────

@router.post("", response_model=SupervisorResponse, status_code=status.HTTP_201_CREATED)
def create_supervisor(
    payload: SupervisorCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """Create a new supervisor user account."""
    existing_email = db.query(User).filter(User.email == payload.email).first()
    if existing_email:
        raise HTTPException(status_code=400, detail=f"Email '{payload.email}' already in use.")

    existing_phone = db.query(User).filter(User.phone == payload.phone).first()
    if existing_phone:
        raise HTTPException(status_code=400, detail=f"Phone '{payload.phone}' already in use.")

    if payload.password and payload.password.strip():
        auto_pw = payload.password.strip()
    else:
        auto_pw = "password123"
    generated_password = auto_pw

    sup = User(
        full_name=payload.full_name.strip() if payload.full_name else payload.email.split('@')[0],
        email=payload.email.strip().lower(),
        phone=payload.phone.strip(),
        password_hash=get_password_hash(auto_pw),
        role=UserRole.SUPERVISOR.value,
        status=UserStatus.ACTIVE.value,
        guard_id=None,
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(sup)

    audit = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="CREATE_SUPERVISOR",
        target_entity="User",
        target_id=payload.email,
        reason=f"Created supervisor account for {payload.full_name} ({payload.email})"
    )
    db.add(audit)
    db.commit()
    db.refresh(sup)

    return SupervisorResponse(
        id=sup.id,
        full_name=sup.full_name,
        email=sup.email,
        phone=sup.phone,
        role=sup.role,
        status=sup.status,
        assigned_guard_count=0,
        assigned_site_count=0,
        assigned_site_names=[],
        temporary_password=generated_password,
    )


# ── Admin: Assign sites to a supervisor ─────────────────────────────────────

@router.post("/{supervisor_id}/assign-sites", status_code=status.HTTP_200_OK)
def assign_sites_to_supervisor(
    supervisor_id: int,
    payload: AssignSitesRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """
    Assign a list of site IDs to a supervisor.
    Guards deployed at those sites will automatically fall under this supervisor's command.
    """
    sup = db.query(User).filter(
        User.id == supervisor_id,
        User.role == UserRole.SUPERVISOR.value
    ).first()
    if not sup:
        raise HTTPException(status_code=404, detail="Supervisor not found.")

    new_site_ids = set(payload.site_ids)
    previously_assigned_sites = db.query(Site).filter(Site.supervisor_id == supervisor_id).all()

    # 1. Unassign sites not in new list
    for s in previously_assigned_sites:
        if s.id not in new_site_ids:
            s.supervisor_id = None
            db.query(Guard).filter(
                Guard.primary_site_id == s.id,
                Guard.supervisor_id == supervisor_id
            ).update({Guard.supervisor_id: None}, synchronize_session=False)

    # 2. Assign selected sites and update active guards
    assigned_names = []
    total_guards_synced = 0
    for sid in payload.site_ids:
        site = db.query(Site).filter(Site.id == sid).first()
        if site:
            site.supervisor_id = supervisor_id
            assigned_names.append(site.site_name)
            g_count = db.query(Guard).filter(
                Guard.primary_site_id == sid,
                Guard.status == "ACTIVE"
            ).update({Guard.supervisor_id: supervisor_id}, synchronize_session=False)
            total_guards_synced += g_count

    audit = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="ASSIGN_SITES_TO_SUPERVISOR",
        target_entity="Supervisor",
        target_id=str(supervisor_id),
        reason=f"Assigned {len(assigned_names)} site(s) to supervisor {sup.email}: {', '.join(assigned_names)}"
    )
    db.add(audit)
    db.commit()

    return {
        "assigned_sites": len(assigned_names),
        "site_names": assigned_names,
        "guards_assigned": total_guards_synced,
        "supervisor_id": supervisor_id
    }


# ── Admin: List sites assigned to a supervisor ───────────────────────────────

@router.get("/{supervisor_id}/sites")
def get_supervisor_sites(
    supervisor_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """List sites currently assigned to a supervisor."""
    sites = db.query(Site).filter(Site.supervisor_id == supervisor_id).all()
    return [
        {
            "id": s.id,
            "site_name": s.site_name,
            "location": s.location,
            "client_name": s.client_name,
            "guard_count": s.guard_count
        }
        for s in sites
    ]


# ── Admin: Assign guards to a supervisor ─────────────────────────────────────

@router.post("/{supervisor_id}/assign-guards", status_code=status.HTTP_200_OK)
def assign_guards_to_supervisor(
    supervisor_id: int,
    payload: AssignGuardsRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """
    Assign a list of guard IDs to a supervisor.
    Guards not in the list but previously assigned to this supervisor will be unassigned.
    """
    sup = db.query(User).filter(
        User.id == supervisor_id,
        User.role == UserRole.SUPERVISOR.value
    ).first()
    if not sup:
        raise HTTPException(status_code=404, detail="Supervisor not found.")

    previously_assigned = db.query(Guard).filter(Guard.supervisor_id == supervisor_id).all()
    new_ids_set = set(payload.guard_ids)
    for g in previously_assigned:
        if g.id not in new_ids_set:
            g.supervisor_id = None

    updated_names = []
    for gid in payload.guard_ids:
        guard = db.query(Guard).filter(Guard.id == gid).first()
        if guard:
            guard.supervisor_id = supervisor_id
            updated_names.append(guard.full_name)

    audit = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="ASSIGN_GUARDS_TO_SUPERVISOR",
        target_entity="Supervisor",
        target_id=str(supervisor_id),
        reason=f"Assigned {len(updated_names)} guard(s) to supervisor {sup.email}: {', '.join(updated_names)}"
    )
    db.add(audit)
    db.commit()

    return {"assigned": len(updated_names), "supervisor_id": supervisor_id, "guard_names": updated_names}


# ── Supervisor: View my assigned guards (MUST be before /{supervisor_id}/guards) ──

@router.get("/my-guards", response_model=List[SupervisorGuardResponse])
def get_my_assigned_guards(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_supervisor)
):
    """Supervisor view: list all guards assigned to the logged-in supervisor (directly or through assigned sites)."""
    sup_site_ids = [s.id for s in db.query(Site.id).filter(Site.supervisor_id == current_user.id).all()]
    filters = [Guard.supervisor_id == current_user.id]
    if sup_site_ids:
        filters.append(Guard.primary_site_id.in_(sup_site_ids))

    guards = db.query(Guard).filter(Guard.status == "ACTIVE", or_(*filters)).all()
    result = []
    seen = set()
    for g in guards:
        if g.id in seen:
            continue
        seen.add(g.id)
        result.append(SupervisorGuardResponse(
            id=g.id,
            employee_number=g.employee_number,
            full_name=g.full_name,
            phone=g.phone,
            site_id=g.primary_site_id,
            site_name=g.site.site_name if g.site else None,
            shift_id=g.shift_id,
            shift_name=g.shift.name if g.shift else None,
            status=g.status,
            supervisor_id=g.supervisor_id or current_user.id
        ))
    return result


# ── Admin: List guards assigned to a supervisor ───────────────────────────────

@router.get("/{supervisor_id}/guards", response_model=List[SupervisorGuardResponse])
def list_supervisor_guards(
    supervisor_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """List all guards assigned to a specific supervisor (directly or via assigned sites)."""
    sup = db.query(User).filter(
        User.id == supervisor_id,
        User.role == UserRole.SUPERVISOR.value
    ).first()
    if not sup:
        raise HTTPException(status_code=404, detail="Supervisor not found.")

    sup_site_ids = [s.id for s in db.query(Site.id).filter(Site.supervisor_id == supervisor_id).all()]
    filters = [Guard.supervisor_id == supervisor_id]
    if sup_site_ids:
        filters.append(Guard.primary_site_id.in_(sup_site_ids))

    guards = db.query(Guard).filter(or_(*filters)).all()
    result = []
    seen = set()
    for g in guards:
        if g.id in seen:
            continue
        seen.add(g.id)
        result.append(SupervisorGuardResponse(
            id=g.id,
            employee_number=g.employee_number,
            full_name=g.full_name,
            phone=g.phone,
            site_id=g.primary_site_id,
            site_name=g.site.site_name if g.site else None,
            shift_id=g.shift_id,
            shift_name=g.shift.name if g.shift else None,
            status=g.status,
            supervisor_id=g.supervisor_id or supervisor_id
        ))
    return result


# ── Supervisor & Admin: Query Guards Attendance by Date ─────────────────────

@router.get("/attendance", response_model=List[SupervisorAttendanceStatusResponse])
def get_supervisor_guards_attendance(
    shift_date: Optional[date] = Query(None),
    supervisor_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_supervisor)
):
    """
    Fetch attendance statuses for guards on a specific date.
    - If user is SUPERVISOR: returns guards assigned to this supervisor directly or via assigned sites.
    - If user is ADMIN: returns all guards, or guards filtered by supervisor_id if specified.
    """
    target_date = shift_date or date.today()
    query = db.query(Guard).filter(Guard.status == "ACTIVE")

    target_sup_id = current_user.id if current_user.role == UserRole.SUPERVISOR.value else supervisor_id
    if target_sup_id:
        sup_site_ids = [s.id for s in db.query(Site.id).filter(Site.supervisor_id == target_sup_id).all()]
        filters = [Guard.supervisor_id == target_sup_id]
        if sup_site_ids:
            filters.append(Guard.primary_site_id.in_(sup_site_ids))
        query = query.filter(or_(*filters))

    guards = query.order_by(Guard.id.asc()).all()
    results = []
    seen = set()
    for g in guards:
        if g.id in seen:
            continue
        seen.add(g.id)

        att = db.query(Attendance).filter(
            Attendance.guard_id == g.id,
            Attendance.shift_date == target_date
        ).first()

        site_name = g.site.site_name if g.site else "Unassigned Site"
        shift_name = g.shift.name if g.shift else "Day Shift"

        results.append(SupervisorAttendanceStatusResponse(
            guard_id=g.id,
            employee_number=g.employee_number,
            full_name=g.full_name,
            phone=g.phone,
            site_id=g.primary_site_id,
            site_name=site_name,
            shift_id=g.shift_id,
            shift_name=shift_name,
            supervisor_id=g.supervisor_id or target_sup_id,
            attendance_id=att.id if att else None,
            attendance_status=att.status if att else "NOT_MARKED",
            actual_clock_in=att.actual_clock_in if att else None,
            actual_clock_out=att.actual_clock_out if att else None,
            notes=att.notes if att else None
        ))
    return results


# ── Supervisor: Mark attendance for assigned guards ───────────────────────────

@router.post("/mark-attendance", response_model=List[AttendanceMarkResponse])
def supervisor_mark_attendance(
    payload: BulkAttendanceMarkRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_supervisor)
):
    """
    Supervisor marks attendance (PRESENT/ABSENT/LATE) for one or more of their guards.
    Creates or updates Attendance records for the given shift_date.
    Admins can mark any guard; supervisors can only mark their assigned guards (directly or via sites).
    """
    valid_statuses = {"PRESENT", "ABSENT", "LATE"}
    results = []

    for record in payload.records:
        guard = db.query(Guard).filter(Guard.id == record.guard_id).first()
        if not guard:
            raise HTTPException(status_code=404, detail=f"Guard #{record.guard_id} not found.")

        if current_user.role == UserRole.SUPERVISOR.value:
            is_supervised = guard.supervisor_id == current_user.id or (guard.site and guard.site.supervisor_id == current_user.id)
            if not is_supervised:
                raise HTTPException(
                    status_code=403,
                    detail=f"Guard '{guard.full_name}' (#{record.guard_id}) is not assigned to your supervision or sites."
                )

        att_status = record.attendance_status.upper().strip()
        if att_status not in valid_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status '{record.attendance_status}'. Must be PRESENT, ABSENT, or LATE."
            )

        resolved_shift_id = record.shift_id or guard.shift_id
        shift_duration = 12.0
        if resolved_shift_id:
            s_obj = db.query(Shift).filter(Shift.id == resolved_shift_id).first()
            if s_obj and s_obj.duration_hours:
                shift_duration = s_obj.duration_hours
        else:
            first_shift = db.query(Shift).first()
            resolved_shift_id = first_shift.id if first_shift else 1
            if first_shift and first_shift.duration_hours:
                shift_duration = first_shift.duration_hours

        resolved_site_id = guard.primary_site_id or 1
        now = datetime.now()

        att = db.query(Attendance).filter(
            Attendance.guard_id == guard.id,
            Attendance.shift_date == record.shift_date
        ).first()

        if att:
            att.status = att_status
            att.notes = record.notes or f"Marked {att_status} by supervisor {current_user.email}"
            if att_status == "PRESENT":
                if not att.actual_clock_in:
                    att.actual_clock_in = now
                if att.regular_hours == 0.0:
                    att.regular_hours = shift_duration
            elif att_status == "ABSENT":
                att.regular_hours = 0.0
                att.overtime_hours = 0.0
        else:
            att = Attendance(
                guard_id=guard.id,
                shift_id=resolved_shift_id,
                site_id=resolved_site_id,
                shift_date=record.shift_date,
                actual_clock_in=now if att_status == "PRESENT" else None,
                status=att_status,
                regular_hours=shift_duration if att_status == "PRESENT" else 0.0,
                overtime_hours=0.0,
                notes=record.notes or f"Marked {att_status} by supervisor {current_user.email}"
            )
            db.add(att)

        db.flush()

        audit = AuditLog(
            user_id=current_user.id,
            user_name=current_user.email,
            role=current_user.role,
            action="SUPERVISOR_MARK_ATTENDANCE",
            target_entity="Attendance",
            target_id=str(guard.id),
            reason=f"Guard {guard.full_name} marked {att_status} on {record.shift_date} by {current_user.email}"
        )
        db.add(audit)

        results.append(AttendanceMarkResponse(
            guard_id=guard.id,
            guard_name=guard.full_name,
            shift_date=record.shift_date,
            attendance_status=att_status,
            attendance_id=att.id
        ))

    db.commit()
    return results


# ── Supervisor: Clock In / Clock Out for assigned guards ──────────────────────

@router.post("/guards/{guard_id}/clock-in")
def supervisor_guard_clock_in(
    guard_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_supervisor)
):
    """
    Supervisor clocks in a guard assigned to them (directly or via site).
    Admins can clock in any guard.
    """
    guard = db.query(Guard).filter(Guard.id == guard_id).first()
    if not guard:
        raise HTTPException(status_code=404, detail="Guard not found.")

    if current_user.role == UserRole.SUPERVISOR.value:
        is_supervised = guard.supervisor_id == current_user.id or (guard.site and guard.site.supervisor_id == current_user.id)
        if not is_supervised:
            raise HTTPException(
                status_code=403,
                detail=f"Guard '{guard.full_name}' is not assigned to your supervision or sites."
            )

    today = date.today()
    now = datetime.now()

    active_unclosed = db.query(Attendance).filter(
        Attendance.guard_id == guard.id,
        Attendance.actual_clock_in.isnot(None),
        Attendance.actual_clock_out.is_(None)
    ).first()
    if active_unclosed:
        raise HTTPException(
            status_code=400,
            detail=f"Guard '{guard.full_name}' already has an active clock-in at {active_unclosed.actual_clock_in.strftime('%H:%M')}."
        )

    resolved_shift_id = guard.shift_id or 1
    resolved_site_id = guard.primary_site_id or 1

    att = db.query(Attendance).filter(
        Attendance.guard_id == guard.id,
        Attendance.shift_date == today
    ).first()

    if not att:
        att = Attendance(
            guard_id=guard.id,
            shift_id=resolved_shift_id,
            site_id=resolved_site_id,
            shift_date=today,
            actual_clock_in=now,
            actual_clock_out=None,
            status="PRESENT",
            regular_hours=12.0,
            overtime_hours=0.0,
            notes=f"Clocked in by supervisor {current_user.email}"
        )
        db.add(att)
    else:
        att.actual_clock_in = now
        att.actual_clock_out = None
        att.status = "PRESENT"
        att.regular_hours = 12.0
        att.overtime_hours = 0.0
        att.notes = f"Clocked in by supervisor {current_user.email}"

    audit = AuditLog(
        user_id=current_user.id,
        user_name=current_user.email,
        role=current_user.role,
        action="SUPERVISOR_CLOCK_IN",
        target_entity="Attendance",
        target_id=str(guard.id),
        reason=f"Supervisor {current_user.email} clocked in {guard.full_name} at {now.strftime('%H:%M')}"
    )
    db.add(audit)
    db.commit()
    db.refresh(att)

    return {
        "message": f"Successfully clocked in {guard.full_name}",
        "guard_id": guard.id,
        "guard_name": guard.full_name,
        "clock_in_time": now.strftime("%H:%M:%S"),
        "shift_date": str(today),
        "status": att.status
    }


@router.post("/guards/{guard_id}/clock-out")
def supervisor_guard_clock_out(
    guard_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_supervisor)
):
    """
    Supervisor clocks out a guard assigned to them (directly or via site).
    Admins can clock out any guard.
    """
    guard = db.query(Guard).filter(Guard.id == guard_id).first()
    if not guard:
        raise HTTPException(status_code=404, detail="Guard not found.")

    if current_user.role == UserRole.SUPERVISOR.value:
        is_supervised = guard.supervisor_id == current_user.id or (guard.site and guard.site.supervisor_id == current_user.id)
        if not is_supervised:
            raise HTTPException(
                status_code=403,
                detail=f"Guard '{guard.full_name}' is not assigned to your supervision or sites."
            )

    today = date.today()
    now = datetime.now()

    att = db.query(Attendance).filter(
        Attendance.guard_id == guard.id,
        Attendance.actual_clock_in.isnot(None),
        Attendance.actual_clock_out.is_(None)
    ).order_by(Attendance.shift_date.desc()).first()

    if not att:
        today_att = db.query(Attendance).filter(
            Attendance.guard_id == guard.id,
            Attendance.shift_date == today
        ).first()
        if today_att and today_att.actual_clock_out:
            raise HTTPException(status_code=400, detail=f"Guard '{guard.full_name}' is already clocked out.")
        raise HTTPException(status_code=400, detail=f"No active clock-in session found for guard '{guard.full_name}'.")

    att.actual_clock_out = now
    shift_duration = 12.0
    if att.shift_id:
        s_obj = db.query(Shift).filter(Shift.id == att.shift_id).first()
        if s_obj and s_obj.duration_hours:
            shift_duration = s_obj.duration_hours

    from application.backend.app.services.attendance_service import calculate_shift_hours, sync_overtime_claim
    reg_hrs, ot_hrs = calculate_shift_hours(att.actual_clock_in, att.actual_clock_out, shift_duration)
    att.regular_hours = reg_hrs
    att.overtime_hours = ot_hrs
    sync_overtime_claim(db, att)

    audit = AuditLog(
        user_id=current_user.id,
        user_name=current_user.email,
        role=current_user.role,
        action="SUPERVISOR_CLOCK_OUT",
        target_entity="Attendance",
        target_id=str(guard.id),
        reason=f"Supervisor {current_user.email} clocked out {guard.full_name} at {now.strftime('%H:%M')}"
    )
    db.add(audit)
    db.commit()
    db.refresh(att)

    return {
        "message": f"Successfully clocked out {guard.full_name}",
        "guard_id": guard.id,
        "guard_name": guard.full_name,
        "clock_out_time": now.strftime("%H:%M:%S"),
        "regular_hours": att.regular_hours,
        "overtime_hours": att.overtime_hours,
        "status": att.status
    }
