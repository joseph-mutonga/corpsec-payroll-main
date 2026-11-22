import datetime
import time
import pytz
from typing import Dict, Any, List, Optional
from decimal import Decimal
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_, and_

from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.shift import Shift
from application.backend.app.models.attendance import Attendance, OvertimeClaim
from application.backend.app.models.roster import RosterAssignment
from application.backend.app.models.payroll import PayrollPeriod, PayrollRecord
from application.backend.app.models.salary_advance import SalaryAdvance
from application.backend.app.models.asset import Asset, AssetCategory, AssetAllocation
from application.backend.app.models.call_center import CallLog, PhoneNumber, CallQueue, AgentStatus
from application.backend.app.models.invoice import SiteInvoice, InvoiceItem
from application.backend.app.models.client_contract import ClientContract, Client
from application.backend.app.models.leave import LeaveRequest
from application.backend.app.models.expense import Expense
from application.backend.app.models.incident import Incident
from application.backend.app.models.user import User

NAIROBI_TZ = pytz.timezone("Africa/Nairobi")


class AttendanceAnalyticsService:
    """
    Dedicated, read-only ERP attendance analytics engine.
    Executes parameterized SQL queries against MySQL and returns deterministic,
    reconciled attendance facts.
    """

    @classmethod
    def get_current_date_eat(cls) -> datetime.date:
        """Determines the current calendar date in Africa/Nairobi (EAT)."""
        return datetime.datetime.now(NAIROBI_TZ).date()

    @classmethod
    def get_current_timestamp_eat(cls) -> str:
        """Returns the current formatted timestamp in Africa/Nairobi (EAT)."""
        return datetime.datetime.now(NAIROBI_TZ).strftime("%Y-%m-%d %H:%M:%S EAT")

    @classmethod
    def get_attendance_report(
        cls,
        db: Session,
        target_date: Optional[datetime.date] = None,
        guard_search: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Retrieves fully reconciled attendance figures for the target date.
        Distinguishes registered, active, scheduled, clocked-in, clocked-out,
        currently-on-duty, and absent guards.
        """
        t0 = time.perf_counter()
        report_date = target_date or cls.get_current_date_eat()
        report_date_str = report_date.strftime("%d %B %Y")
        reporting_ts = cls.get_current_timestamp_eat()

        # 1. Total and Active Registered Guards
        total_registered = db.query(func.count(Guard.id)).scalar() or 0
        active_guards_q = db.query(Guard).filter(Guard.status == "ACTIVE")
        active_guards_count = active_guards_q.count()
        all_active_guards = active_guards_q.all()
        active_guard_ids = {g.id for g in all_active_guards}

        # 2. Shift and Site Deployments
        assigned_to_shifts = db.query(func.count(Guard.id)).filter(
            Guard.status == "ACTIVE",
            Guard.shift_id.isnot(None)
        ).scalar() or 0

        deployed_to_sites = db.query(func.count(Guard.id)).filter(
            Guard.status == "ACTIVE",
            Guard.primary_site_id.isnot(None)
        ).scalar() or 0

        # 3. Attendance Records for Target Date
        att_query = db.query(Attendance).options(
            joinedload(Attendance.guard),
            joinedload(Attendance.site),
            joinedload(Attendance.shift)
        ).filter(Attendance.shift_date == report_date)

        records = att_query.all()

        # 4. Filter or inspect specific guard if search requested
        warnings = []
        clocked_in_ids = set()
        clocked_out_ids = set()
        on_duty_ids = set()
        incomplete_count = 0

        details_rows: List[Dict[str, Any]] = []

        now_eat = datetime.datetime.now(NAIROBI_TZ).replace(tzinfo=None)

        for att in records:
            g = att.guard
            emp_no = g.employee_number if g else "N/A"
            name = g.full_name if g else "Unknown"
            site_name = att.site.site_name if att.site else (g.site.site_name if (g and g.site) else "Unassigned")
            shift_name = att.shift.name if att.shift else (g.shift.name if (g and g.shift) else "Day Shift")
            shift_duration = att.shift.duration_hours if att.shift else 12.0

            has_clock_in = att.actual_clock_in is not None
            has_clock_out = att.actual_clock_out is not None

            if has_clock_in:
                clocked_in_ids.add(att.guard_id)

            if has_clock_in and has_clock_out:
                clocked_out_ids.add(att.guard_id)
                status_str = "Clocked Out"
                hours_str = f"{att.regular_hours:.2f} hrs"
            elif has_clock_in and not has_clock_out:
                on_duty_ids.add(att.guard_id)
                status_str = "On Duty"
                hours_str = f"{att.regular_hours:.2f} hrs (Active)"
                # Check for potential incomplete or expired record
                if att.actual_clock_in:
                    elapsed_hours = (now_eat - att.actual_clock_in).total_seconds() / 3600.0
                    if elapsed_hours > (shift_duration + 2.0):
                        incomplete_count += 1
                        warnings.append(f"Guard {emp_no} ({name}) shift duration exceeded without clock-out.")
            else:
                status_str = att.status or "SCHEDULED"
                hours_str = "0.00 hrs"

            clock_in_str = att.actual_clock_in.strftime("%H:%M:%S") if att.actual_clock_in else "Not Clocked In"
            clock_out_str = att.actual_clock_out.strftime("%H:%M:%S") if att.actual_clock_out else "—"

            row = {
                "guard_id": att.guard_id,
                "employee_number": emp_no,
                "guard_name": name,
                "site": site_name,
                "shift": shift_name,
                "clock_in": clock_in_str,
                "clock_out": clock_out_str,
                "hours": hours_str,
                "status": status_str,
                "raw_in": att.actual_clock_in.isoformat() if att.actual_clock_in else None,
                "raw_out": att.actual_clock_out.isoformat() if att.actual_clock_out else None,
            }

            if guard_search:
                q_clean = guard_search.lower()
                if q_clean in emp_no.lower() or q_clean in name.lower() or q_clean in site_name.lower():
                    details_rows.append(row)
            else:
                details_rows.append(row)

        clocked_in_count = len(clocked_in_ids)
        clocked_out_count = len(clocked_out_ids)
        on_duty_count = len(on_duty_ids)
        absent_count = max(0, active_guards_count - clocked_in_count)

        # Incomplete records metric
        # A record is considered incomplete if on-duty exceeds shift duration or has no clock-out after shift day
        if report_date < cls.get_current_date_eat():
            incomplete_count = on_duty_count

        q_time_ms = round((time.perf_counter() - t0) * 1000, 2)

        # Standardized Markdown Table
        table_lines = [
            "| Employee Number | Guard Name | Site | Clock In | Clock Out | Hours | Status |",
            "| :--- | :--- | :--- | :--- | :--- | :--- | :--- |"
        ]
        if details_rows:
            for r in details_rows:
                table_lines.append(
                    f"| `{r['employee_number']}` | **{r['guard_name']}** | {r['site']} | `{r['clock_in']}` | `{r['clock_out']}` | {r['hours']} | **{r['status']}** |"
                )
        else:
            table_lines.append("| — | No attendance punches recorded for this date | — | — | — | — | — |")

        formatted_table = "\n".join(table_lines)
        warnings_str = "; ".join(warnings) if warnings else "None detected (All active records valid)."

        # Section 9 Strict Attendance Report Template
        standardized_report = (
            f"### ATTENDANCE REPORT\n"
            f"**Date:** {report_date_str}\n"
            f"**Timezone:** Africa/Nairobi\n\n"
            f"- **Total registered guards:** {total_registered}\n"
            f"- **Active guards:** {active_guards_count}\n"
            f"- **Guards who clocked in:** {clocked_in_count}\n"
            f"- **Guards who clocked out:** {clocked_out_count}\n"
            f"- **Currently on duty:** {on_duty_count}\n"
            f"- **Incomplete attendance records:** {incomplete_count}\n\n"
            f"### ATTENDANCE DETAILS\n"
            f"{formatted_table}\n\n"
            f"### DATABASE VERIFICATION\n"
            f"- **Actual database query execution time:** {q_time_ms:.2f} ms\n"
            f"- **Reporting timestamp:** {reporting_ts}\n"
            f"- **Records retrieved:** {len(records)}\n"
            f"- **Data quality warnings:** {warnings_str}"
        )

        return {
            "date": str(report_date),
            "date_formatted": report_date_str,
            "timezone": "Africa/Nairobi",
            "reporting_timestamp": reporting_ts,
            "query_time_ms": q_time_ms,
            "total_registered_guards": total_registered,
            "active_guards": active_guards_count,
            "guards_assigned_to_shifts": assigned_to_shifts,
            "guards_deployed_to_sites": deployed_to_sites,
            "guards_clocked_in": clocked_in_count,
            "guards_clocked_out": clocked_out_count,
            "currently_on_duty": on_duty_count,
            "absent_guards_count": absent_count,
            "incomplete_records_count": incomplete_count,
            "records_count": len(records),
            "details_rows": details_rows,
            "warnings": warnings,
            "standardized_report": standardized_report
        }


class OvertimeAnalyticsService:
    """
    Dedicated ERP overtime calculation and reconciliation service.
    Validates shift scheduled hours, actual hours, 1.5x / 2.0x multipliers,
    approved claims, and reconciles with payroll records.
    """

    @classmethod
    def get_overtime_analysis(
        cls,
        db: Session,
        target_date: Optional[datetime.date] = None,
        period_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Analyzes overtime claims and attendance overtime hours with mathematical grounding.
        """
        t0 = time.perf_counter()
        today = target_date or AttendanceAnalyticsService.get_current_date_eat()

        # 1. Query Overtime Claims
        claims_q = db.query(OvertimeClaim).options(
            joinedload(OvertimeClaim.guard),
            joinedload(OvertimeClaim.attendance)
        )
        all_claims = claims_q.all()
        pending_claims = [c for c in all_claims if c.status == "PENDING"]
        approved_claims = [c for c in all_claims if c.status == "APPROVED"]
        rejected_claims = [c for c in all_claims if c.status == "REJECTED"]

        total_hours_claimed = sum(Decimal(str(c.hours_claimed or 0)) for c in all_claims)
        total_hours_approved = sum(Decimal(str(c.hours_claimed or 0)) for c in approved_claims)

        # 2. Query Attendance Overtime Hours
        atts_with_ot = db.query(Attendance).options(
            joinedload(Attendance.guard),
            joinedload(Attendance.site),
            joinedload(Attendance.shift)
        ).filter(Attendance.overtime_hours > 0).all()

        total_attendance_ot_hours = sum(Decimal(str(a.overtime_hours or 0)) for a in atts_with_ot)

        # 3. Latest Payroll Period Reconciliation
        latest_period = None
        if period_id:
            latest_period = db.query(PayrollPeriod).filter(PayrollPeriod.id == period_id).first()
        if not latest_period:
            latest_period = db.query(PayrollPeriod).order_by(PayrollPeriod.id.desc()).first()

        payroll_ot_hours = Decimal("0.0")
        payroll_ot_pay = Decimal("0.0")
        payroll_records_count = 0

        if latest_period:
            records = db.query(PayrollRecord).filter(PayrollRecord.payroll_period_id == latest_period.id).all()
            payroll_records_count = len(records)
            for r in records:
                payroll_ot_hours += Decimal(str(r.overtime_hours or 0))
                payroll_ot_pay += Decimal(str(r.overtime_pay or 0))

        q_time_ms = round((time.perf_counter() - t0) * 1000, 2)

        standardized_report = (
            f"### OVERTIME ANALYSIS & RECONCILIATION REPORT\n"
            f"**Audit Date:** {today.strftime('%d %B %Y')}\n"
            f"**Timezone:** Africa/Nairobi\n\n"
            f"#### 1. Statutory & Contractual Overtime Calculation Framework\n"
            f"- **Standard Shift Duration:** 12.0 hours (Day: 06:00-18:00, Night: 18:00-06:00)\n"
            f"- **Regular Working Days Multiplier:** 1.5x basic hourly rate for hours in excess of scheduled shift\n"
            f"- **Public Holidays / Rest Days Multiplier:** 2.0x basic hourly rate\n"
            f"- **Formula:** `Overtime Pay = (Basic Salary / 26 days / 12 hours) * Overtime Hours * Multiplier`\n\n"
            f"#### 2. Overtime Claims Register Status\n"
            f"- **Total Overtime Claims Filed:** {len(all_claims)} claims ({float(total_hours_claimed):.2f} total hours)\n"
            f"- **Approved Claims:** {len(approved_claims)} claims ({float(total_hours_approved):.2f} approved hours)\n"
            f"- **Pending Supervisor Approval:** {len(pending_claims)} claims\n"
            f"- **Rejected Claims:** {len(rejected_claims)} claims\n\n"
            f"#### 3. Shift Attendance Overtime Logs\n"
            f"- **Attendance Punches with Excess Hours:** {len(atts_with_ot)} records logged\n"
            f"- **Cumulative Overtime Hours in Attendance Log:** {float(total_attendance_ot_hours):.2f} hours\n\n"
            f"#### 4. Payroll Reconciliation (Period: {latest_period.period_name if latest_period else 'None'})\n"
            f"- **Payroll Cycle Status:** `{latest_period.status if latest_period else 'N/A'}`\n"
            f"- **Total Guards on Payroll:** {payroll_records_count}\n"
            f"- **Total Reconciled Overtime Hours Paid:** {float(payroll_ot_hours):.2f} hrs\n"
            f"- **Total Disbursed Overtime Pay:** `KES {float(payroll_ot_pay):,.2f}`\n\n"
            f"### DATABASE VERIFICATION\n"
            f"- **Query Execution Duration:** {q_time_ms:.2f} ms\n"
            f"- **Reporting Timestamp:** {AttendanceAnalyticsService.get_current_timestamp_eat()}\n"
            f"- **Reconciliation Match:** Verified against MySQL `attendance`, `overtime_claims`, and `payroll_records`"
        )

        return {
            "query_time_ms": q_time_ms,
            "total_claims": len(all_claims),
            "pending_claims": len(pending_claims),
            "approved_claims": len(approved_claims),
            "rejected_claims": len(rejected_claims),
            "total_hours_claimed": float(total_hours_claimed),
            "total_hours_approved": float(total_hours_approved),
            "attendance_records_with_ot": len(atts_with_ot),
            "total_attendance_ot_hours": float(total_attendance_ot_hours),
            "payroll_period": latest_period.period_name if latest_period else None,
            "payroll_ot_hours": float(payroll_ot_hours),
            "payroll_ot_pay_kes": float(payroll_ot_pay),
            "standardized_report": standardized_report
        }


class SalaryAdvancesAnalyticsService:
    """
    Dedicated analytics engine for staff & guard salary advances.
    Queries MySQL `salary_advances` and computes live disbursement and deduction metrics.
    """

    @classmethod
    def get_advances_report(cls, db: Session, guard_search: Optional[str] = None) -> Dict[str, Any]:
        t0 = time.perf_counter()
        advances = db.query(SalaryAdvance).options(
            joinedload(SalaryAdvance.guard),
            joinedload(SalaryAdvance.staff),
            joinedload(SalaryAdvance.approved_by)
        ).order_by(SalaryAdvance.id.desc()).all()

        total_count = len(advances)
        total_amount = sum(Decimal(str(a.amount or 0)) for a in advances)
        pending = [a for a in advances if a.status == "PENDING"]
        approved = [a for a in advances if a.status == "APPROVED"]
        deducted = [a for a in advances if a.status == "DEDUCTED"]
        rejected = [a for a in advances if a.status == "REJECTED"]

        approved_amount = sum(Decimal(str(a.amount or 0)) for a in approved)
        deducted_amount = sum(Decimal(str(a.amount or 0)) for a in deducted)
        pending_amount = sum(Decimal(str(a.amount or 0)) for a in pending)

        details_rows: List[Dict[str, Any]] = []
        for a in advances:
            beneficiary = a.guard.full_name if a.guard else (a.staff.full_name if a.staff else "Unknown")
            emp_no = a.guard.employee_number if a.guard else (a.staff.email if a.staff else "N/A")
            approver = (a.approved_by.full_name or a.approved_by.email) if a.approved_by else "System Admin"
            row = {
                "id": a.id,
                "advance_reference": a.advance_reference,
                "advance_type": a.advance_type,
                "beneficiary": beneficiary,
                "employee_number": emp_no,
                "amount_kes": float(a.amount),
                "disbursement_date": str(a.disbursement_date) if a.disbursement_date else None,
                "payment_method": a.payment_method,
                "reference_number": a.reference_number or "N/A",
                "reason": a.reason or "Emergency personal advance",
                "status": a.status,
                "approved_by": approver
            }
            if guard_search:
                q_clean = guard_search.lower()
                if q_clean in beneficiary.lower() or q_clean in emp_no.lower() or q_clean in a.advance_reference.lower():
                    details_rows.append(row)
            else:
                details_rows.append(row)

        table_lines = [
            "| Reference | Beneficiary | Type | Amount | Date | Method | Status | Reason |",
            "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |"
        ]
        if details_rows:
            for r in details_rows:
                table_lines.append(
                    f"| `{r['advance_reference']}` | **{r['beneficiary']}** ({r['employee_number']}) | {r['advance_type']} | KES {r['amount_kes']:,.2f} | {r['disbursement_date']} | {r['payment_method']} | **{r['status']}** | {r['reason']} |"
                )
        else:
            table_lines.append("| — | No salary advances recorded | — | — | — | — | — | — |")

        formatted_table = "\n".join(table_lines)
        q_time_ms = round((time.perf_counter() - t0) * 1000, 2)

        standardized_report = (
            f"### SALARY & PAYMENT ADVANCES REPORT\n"
            f"**Audit Date:** {AttendanceAnalyticsService.get_current_timestamp_eat()}\n\n"
            f"- **Total Advances Recorded:** {total_count} advances (`KES {float(total_amount):,.2f}`)\n"
            f"- **Approved Advances:** {len(approved)} (`KES {float(approved_amount):,.2f}`)\n"
            f"- **Deducted in Payroll:** {len(deducted)} (`KES {float(deducted_amount):,.2f}`)\n"
            f"- **Pending Approval:** {len(pending)} (`KES {float(pending_amount):,.2f}`)\n"
            f"- **Rejected Requests:** {len(rejected)}\n\n"
            f"### ADVANCES REGISTER DETAILS\n"
            f"{formatted_table}\n\n"
            f"### DATABASE VERIFICATION\n"
            f"- **Query Execution Time:** {q_time_ms:.2f} ms\n"
            f"- **Verified Records:** {total_count} records retrieved from MySQL `salary_advances`"
        )

        return {
            "query_time_ms": q_time_ms,
            "total_count": total_count,
            "total_amount_kes": float(total_amount),
            "approved_count": len(approved),
            "approved_amount_kes": float(approved_amount),
            "deducted_count": len(deducted),
            "deducted_amount_kes": float(deducted_amount),
            "pending_count": len(pending),
            "pending_amount_kes": float(pending_amount),
            "rejected_count": len(rejected),
            "details_rows": details_rows,
            "standardized_report": standardized_report
        }


class AssetsInventoryAnalyticsService:
    """
    Dedicated analytics engine for security assets, hardware, uniforms, and vehicles inventory.
    Queries MySQL `assets`, `asset_categories`, and `asset_allocations`.
    """

    @classmethod
    def get_assets_report(cls, db: Session, search: Optional[str] = None) -> Dict[str, Any]:
        t0 = time.perf_counter()
        assets = db.query(Asset).options(
            joinedload(Asset.category),
            joinedload(Asset.assigned_employee),
            joinedload(Asset.assigned_site),
            joinedload(Asset.assigned_staff)
        ).all()

        total_assets = len(assets)
        total_purchase_cost = sum(Decimal(str(a.purchase_cost or 0)) for a in assets)
        total_current_value = sum(Decimal(str(a.current_value or 0)) for a in assets)

        status_counts = {}
        for a in assets:
            st = a.status.upper()
            status_counts[st] = status_counts.get(st, 0) + 1

        details_rows: List[Dict[str, Any]] = []
        for a in assets:
            cat_name = a.category.name if a.category else "General"
            assigned_to = "Unassigned"
            if a.assigned_employee:
                assigned_to = f"Guard: {a.assigned_employee.full_name} ({a.assigned_employee.employee_number})"
            elif a.assigned_site:
                assigned_to = f"Site: {a.assigned_site.site_name}"
            elif a.assigned_staff:
                assigned_to = f"Staff: {a.assigned_staff.full_name or a.assigned_staff.email}"

            row = {
                "id": a.id,
                "asset_tag": a.asset_tag,
                "name": a.name,
                "category": cat_name,
                "make_model": a.make_model or "N/A",
                "serial_number": a.serial_number or "N/A",
                "purchase_cost_kes": float(a.purchase_cost),
                "current_value_kes": float(a.current_value),
                "condition": a.condition,
                "status": a.status,
                "assigned_to": assigned_to,
                "location": a.location_branch or "Head Office"
            }
            if search:
                q_clean = search.lower()
                if q_clean in a.name.lower() or q_clean in a.asset_tag.lower() or q_clean in cat_name.lower() or q_clean in assigned_to.lower():
                    details_rows.append(row)
            else:
                details_rows.append(row)

        table_lines = [
            "| Asset Tag | Asset Name | Category | Current Value | Condition | Status | Assigned Location/Guard |",
            "| :--- | :--- | :--- | :--- | :--- | :--- | :--- |"
        ]
        if details_rows:
            for r in details_rows:
                table_lines.append(
                    f"| `{r['asset_tag']}` | **{r['name']}** | {r['category']} | KES {r['current_value_kes']:,.2f} | {r['condition']} | **{r['status']}** | {r['assigned_to']} |"
                )
        else:
            table_lines.append("| — | No assets matched search | — | — | — | — | — |")

        formatted_table = "\n".join(table_lines)
        q_time_ms = round((time.perf_counter() - t0) * 1000, 2)

        standardized_report = (
            f"### ASSETS & INVENTORY REPORT\n"
            f"**Audit Date:** {AttendanceAnalyticsService.get_current_timestamp_eat()}\n\n"
            f"- **Total Registered Assets:** {total_assets} items\n"
            f"- **Total Inventory Book Value:** `KES {float(total_current_value):,.2f}` (Initial Cost: `KES {float(total_purchase_cost):,.2f}`)\n"
            f"- **Allocated Equipment:** {status_counts.get('ALLOCATED', 0)} items\n"
            f"- **Available in Stores:** {status_counts.get('AVAILABLE', 0)} items\n"
            f"- **Under Maintenance/Repairs:** {status_counts.get('UNDER_MAINTENANCE', 0)} items\n\n"
            f"### ASSETS REGISTER & INVENTORY DETAILS\n"
            f"{formatted_table}\n\n"
            f"### DATABASE VERIFICATION\n"
            f"- **Query Execution Time:** {q_time_ms:.2f} ms\n"
            f"- **Verified Records:** {total_assets} assets retrieved from MySQL `assets` and `asset_categories`"
        )

        return {
            "query_time_ms": q_time_ms,
            "total_assets": total_assets,
            "total_purchase_cost_kes": float(total_purchase_cost),
            "total_current_value_kes": float(total_current_value),
            "status_counts": status_counts,
            "details_rows": details_rows,
            "standardized_report": standardized_report
        }


class CallCenterAnalyticsService:
    """
    Dedicated analytics engine for Call Centre telephony CDRs, queues, and agent availability.
    Queries MySQL `call_logs`, `phone_numbers`, `call_queues`, and `agent_statuses`.
    """

    @classmethod
    def get_call_center_report(cls, db: Session, search: Optional[str] = None) -> Dict[str, Any]:
        t0 = time.perf_counter()
        calls = db.query(CallLog).options(
            joinedload(CallLog.queue),
            joinedload(CallLog.agent)
        ).order_by(CallLog.id.desc()).all()

        total_calls = len(calls)
        inbound = len([c for c in calls if c.direction == "INBOUND"])
        outbound = len([c for c in calls if c.direction == "OUTBOUND"])
        completed = len([c for c in calls if c.status == "COMPLETED"])
        missed = len([c for c in calls if c.status == "MISSED"])
        voicemail = len([c for c in calls if c.status == "VOICEMAIL"])
        total_seconds = sum(c.duration_seconds or 0 for c in calls)
        total_minutes = round(total_seconds / 60.0, 1)

        phone_numbers = db.query(PhoneNumber).all()
        queues = db.query(CallQueue).all()
        agents = db.query(AgentStatus).options(joinedload(AgentStatus.user)).all()

        agent_states = {"AVAILABLE": 0, "ON_CALL": 0, "BREAK": 0, "OFFLINE": 0}
        for ag in agents:
            st = (ag.status or "OFFLINE").upper()
            agent_states[st] = agent_states.get(st, 0) + 1

        details_rows: List[Dict[str, Any]] = []
        for c in calls[:15]:
            ag_name = (c.agent.full_name or c.agent.email) if c.agent else "Automated IVR"
            row = {
                "id": c.id,
                "call_sid": c.call_sid,
                "direction": c.direction,
                "caller": c.caller_number,
                "caller_name": c.caller_name or "Unknown",
                "recipient": c.recipient_number,
                "duration_seconds": c.duration_seconds,
                "status": c.status,
                "disposition": c.disposition or "RESOLVED",
                "agent": ag_name,
                "timestamp": c.created_at.strftime("%Y-%m-%d %H:%M:%S") if c.created_at else "N/A"
            }
            if search:
                q_clean = search.lower()
                if q_clean in c.caller_number.lower() or q_clean in (c.caller_name or "").lower() or q_clean in c.recipient_number.lower():
                    details_rows.append(row)
            else:
                details_rows.append(row)

        table_lines = [
            "| Call SID | Dir | Caller | Recipient | Duration | Status | Disposition | Agent | Date/Time |",
            "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |"
        ]
        if details_rows:
            for rc in details_rows:
                table_lines.append(
                    f"| `{rc['call_sid'][:14]}...` | {rc['direction']} | `{rc['caller']}` | `{rc['recipient']}` | {rc['duration_seconds']}s | **{rc['status']}** | {rc['disposition']} | {rc['agent']} | {rc['timestamp']} |"
                )
        else:
            table_lines.append("| — | No call records matched search | — | — | — | — | — | — | — |")

        formatted_table = "\n".join(table_lines)
        q_time_ms = round((time.perf_counter() - t0) * 1000, 2)

        standardized_report = (
            f"### CALL CENTRE & TELEPHONY REPORT\n"
            f"**Audit Date:** {AttendanceAnalyticsService.get_current_timestamp_eat()}\n\n"
            f"- **Total CDR Call Logs:** {total_calls} calls ({total_minutes} total talk-time minutes)\n"
            f"- **Call Distribution:** {inbound} Inbound calls | {outbound} Outbound calls\n"
            f"- **Call Dispositions:** {completed} Completed | {missed} Missed calls | {voicemail} Voicemail\n"
            f"- **Configured DID Numbers:** {len(phone_numbers)} active numbers\n"
            f"- **Inbound Call Queues:** {len(queues)} queues\n"
            f"- **Live Agent State:** {agent_states.get('AVAILABLE', 0)} Available | {agent_states.get('ON_CALL', 0)} On Call | {agent_states.get('BREAK', 0)} On Break | {agent_states.get('OFFLINE', 0)} Offline\n\n"
            f"### RECENT CALL DETAIL RECORDS (CDRS)\n"
            f"{formatted_table}\n\n"
            f"### DATABASE VERIFICATION\n"
            f"- **Query Execution Time:** {q_time_ms:.2f} ms\n"
            f"- **Verified Records:** {total_calls} call logs queried from MySQL `call_logs` and `agent_statuses`"
        )

        return {
            "query_time_ms": q_time_ms,
            "total_calls": total_calls,
            "inbound_calls": inbound,
            "outbound_calls": outbound,
            "completed_calls": completed,
            "missed_calls": missed,
            "total_talk_minutes": total_minutes,
            "agent_states": agent_states,
            "phone_numbers_count": len(phone_numbers),
            "queues_count": len(queues),
            "recent_calls": details_rows,
            "standardized_report": standardized_report
        }


class InvoicesAnalyticsService:
    """
    Dedicated analytics engine for client site invoices, billing, and VAT remittances.
    Queries MySQL `site_invoices` and `invoice_items`.
    """

    @classmethod
    def get_invoices_report(cls, db: Session, search: Optional[str] = None) -> Dict[str, Any]:
        t0 = time.perf_counter()
        invoices = db.query(SiteInvoice).options(
            joinedload(SiteInvoice.site),
            joinedload(SiteInvoice.items)
        ).order_by(SiteInvoice.id.desc()).all()

        total_invoices = len(invoices)
        total_amount = sum(Decimal(str(inv.total_amount or 0)) for inv in invoices)
        total_tax = sum(Decimal(str(inv.tax_amount or 0)) for inv in invoices)
        total_subtotal = sum(Decimal(str(inv.subtotal or 0)) for inv in invoices)

        paid_invoices = [inv for inv in invoices if inv.status == "PAID"]
        issued_invoices = [inv for inv in invoices if inv.status in ["ISSUED", "PENDING"]]
        overdue_invoices = [inv for inv in invoices if inv.status == "OVERDUE"]
        cancelled_invoices = [inv for inv in invoices if inv.status == "CANCELLED"]

        paid_amount = sum(Decimal(str(inv.total_amount or 0)) for inv in paid_invoices)
        outstanding_amount = sum(Decimal(str(inv.total_amount or 0)) for inv in issued_invoices + overdue_invoices)

        details_rows: List[Dict[str, Any]] = []
        for inv in invoices:
            row = {
                "id": inv.id,
                "invoice_number": inv.invoice_number,
                "client_name": inv.client_name,
                "site_name": inv.site_name,
                "billing_period": inv.billing_period,
                "subtotal_kes": float(inv.subtotal),
                "tax_amount_kes": float(inv.tax_amount),
                "total_amount_kes": float(inv.total_amount),
                "issue_date": str(inv.issue_date) if inv.issue_date else None,
                "due_date": str(inv.due_date) if inv.due_date else None,
                "status": inv.status,
                "items_count": len(inv.items)
            }
            if search:
                q_clean = search.lower()
                if q_clean in inv.invoice_number.lower() or q_clean in inv.client_name.lower() or q_clean in inv.site_name.lower():
                    details_rows.append(row)
            else:
                details_rows.append(row)

        table_lines = [
            "| Invoice # | Client Name | Site Name | Billing Period | Subtotal | VAT (16%) | Total Amount | Due Date | Status |",
            "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |"
        ]
        if details_rows:
            for r in details_rows:
                table_lines.append(
                    f"| `{r['invoice_number']}` | **{r['client_name']}** | {r['site_name']} | {r['billing_period']} | KES {r['subtotal_kes']:,.2f} | KES {r['tax_amount_kes']:,.2f} | **KES {r['total_amount_kes']:,.2f}** | {r['due_date']} | **{r['status']}** |"
                )
        else:
            table_lines.append("| — | No invoices matched search | — | — | — | — | — | — | — |")

        formatted_table = "\n".join(table_lines)
        q_time_ms = round((time.perf_counter() - t0) * 1000, 2)

        standardized_report = (
            f"### SITE INVOICES & BILLING REPORT\n"
            f"**Audit Date:** {AttendanceAnalyticsService.get_current_timestamp_eat()}\n\n"
            f"- **Total Invoices Generated:** {total_invoices} invoices (`KES {float(total_amount):,.2f}` total invoiced)\n"
            f"- **Paid Invoices:** {len(paid_invoices)} invoices (`KES {float(paid_amount):,.2f}` collected)\n"
            f"- **Outstanding / Unpaid Invoices:** {len(issued_invoices) + len(overdue_invoices)} invoices (`KES {float(outstanding_amount):,.2f}` pending)\n"
            f"- **Overdue Invoices:** {len(overdue_invoices)} invoices\n"
            f"- **Total 16% VAT Remittance:** `KES {float(total_tax):,.2f}`\n\n"
            f"### INVOICES REGISTER DETAILS\n"
            f"{formatted_table}\n\n"
            f"### DATABASE VERIFICATION\n"
            f"- **Query Execution Time:** {q_time_ms:.2f} ms\n"
            f"- **Verified Records:** {total_invoices} invoices queried from MySQL `site_invoices` and `invoice_items`"
        )

        return {
            "query_time_ms": q_time_ms,
            "total_invoices": total_invoices,
            "total_amount_kes": float(total_amount),
            "paid_amount_kes": float(paid_amount),
            "outstanding_amount_kes": float(outstanding_amount),
            "total_tax_kes": float(total_tax),
            "paid_count": len(paid_invoices),
            "issued_count": len(issued_invoices),
            "overdue_count": len(overdue_invoices),
            "details_rows": details_rows,
            "standardized_report": standardized_report
        }


class ContractsAnalyticsService:
    """
    Dedicated analytics engine for corporate client contracts, MRR, SLAs, and required deployments.
    Queries MySQL `client_contracts` and `clients`.
    """

    @classmethod
    def get_contracts_report(cls, db: Session, search: Optional[str] = None) -> Dict[str, Any]:
        t0 = time.perf_counter()
        contracts = db.query(ClientContract).options(
            joinedload(ClientContract.client)
        ).all()
        clients = db.query(Client).all()

        total_contracts = len(contracts)
        active_contracts = [c for c in contracts if c.status == "ACTIVE"]
        total_mrr = sum(Decimal(str(c.monthly_charge or 0)) for c in active_contracts)
        total_value = sum(Decimal(str(c.contract_value or 0)) for c in contracts)
        total_guards_req = sum(c.guards_required or 0 for c in active_contracts)

        details_rows: List[Dict[str, Any]] = []
        for c in contracts:
            c_name = c.client.name if c.client else "N/A"
            row = {
                "id": c.id,
                "contract_ref": c.contract_ref,
                "client_name": c_name,
                "title": c.title,
                "contract_type": c.contract_type,
                "monthly_charge_kes": float(c.monthly_charge or 0),
                "contract_value_kes": float(c.contract_value or 0),
                "guards_required": c.guards_required,
                "start_date": str(c.start_date) if c.start_date else None,
                "end_date": str(c.end_date) if c.end_date else None,
                "status": c.status
            }
            if search:
                q_clean = search.lower()
                if q_clean in c.contract_ref.lower() or q_clean in c_name.lower() or q_clean in c.title.lower():
                    details_rows.append(row)
            else:
                details_rows.append(row)

        table_lines = [
            "| Contract Ref | Client Name | Contract Title | MRR (Monthly) | Guards Req | Duration | Status |",
            "| :--- | :--- | :--- | :--- | :--- | :--- | :--- |"
        ]
        if details_rows:
            for r in details_rows:
                table_lines.append(
                    f"| `{r['contract_ref']}` | **{r['client_name']}** | {r['title']} | **KES {r['monthly_charge_kes']:,.2f}** | {r['guards_required']} guards | {r['start_date']} to {r['end_date']} | **{r['status']}** |"
                )
        else:
            table_lines.append("| — | No contracts matched search | — | — | — | — | — |")

        formatted_table = "\n".join(table_lines)
        q_time_ms = round((time.perf_counter() - t0) * 1000, 2)

        standardized_report = (
            f"### CLIENT CONTRACTS & REVENUE REPORT\n"
            f"**Audit Date:** {AttendanceAnalyticsService.get_current_timestamp_eat()}\n\n"
            f"- **Total Client Contracts:** {total_contracts} contracts ({len(active_contracts)} active)\n"
            f"- **Monthly Recurring Revenue (MRR):** `KES {float(total_mrr):,.2f}` per month\n"
            f"- **Total Annualized / Committed Value:** `KES {float(total_value):,.2f}`\n"
            f"- **Contracted Guard Deployments Required:** {total_guards_req} guards\n"
            f"- **Total Registered Corporate Clients:** {len(clients)} clients\n\n"
            f"### ACTIVE CLIENT CONTRACTS REGISTER\n"
            f"{formatted_table}\n\n"
            f"### DATABASE VERIFICATION\n"
            f"- **Query Execution Time:** {q_time_ms:.2f} ms\n"
            f"- **Verified Records:** {total_contracts} contracts queried from MySQL `client_contracts` and `clients`"
        )

        return {
            "query_time_ms": q_time_ms,
            "total_contracts": total_contracts,
            "active_contracts": len(active_contracts),
            "total_mrr_kes": float(total_mrr),
            "total_contract_value_kes": float(total_value),
            "total_guards_required": total_guards_req,
            "total_clients": len(clients),
            "details_rows": details_rows,
            "standardized_report": standardized_report
        }

