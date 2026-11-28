from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from application.backend.app.services.pdf_service import generate_payslip_pdf
from application.backend.app.api.v1.payslips import build_payslip_dict

from application.backend.app.api.deps import get_db, require_guard
from application.backend.app.core.timezone import now_eat, today_eat
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.shift import Shift
from application.backend.app.models.attendance import Attendance
from application.backend.app.models.roster import RosterAssignment
from application.backend.app.models.leave import LeaveRequest
from application.backend.app.models.incident import Incident
from application.backend.app.models.user import User
from application.backend.app.models.audit import AuditLog
from application.backend.app.models.off_day import GuardOffDaySchedule
from application.backend.app.schemas.off_day import GuardOffDayScheduleResponse
from application.backend.app.schemas.guard_portal import (
    GuardDashboardResponse, GuardHomeResponse, GuardTodayShift, ShiftInfoResponse, ClockInStatusResponse,
    LeaveRequestCreate, GuardLeaveCreate, LeaveRequestResponse,
    IncidentReportCreate, GuardIncidentCreate, IncidentReportResponse,
    GuardPayslipResponse, ScheduledOffDayDetail
)

router = APIRouter(prefix="", tags=["Guard Mobile Portal"])


from application.backend.app.models.payroll import PayrollPeriod, PayrollRecord


@router.get("/guard-portal/home", response_model=GuardHomeResponse)
@router.get("/guard-portal/dashboard", response_model=GuardHomeResponse)
@router.get("/portal/home", response_model=GuardHomeResponse)
@router.get("/portal/dashboard", response_model=GuardHomeResponse)
def get_guard_portal_dashboard(
    db: Session = Depends(get_db),
    guard_user: User = Depends(require_guard)
):
    """Guard Mobile Portal Dashboard API matching Screen 19 & Screen 20."""
    guard = db.query(Guard).filter(Guard.id == guard_user.guard_id).first()
    if not guard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guard profile not found")

    today = today_eat()

    # Query scheduled off-days assigned by Field Supervisor for current month
    month_schedules = db.query(GuardOffDaySchedule).filter(
        GuardOffDaySchedule.guard_id == guard.id,
        GuardOffDaySchedule.year == today.year,
        GuardOffDaySchedule.month == today.month
    ).order_by(GuardOffDaySchedule.off_date.asc()).all()

    scheduled_dates = [s.off_date for s in month_schedules]
    is_today_off = (today in scheduled_dates)

    off_days_sup_name = None
    off_days_notes = None
    if month_schedules:
        first_s = month_schedules[0]
        off_days_notes = first_s.notes
        if first_s.supervisor_id:
            sup_user = db.query(User).filter(User.id == first_s.supervisor_id).first()
            if sup_user:
                off_days_sup_name = sup_user.full_name or sup_user.email

    off_days_details = []
    for s in month_schedules:
        s_date = s.off_date
        if s_date == today:
            d_status = "TODAY"
        elif s_date < today:
            d_status = "COMPLETED"
        else:
            d_status = "UPCOMING"
        off_days_details.append(ScheduledOffDayDetail(
            off_date=s_date,
            formatted_date=s_date.strftime("%a, %d %b %Y"),
            status=d_status,
            notes=s.notes
        ))

    today_asgn = db.query(RosterAssignment).filter(
        RosterAssignment.guard_id == guard.id,
        RosterAssignment.shift_date == today
    ).first()

    today_att = db.query(Attendance).filter(
        Attendance.guard_id == guard.id,
        Attendance.shift_date == today
    ).first()

    clocked_in = bool(today_att and today_att.actual_clock_in and not today_att.actual_clock_out)

    if is_today_off and not clocked_in:
        # Today is a designated mandatory scheduled off-day set by supervisor
        today_shift = GuardTodayShift(
            site_name="Supervisor Scheduled Off Day",
            shift_name="Mandatory Day Off (Rest Day)",
            shift_id=None,
            start_time="--:--",
            end_time="--:--",
            supervisor_name=off_days_sup_name or "Supervisor",
            is_clocked_in=False,
            is_scheduled=False,
            attendance_id=today_att.id if today_att else None,
            site_id=None,
            site_latitude=None,
            site_longitude=None,
            geofence_radius=200.0
        )
    elif today_asgn and today_asgn.site_id and today_asgn.shift_id:
        site = db.query(Site).filter(Site.id == today_asgn.site_id).first()
        shift = db.query(Shift).filter(Shift.id == today_asgn.shift_id).first()
        today_shift = GuardTodayShift(
            site_name=site.site_name if site else f"Site #{today_asgn.site_id}",
            shift_name=shift.name if shift else f"Shift #{today_asgn.shift_id}",
            shift_id=shift.id if shift else today_asgn.shift_id,
            start_time=shift.start_time if shift else "06:00 AM",
            end_time=shift.end_time if shift else "06:00 PM",
            is_clocked_in=clocked_in,
            is_scheduled=True,
            attendance_id=today_att.id if today_att else None,
            site_id=site.id if site else None,
            site_latitude=site.latitude if site else None,
            site_longitude=site.longitude if site else None,
            geofence_radius=site.geofence_radius if site else 200.0
        )
    elif today_asgn and today_asgn.is_override and today_asgn.site_id is None:
        today_shift = GuardTodayShift(
            site_name="No shift scheduled today",
            shift_name="Day Off",
            shift_id=None,
            start_time="--:--",
            end_time="--:--",
            is_clocked_in=clocked_in,
            is_scheduled=False,
            attendance_id=today_att.id if today_att else None
        )
    else:
        if guard.primary_site_id and guard.shift_id:
            site = db.query(Site).filter(Site.id == guard.primary_site_id).first()
            shift = db.query(Shift).filter(Shift.id == guard.shift_id).first()
            if site and shift:
                today_shift = GuardTodayShift(
                    site_name=site.site_name,
                    shift_name=shift.name,
                    shift_id=shift.id,
                    start_time=shift.start_time,
                    end_time=shift.end_time,
                    is_clocked_in=clocked_in,
                    is_scheduled=True,
                    attendance_id=today_att.id if today_att else None,
                    site_id=site.id,
                    site_latitude=site.latitude,
                    site_longitude=site.longitude,
                    geofence_radius=site.geofence_radius
                )
            else:
                today_shift = GuardTodayShift(
                    site_name=site.site_name if site else "Unassigned Site",
                    shift_name="No Shift Assigned",
                    shift_id=None,
                    start_time="--:--",
                    end_time="--:--",
                    is_clocked_in=clocked_in,
                    is_scheduled=False,
                    attendance_id=today_att.id if today_att else None,
                    site_id=site.id if site else None,
                    site_latitude=site.latitude if site else None,
                    site_longitude=site.longitude if site else None,
                    geofence_radius=site.geofence_radius if site else 200.0
                )
        else:
            today_shift = GuardTodayShift(
                site_name="No shift scheduled today",
                shift_name="Day Off",
                shift_id=None,
                start_time="--:--",
                end_time="--:--",
                is_clocked_in=clocked_in,
                is_scheduled=False,
                attendance_id=today_att.id if today_att else None
            )

    # Fetch real latest CONFIRMED payroll record and period for the guard
    latest_rec = db.query(PayrollRecord).join(PayrollPeriod).filter(
        PayrollRecord.guard_id == guard.id,
        PayrollPeriod.status.in_(["CONFIRMED", "CLOSED"])
    ).order_by(PayrollRecord.id.desc()).first()

    latest_period_name = None
    latest_net_pay = None
    latest_rec_id = None

    if latest_rec:
        period = db.query(PayrollPeriod).filter(PayrollPeriod.id == latest_rec.payroll_period_id).first()
        if period:
            latest_period_name = period.period_name
        latest_net_pay = latest_rec.net_pay
        latest_rec_id = latest_rec.id

    is_sg = bool(getattr(guard, "is_super_guard", False))
    sg_site = db.query(Site).filter(Site.super_guard_id == guard.id).first()
    if sg_site:
        is_sg = True
    elif is_sg and guard.primary_site_id:
        sg_site = db.query(Site).filter(Site.id == guard.primary_site_id).first()

    return GuardHomeResponse(
        guard_id=guard.id,
        employee_number=guard.employee_number,
        full_name=guard.full_name,
        today_shift=today_shift,
        latest_pay_period=latest_period_name,
        latest_net_pay=latest_net_pay,
        latest_payroll_record_id=latest_rec_id,
        recent_notifications_count=0,
        is_super_guard=is_sg,
        super_guard_site_id=sg_site.id if sg_site else None,
        super_guard_site_name=sg_site.site_name if sg_site else None,
        scheduled_off_days=scheduled_dates,
        scheduled_off_days_details=off_days_details,
        off_days_count=len(scheduled_dates),
        off_days_month_name=today.strftime("%B %Y"),
        off_days_supervisor_name=off_days_sup_name,
        off_days_notes=off_days_notes,
        is_today_off=is_today_off
    )


@router.get("/guard-portal/off-days", response_model=GuardOffDayScheduleResponse)
@router.get("/portal/off-days", response_model=GuardOffDayScheduleResponse)
def get_guard_portal_off_days(
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    guard_user: User = Depends(require_guard)
):
    """Fetch scheduled off-days for the authenticated guard."""
    guard = db.query(Guard).filter(Guard.id == guard_user.guard_id).first()
    if not guard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guard profile not found")

    now_local = now_eat()
    target_year = year or now_local.year
    target_month = month or now_local.month

    schedules = db.query(GuardOffDaySchedule).filter(
        GuardOffDaySchedule.guard_id == guard.id,
        GuardOffDaySchedule.year == target_year,
        GuardOffDaySchedule.month == target_month
    ).order_by(GuardOffDaySchedule.off_date.asc()).all()

    off_dates = [s.off_date for s in schedules]
    latest = schedules[0] if schedules else None
    notes = latest.notes if latest else None
    created_at = latest.created_at if latest else None
    updated_at = latest.updated_at if latest else None
    sup_id = latest.supervisor_id if latest else None

    sup_user = db.query(User).filter(User.id == sup_id).first() if sup_id else None
    sup_name = (sup_user.full_name or sup_user.email) if sup_user else None

    return GuardOffDayScheduleResponse(
        guard_id=guard.id,
        guard_name=guard.full_name,
        employee_number=guard.employee_number,
        year=target_year,
        month=target_month,
        off_dates=off_dates,
        total_off_days=len(off_dates),
        supervisor_id=sup_id or 0,
        supervisor_name=sup_name,
        notes=notes,
        created_at=created_at,
        updated_at=updated_at
    )


@router.post("/guard-portal/leave", response_model=LeaveRequestResponse, status_code=status.HTTP_200_OK)
@router.post("/guard-portal/leave-request", response_model=LeaveRequestResponse, status_code=status.HTTP_200_OK)
@router.post("/portal/leave", response_model=LeaveRequestResponse, status_code=status.HTTP_200_OK)
@router.post("/portal/leave-request", response_model=LeaveRequestResponse, status_code=status.HTTP_200_OK)
def submit_leave_request(
    payload: GuardLeaveCreate,
    db: Session = Depends(get_db),
    guard_user: User = Depends(require_guard)
):
    """Submit Leave Request from Guard Mobile Portal."""
    duration = (payload.end_date - payload.start_date).days + 1
    if duration <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="End date must be after start date.")

    req = LeaveRequest(
        guard_id=guard_user.guard_id,
        leave_type=payload.leave_type,
        start_date=payload.start_date,
        end_date=payload.end_date,
        duration_days=duration,
        reason=payload.reason,
        status="PENDING"
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


@router.get("/guard-portal/leave", response_model=List[LeaveRequestResponse])
@router.get("/guard-portal/leave-requests", response_model=List[LeaveRequestResponse])
@router.get("/portal/leave", response_model=List[LeaveRequestResponse])
@router.get("/portal/leave-requests", response_model=List[LeaveRequestResponse])
def get_my_leave_requests(
    db: Session = Depends(get_db),
    guard_user: User = Depends(require_guard)
):
    """View Guard's Leave History."""
    return db.query(LeaveRequest).filter(LeaveRequest.guard_id == guard_user.guard_id).order_by(LeaveRequest.id.desc()).all()


@router.post("/guard-portal/incidents", response_model=IncidentReportResponse, status_code=status.HTTP_200_OK)
@router.post("/guard-portal/report-incident", response_model=IncidentReportResponse, status_code=status.HTTP_200_OK)
@router.post("/portal/incidents", response_model=IncidentReportResponse, status_code=status.HTTP_200_OK)
@router.post("/portal/report-incident", response_model=IncidentReportResponse, status_code=status.HTTP_200_OK)
def report_site_incident(
    payload: GuardIncidentCreate,
    db: Session = Depends(get_db),
    guard_user: User = Depends(require_guard)
):
    """Submit Site Incident Report from Guard Mobile Portal (ref format INC-XXXX)."""
    if not payload.description or len(payload.description.strip()) < 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incident description must be at least 5 characters long."
        )

    guard = db.query(Guard).filter(Guard.id == guard_user.guard_id).first()
    site_id = getattr(payload, 'site_id', None) or (guard.primary_site_id if guard and guard.primary_site_id else 1)

    now = now_eat()
    count_inc = db.query(Incident).count() + 1
    ref_num = f"INC-{now.year}-{count_inc:04d}"
    while db.query(Incident).filter(Incident.reference_number == ref_num).first():
        count_inc += 1
        ref_num = f"INC-{now.year}-{count_inc:04d}"

    inc_date = getattr(payload, 'incident_date', None) or now.date()
    inc_time = getattr(payload, 'incident_time', None) or now.strftime("%H:%M")

    inc = Incident(
        reference_number=ref_num,
        guard_id=guard_user.guard_id,
        site_id=site_id,
        incident_type=payload.incident_type,
        incident_date=inc_date,
        incident_time=inc_time,
        description=payload.description.strip(),
        status="OPEN"
    )
    db.add(inc)

    audit_entry = AuditLog(
        user_id=guard_user.id,
        user_name=guard_user.email,
        role=guard_user.role,
        action="REPORT_INCIDENT",
        target_entity="Incident",
        target_id=ref_num,
        reason=f"Incident reported: {payload.incident_type}"
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(inc)
    return inc


@router.get("/guard-portal/incidents", response_model=List[IncidentReportResponse])
@router.get("/guard-portal/my-incidents", response_model=List[IncidentReportResponse])
@router.get("/portal/incidents", response_model=List[IncidentReportResponse])
def get_my_incidents(
    db: Session = Depends(get_db),
    guard_user: User = Depends(require_guard)
):
    """View Guard's Reported Incident History."""
    return db.query(Incident).filter(
        Incident.guard_id == guard_user.guard_id
    ).order_by(Incident.id.desc()).all()


@router.get("/guard-portal/payslips", response_model=List[GuardPayslipResponse])
@router.get("/portal/payslips", response_model=List[GuardPayslipResponse])
def get_my_payslips(
    db: Session = Depends(get_db),
    guard_user: User = Depends(require_guard)
):
    """Fetch all confirmed payslips for the authenticated guard across all periods, most recent first."""
    records = db.query(PayrollRecord).join(PayrollPeriod).filter(
        PayrollRecord.guard_id == guard_user.guard_id,
        PayrollPeriod.status.in_(["CONFIRMED", "CLOSED"])
    ).order_by(PayrollRecord.id.desc()).all()

    results = []
    for rec in records:
        period = db.query(PayrollPeriod).filter(PayrollPeriod.id == rec.payroll_period_id).first()
        if not period:
            continue

        payslip_num = f"PAY-{period.year}{period.month:02d}-{rec.guard_id:04d}"

        results.append(GuardPayslipResponse(
            id=rec.id,
            payroll_record_id=rec.id,
            payslip_number=payslip_num,
            period_name=period.period_name,
            period_id=period.id,
            year=period.year,
            month=period.month,
            gross_pay=rec.gross_pay,
            net_pay=rec.net_pay,
            basic_pay=rec.basic_pay,
            total_deductions=rec.total_deductions,
            days_worked=rec.days_worked,
            status=period.status,
            created_at=rec.created_at or period.created_at
        ))

    return results


@router.get("/guard-portal/payslips/{payroll_record_id}/pdf")
@router.get("/portal/payslips/{payroll_record_id}/pdf")
def download_guard_payslip_pdf(
    payroll_record_id: int,
    db: Session = Depends(get_db),
    guard_user: User = Depends(require_guard)
):
    """Download specific payslip PDF for guard, validating data isolation."""
    rec = db.query(PayrollRecord).join(PayrollPeriod).filter(
        PayrollRecord.id == payroll_record_id,
        PayrollPeriod.status.in_(["CONFIRMED", "CLOSED"])
    ).first()
    if not rec:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payslip record not found or period not confirmed."
        )

    # Data Isolation Check: Must belong to requesting guard
    if rec.guard_id != guard_user.guard_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unauthorized: You can only access your own payslips."
        )

    guard = db.query(Guard).filter(Guard.id == rec.guard_id).first()
    site = db.query(Site).filter(Site.id == (rec.site_id or (guard.primary_site_id if guard else 1))).first()
    period = db.query(PayrollPeriod).filter(PayrollPeriod.id == rec.payroll_period_id).first()

    data = build_payslip_dict(rec, guard, site, period)
    pdf_bytes = generate_payslip_pdf(data)
    filename = f"Payslip_{guard.employee_number if guard else 'CS'}_{period.period_name.replace(' ', '_')}.pdf"

    audit_entry = AuditLog(
        user_id=guard_user.id,
        user_name=guard_user.email,
        role=guard_user.role,
        action="GENERATE_PAYSLIP_PDF",
        target_entity="Payslip",
        target_id=data["payslip_number"],
        reason="Downloaded PDF payslip via Guard Portal"
    )
    db.add(audit_entry)
    db.commit()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

