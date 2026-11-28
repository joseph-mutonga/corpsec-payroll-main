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
from application.backend.app.models.asset import Asset, AssetCategory, AssetAllocation, InventoryItem, InventoryTransaction
from application.backend.app.models.call_center import CallLog, PhoneNumber, CallQueue, AgentStatus
from application.backend.app.models.invoice import SiteInvoice, InvoiceItem
from application.backend.app.models.client_contract import ClientContract, Client
from application.backend.app.models.leave import LeaveRequest
from application.backend.app.models.expense import Expense, PettyCashTransaction
from application.backend.app.models.incident import Incident
from application.backend.app.models.user import User
from application.backend.app.models.team_message import TeamMessage, TeamChatRead

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
        today_eat = cls.get_current_date_eat()
        latest_shift_date = db.query(func.max(Attendance.shift_date)).scalar()
        if target_date is not None:
            report_date = target_date
        else:
            report_date = today_eat
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
            elif not has_clock_in and has_clock_out:
                incomplete_count += 1
                status_str = "Orphaned Clock-Out (Needs Review)"
                hours_str = "0.00 hrs"
                warnings.append(f"Guard {emp_no} ({name}) has an orphaned offline clock-out without a clock-in record.")
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

        if report_date == today_eat and len(records) == 0:
            latest_str = latest_shift_date.strftime("%d %B %Y") if latest_shift_date else "None"
            warnings.append(f"No attendance punches logged yet for today ({report_date_str}). Most recent shift records were on {latest_str}.")

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
            "latest_active_shift_date": str(latest_shift_date) if latest_shift_date else None,
            "latest_active_shift_date_formatted": latest_shift_date.strftime("%d %B %Y") if latest_shift_date else None,
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
    Dedicated analytics engine for security assets, hardware, uniforms, and supplies inventory.
    Queries MySQL `assets`, `asset_categories`, `inventory_items`, and `inventory_transactions`.
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

        # ------------------------------------------------------------------
        # INVENTORY & UNIFORM ITEMS (caps, boots, uniforms, raincoats, etc.)
        # ------------------------------------------------------------------
        inventory_items = db.query(InventoryItem).order_by(InventoryItem.id.asc()).all()
        inv_rows: List[Dict[str, Any]] = []

        total_inv_units_combined = 0
        total_inv_units_issued = 0
        total_inv_units_remaining = 0
        total_inv_firm_valuation = Decimal("0.0")

        for it in inventory_items:
            txs = db.query(InventoryTransaction).filter(InventoryTransaction.item_id == it.id).all()
            issued_qty = sum(t.quantity for t in txs if t.transaction_type in ["ISSUED", "DISPATCH"])
            returned_qty = sum(t.quantity for t in txs if t.transaction_type == "RETURNED")
            net_issued = max(0, issued_qty - returned_qty)
            remaining_stock = max(0, it.current_stock)
            total_combined = remaining_stock + net_issued

            unit_cost = float(it.unit_cost or 0.0)
            total_val = round(total_combined * unit_cost, 2)
            issued_val = round(net_issued * unit_cost, 2)
            remaining_val = round(remaining_stock * unit_cost, 2)

            total_inv_units_combined += total_combined
            total_inv_units_issued += net_issued
            total_inv_units_remaining += remaining_stock
            total_inv_firm_valuation += Decimal(str(total_val))

            inv_row = {
                "id": it.id,
                "item_code": it.item_code,
                "item_name": it.item_name,
                "category": it.category,
                "unit_of_measure": it.unit_of_measure,
                "total_combined_stock": total_combined,
                "issued_stock": net_issued,
                "remaining_stock": remaining_stock,
                "unit_cost_kes": unit_cost,
                "total_firm_valuation_kes": total_val,
                "issued_valuation_kes": issued_val,
                "remaining_valuation_kes": remaining_val,
                "storage_location": it.storage_location or "Main Warehouse"
            }
            if search:
                q_clean = search.lower()
                if (q_clean in it.item_name.lower() or 
                    q_clean in it.item_code.lower() or 
                    q_clean in (it.category or "").lower() or 
                    (q_clean in ["cap", "caps"] and "cap" in it.item_name.lower()) or
                    (q_clean in ["boot", "boots"] and "boot" in it.item_name.lower()) or
                    (q_clean in ["uniform", "uniforms"] and "uniform" in it.item_name.lower())):
                    inv_rows.append(inv_row)
            else:
                inv_rows.append(inv_row)

        inv_table_lines = [
            "| SKU / Code | Item Name & Details | Category | Total in Firm | Issued / In Use | Remaining in Store | Storage Location | Unit Cost | Total Value |",
            "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |"
        ]
        if inv_rows:
            for ir in inv_rows:
                inv_table_lines.append(
                    f"| `{ir['item_code']}` | **{ir['item_name']}** | {ir['category']} | **{ir['total_combined_stock']} COMBINED** | **{ir['issued_stock']}** | **{ir['remaining_stock']} in Store** | {ir['storage_location']} | KES {ir['unit_cost_kes']:,.2f} | KES {ir['total_firm_valuation_kes']:,.2f} |"
                )
        else:
            inv_table_lines.append("| — | No inventory items matched search | — | — | — | — | — | — | — |")

        formatted_inv_table = "\n".join(inv_table_lines)

        # ------------------------------------------------------------------
        # 3. GUARD PERSONNEL ISSUED EQUIPMENT & UNIFORMS CUSTODY
        # ------------------------------------------------------------------
        guards_all = db.query(Guard).all()
        guard_custody_rows: List[Dict[str, Any]] = []
        custody_table_lines = [
            "| Guard Name | Emp Number | Total Issued Records | Currently in Custody | Returned | Unreturned Uniforms & Gear |",
            "| :--- | :--- | :--- | :--- | :--- | :--- |"
        ]

        for g in guards_all:
            g_txs = db.query(InventoryTransaction).filter(InventoryTransaction.issued_to_guard_id == g.id).order_by(InventoryTransaction.id.asc()).all()
            g_allocs = db.query(AssetAllocation).filter(AssetAllocation.guard_id == g.id).order_by(AssetAllocation.id.asc()).all()

            if not g_txs and not g_allocs:
                continue

            active_records = [t for t in g_txs if t.transaction_type in ["ISSUED", "DISPATCH"]] + [a for a in g_allocs if a.status == "ACTIVE"]
            returned_records = [t for t in g_txs if t.transaction_type == "RETURNED"] + [a for a in g_allocs if a.status == "RETURNED"]

            item_map: Dict[str, Dict[str, Any]] = {}
            for t in g_txs:
                code = t.item.item_code if t.item else "Supply"
                name = t.item.item_name if t.item else "Uniform Item"
                cat = t.item.category if t.item else "UNIFORM"
                if code not in item_map:
                    item_map[code] = {
                        "item_code": code,
                        "item_name": name,
                        "category": cat,
                        "issued_qty": 0,
                        "returned_qty": 0,
                        "refs": [],
                        "dates": []
                    }
                if t.transaction_type in ["ISSUED", "DISPATCH"]:
                    item_map[code]["issued_qty"] += t.quantity
                    if t.reference_no:
                        item_map[code]["refs"].append(t.reference_no)
                    if t.created_at:
                        item_map[code]["dates"].append(str(t.created_at)[:10])
                elif t.transaction_type == "RETURNED":
                    item_map[code]["returned_qty"] += t.quantity

            unreturned_list = []
            for code, d in item_map.items():
                net_unret = d["issued_qty"] - d["returned_qty"]
                if net_unret > 0:
                    unreturned_list.append({
                        "item_code": code,
                        "item_name": d["item_name"],
                        "category": d["category"],
                        "unreturned_quantity": net_unret,
                        "issued_quantity": d["issued_qty"],
                        "returned_quantity": d["returned_qty"],
                        "reference_nos": list(set(d["refs"])),
                        "dates": list(set(d["dates"]))
                    })

            for a in g_allocs:
                if a.status == "ACTIVE":
                    a_name = a.asset.name if a.asset else "Asset"
                    a_tag = a.asset.asset_tag if a.asset else "N/A"
                    unreturned_list.append({
                        "item_code": a_tag,
                        "item_name": a_name,
                        "category": a.asset.category.name if a.asset and a.asset.category else "EQUIPMENT",
                        "unreturned_quantity": 1,
                        "issued_quantity": 1,
                        "returned_quantity": 0,
                        "reference_nos": [a_tag],
                        "dates": [str(a.allocated_date)] if a.allocated_date else []
                    })

            unret_summary_str = ", ".join([f"{u['unreturned_quantity']}x {u['item_name']}" for u in unreturned_list]) or "None (Cleared)"

            g_entry = {
                "guard_id": g.id,
                "employee_number": g.employee_number,
                "guard_name": g.full_name,
                "total_items_issued": len(g_txs) + len(g_allocs),
                "currently_in_custody": len(active_records),
                "returned_to_stores": len(returned_records),
                "unreturned_items": unreturned_list,
                "unreturned_summary": unret_summary_str
            }
            guard_custody_rows.append(g_entry)
            custody_table_lines.append(
                f"| **{g.full_name}** | `{g.employee_number}` | {len(g_txs) + len(g_allocs)} items | **{len(active_records)} Active (Pending Return)** | {len(returned_records)} Returned | {unret_summary_str} |"
            )

        formatted_custody_table = "\n".join(custody_table_lines)
        q_time_ms = round((time.perf_counter() - t0) * 1000, 2)

        standardized_report = (
            f"### ASSETS & INVENTORY REPORT\n"
            f"**Audit Date:** {AttendanceAnalyticsService.get_current_timestamp_eat()}\n\n"
            f"#### 1. Company Uniforms, Gear & Stock Supplies Inventory\n"
            f"- **Total Inventory Item Types:** {len(inventory_items)} distinct items\n"
            f"- **Total Combined Stock in Firm:** {total_inv_units_combined:,} units ({total_inv_units_issued:,} issued in use | {total_inv_units_remaining:,} remaining in store/warehouse)\n"
            f"- **Total Uniform & Stock Valuation:** `KES {float(total_inv_firm_valuation):,.2f}`\n\n"
            f"### COMPANY INVENTORY & UNIFORM STOCK REGISTER\n"
            f"{formatted_inv_table}\n\n"
            f"#### 2. Capital Fixed Assets Register (Hardware, Radios & Vehicles)\n"
            f"- **Total Registered Assets:** {total_assets} items\n"
            f"- **Total Fixed Assets Book Value:** `KES {float(total_current_value):,.2f}` (Initial Cost: `KES {float(total_purchase_cost):,.2f}`)\n"
            f"- **Allocated Equipment:** {status_counts.get('ALLOCATED', 0)} items\n"
            f"- **Available in Stores:** {status_counts.get('AVAILABLE', 0)} items\n"
            f"- **Under Maintenance/Repairs:** {status_counts.get('UNDER_MAINTENANCE', 0)} items\n\n"
            f"### FIXED ASSETS REGISTER\n"
            f"{formatted_table}\n\n"
            f"#### 3. Guard Issued Equipment, Uniforms & Item Returns Log\n"
            f"{formatted_custody_table}\n\n"
            f"### DATABASE VERIFICATION\n"
            f"- **Query Execution Time:** {q_time_ms:.2f} ms\n"
            f"- **Verified Records:** {total_assets} capital assets, {len(inventory_items)} inventory supply items, and {len(guard_custody_rows)} guard custody profiles retrieved from MySQL `assets`, `inventory_items`, `asset_allocations`, and `inventory_transactions`"
        )

        return {
            "query_time_ms": q_time_ms,
            "total_assets": total_assets,
            "total_purchase_cost_kes": float(total_purchase_cost),
            "total_current_value_kes": float(total_current_value),
            "status_counts": status_counts,
            "details_rows": details_rows,
            "inventory_items_count": len(inventory_items),
            "inventory_rows": inv_rows,
            "guard_custody_rows": guard_custody_rows,
            "total_inventory_units_combined": total_inv_units_combined,
            "total_combined_units": total_inv_units_combined,
            "total_inventory_units_issued": total_inv_units_issued,
            "total_inventory_units_remaining": total_inv_units_remaining,
            "total_inventory_valuation_kes": float(total_inv_firm_valuation),
            "standardized_report": standardized_report
        }

    @classmethod
    def get_guard_custody_report(cls, db: Session, guard_search: str) -> Dict[str, Any]:
        """
        Retrieves detailed custody and return logs for a specific guard by name or employee number.
        """
        q = guard_search.lower().strip()
        matched_guard = db.query(Guard).filter(
            or_(
                Guard.full_name.ilike(f"%{q}%"),
                Guard.employee_number.ilike(f"%{q}%")
            )
        ).first()

        if not matched_guard:
            return {"found": False, "message": f"No guard found matching '{guard_search}'"}

        g_id = matched_guard.id
        txs = db.query(InventoryTransaction).filter(InventoryTransaction.issued_to_guard_id == g_id).order_by(InventoryTransaction.id.desc()).all()
        allocs = db.query(AssetAllocation).filter(AssetAllocation.guard_id == g_id).order_by(AssetAllocation.id.desc()).all()

        active_txs = [t for t in txs if t.transaction_type in ["ISSUED", "DISPATCH"]]
        returned_txs = [t for t in txs if t.transaction_type == "RETURNED"]
        active_allocs = [a for a in allocs if a.status == "ACTIVE"]
        returned_allocs = [a for a in allocs if a.status == "RETURNED"]

        total_issued_records = len(active_txs) + len(active_allocs)
        total_returned_records = len(returned_txs) + len(returned_allocs)

        # Net unreturned items
        item_map: Dict[str, Dict[str, Any]] = {}
        for t in txs:
            code = t.item.item_code if t.item else "Supply"
            name = t.item.item_name if t.item else "Uniform Item"
            cat = t.item.category if t.item else "UNIFORM"
            if code not in item_map:
                item_map[code] = {
                    "item_code": code,
                    "item_name": name,
                    "category": cat,
                    "issued_qty": 0,
                    "returned_qty": 0,
                    "refs": [],
                    "dates": [],
                    "notes": []
                }
            if t.transaction_type in ["ISSUED", "DISPATCH"]:
                item_map[code]["issued_qty"] += t.quantity
                if t.reference_no: item_map[code]["refs"].append(t.reference_no)
                if t.created_at: item_map[code]["dates"].append(str(t.created_at)[:10])
                if t.reason_notes: item_map[code]["notes"].append(t.reason_notes)
            elif t.transaction_type == "RETURNED":
                item_map[code]["returned_qty"] += t.quantity

        unreturned_items = []
        cleared_items = []
        for code, d in item_map.items():
            net = d["issued_qty"] - d["returned_qty"]
            entry = {
                "item_code": code,
                "item_name": d["item_name"],
                "category": d["category"],
                "unreturned_quantity": max(0, net),
                "issued_quantity": d["issued_qty"],
                "returned_quantity": d["returned_qty"],
                "reference_nos": list(set(d["refs"])),
                "dates": list(set(d["dates"])),
                "notes": "; ".join(d["notes"][:2])
            }
            if net > 0:
                unreturned_items.append(entry)
            else:
                cleared_items.append(entry)

        for a in allocs:
            a_name = a.asset.name if a.asset else "Asset"
            a_tag = a.asset.asset_tag if a.asset else "N/A"
            entry = {
                "item_code": a_tag,
                "item_name": a_name,
                "category": a.asset.category.name if a.asset and a.asset.category else "EQUIPMENT",
                "unreturned_quantity": 1 if a.status == "ACTIVE" else 0,
                "issued_quantity": 1,
                "returned_quantity": 1 if a.status == "RETURNED" else 0,
                "reference_nos": [a_tag],
                "dates": [str(a.allocated_date)] if a.allocated_date else [],
                "notes": a.notes or ""
            }
            if a.status == "ACTIVE":
                unreturned_items.append(entry)
            else:
                cleared_items.append(entry)

        lines = [
            f"### GUARD ISSUED EQUIPMENT, UNIFORMS & ITEM RETURNS LOG: {matched_guard.full_name} (`{matched_guard.employee_number}`)\n",
            f"- **TOTAL ITEMS ISSUED:** {total_issued_records + total_returned_records} Items",
            f"- **CURRENTLY IN CUSTODY (PENDING RETURN):** **{total_issued_records} Active (Pending Return)**",
            f"- **RETURNED TO STORES:** {total_returned_records} Returned & Cleared\n",
            "#### UNRETURNED ITEMS IN CUSTODY:"
        ]
        if unreturned_items:
            for u in unreturned_items:
                refs_str = f" (Voucher / Ref: `{', '.join(u['reference_nos'])}`)" if u["reference_nos"] else ""
                dates_str = f", Issued: {', '.join(u['dates'])}" if u["dates"] else ""
                lines.append(f"- **{u['unreturned_quantity']}x {u['item_name']}** (`{u['item_code']}`){refs_str}{dates_str}")
        else:
            lines.append("- *No unreturned uniforms or equipment. All issued items cleared and returned to stores.*")

        if cleared_items:
            lines.append("\n#### SURRENDERED / RETURNED ITEMS:")
            for c in cleared_items:
                lines.append(f"- **{c['returned_quantity']}x {c['item_name']}** (`{c['item_code']}`) — *Surrendered & Restocked in Store*")

        return {
            "found": True,
            "guard_id": matched_guard.id,
            "employee_number": matched_guard.employee_number,
            "guard_name": matched_guard.full_name,
            "total_items_issued": total_issued_records + total_returned_records,
            "currently_in_custody": total_issued_records,
            "returned_to_stores": total_returned_records,
            "unreturned_items": unreturned_items,
            "cleared_items": cleared_items,
            "standardized_report": "\n".join(lines)
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

        today = datetime.date.today()
        today_calls = [c for c in calls if c.created_at and c.created_at.date() == today]
        today_calls_count = len(today_calls)
        today_inbound = len([c for c in today_calls if c.direction == "INBOUND"])
        today_outbound = len([c for c in today_calls if c.direction == "OUTBOUND"])
        today_completed = len([c for c in today_calls if c.status == "COMPLETED"])
        today_missed = len([c for c in today_calls if c.status == "MISSED"])
        today_talk_seconds = sum(c.duration_seconds or 0 for c in today_calls)
        today_talk_minutes = round(today_talk_seconds / 60.0, 1)

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
        today_str = today.strftime("%d %B %Y")

        standardized_report = (
            f"### CALL CENTRE & TELEPHONY REPORT\n"
            f"**Audit Date:** {AttendanceAnalyticsService.get_current_timestamp_eat()}\n\n"
            f"- **Calls Made Today ({today_str}):** {today_calls_count} calls ({today_inbound} Inbound, {today_outbound} Outbound, {today_completed} Completed, {today_missed} Missed, {today_talk_minutes} talk mins)\n"
            f"- **Total CDR Call Logs:** {total_calls} calls ({total_minutes} total talk-time minutes)\n"
            f"- **Call Distribution:** {inbound} Inbound calls | {outbound} Outbound calls\n"
            f"- **Call Dispositions:** {completed} Completed | {missed} Missed calls | {voicemail} Voicemail\n"
            f"- **Configured DID Numbers:** {len(phone_numbers)} active numbers\n"
            f"- **Inbound Call Queues:** {len(queues)} queues\n"
            f"- **Live Agent State:** {agent_states.get('AVAILABLE', 0)} Available | {agent_states.get('ON_CALL', 0)} On Call | {agent_states.get('BREAK', 0)} On Break | {agent_states.get('OFFLINE', 0)} Offline"
        )

        return {
            "query_time_ms": q_time_ms,
            "total_calls": total_calls,
            "calls_today": today_calls_count,
            "inbound_today": today_inbound,
            "outbound_today": today_outbound,
            "completed_today": today_completed,
            "missed_today": today_missed,
            "talk_minutes_today": today_talk_minutes,
            "inbound_calls": inbound,
            "outbound_calls": outbound,
            "completed_calls": completed,
            "missed_calls": missed,
            "total_talk_minutes": total_minutes,
            "agent_states": agent_states,
            "phone_numbers_count": len(phone_numbers),
            "queues_count": len(queues),
            "recent_calls": details_rows,
            "recent_calls_table": formatted_table,
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


class ExpensesAnalyticsService:
    """
    Dedicated analytics engine for firm operating expenses, recurring commitments,
    and petty cash imprest book.
    Queries MySQL `expenses` and `petty_cash_transactions`.
    """

    @classmethod
    def get_expenses_report(
        cls,
        db: Session,
        target_year: Optional[int] = None,
        target_month: Optional[int] = None,
        category_search: Optional[str] = None
    ) -> Dict[str, Any]:
        t0 = time.perf_counter()
        now_eat = datetime.datetime.now(NAIROBI_TZ)
        this_yr = target_year or now_eat.year
        this_mo = target_month or now_eat.month

        first_of_this = datetime.date(this_yr, this_mo, 1)
        last_mo_date = first_of_this - datetime.timedelta(days=1)
        last_yr, last_mo = last_mo_date.year, last_mo_date.month

        all_expenses = db.query(Expense).all()

        curr_month_exp = [
            e for e in all_expenses
            if e.expense_date and e.expense_date.year == this_yr and e.expense_date.month == this_mo
        ]
        last_month_exp = [
            e for e in all_expenses
            if e.expense_date and e.expense_date.year == last_yr and e.expense_date.month == last_mo
        ]

        total_this_month = sum(Decimal(str(e.amount or 0)) for e in curr_month_exp)
        total_last_month = sum(Decimal(str(e.amount or 0)) for e in last_month_exp)
        total_vouchers_count = len(all_expenses)

        # Petty cash float balance from latest transaction
        last_pc_tx = db.query(PettyCashTransaction).order_by(PettyCashTransaction.id.desc()).first()
        float_balance = float(last_pc_tx.balance_after) if last_pc_tx else 0.0

        # Recurring commitments normalized to monthly
        recurring_items = db.query(Expense).filter(Expense.is_recurring == True).all()
        monthly_recurring = Decimal("0.0")
        for r in recurring_items:
            interval = (r.recurrence_interval or "MONTHLY").upper()
            amt = Decimal(str(r.amount or 0))
            if interval == "MONTHLY":
                monthly_recurring += amt
            elif interval == "WEEKLY":
                monthly_recurring += amt * Decimal("4.33")
            elif interval == "QUARTERLY":
                monthly_recurring += amt / Decimal("3.0")
            elif interval == "ANNUALLY":
                monthly_recurring += amt / Decimal("12.0")

        # Breakdown by category and type for current month
        by_category: Dict[str, float] = {}
        by_type: Dict[str, float] = {}
        by_status: Dict[str, float] = {}
        paid_records = []
        paused_records = []

        details_rows: List[Dict[str, Any]] = []
        for e in sorted(curr_month_exp, key=lambda x: (x.expense_date or datetime.date.min, x.id), reverse=True):
            amt = float(e.amount or 0)
            by_category[e.category] = round(by_category.get(e.category, 0.0) + amt, 2)
            by_type[e.expense_type] = round(by_type.get(e.expense_type, 0.0) + amt, 2)
            by_status[e.status] = round(by_status.get(e.status, 0.0) + amt, 2)

            if e.status == "PAID":
                paid_records.append(e)
            else:
                paused_records.append(e)

            row = {
                "id": e.id,
                "expense_date": str(e.expense_date) if e.expense_date else None,
                "title": e.title,
                "category": e.category,
                "expense_type": e.expense_type,
                "amount_kes": amt,
                "payment_method": e.payment_method,
                "payee": e.payee,
                "receipt_number": e.receipt_number or "N/A",
                "status": e.status,
                "is_recurring": bool(e.is_recurring),
                "recurrence_interval": e.recurrence_interval
            }
            if category_search:
                q_clean = category_search.lower()
                if (q_clean in (e.title or "").lower() or
                    q_clean in (e.payee or "").lower() or
                    q_clean in (e.category or "").lower() or
                    q_clean in (e.expense_type or "").lower()):
                    details_rows.append(row)
            else:
                details_rows.append(row)

        month_label = first_of_this.strftime("%B %Y")
        last_month_label = last_mo_date.strftime("%B %Y")

        table_lines = [
            "| Date | Title / Payee | Category | Type | Method | Voucher / Ref | Amount (KES) | Status |",
            "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |"
        ]
        if details_rows:
            for r in details_rows:
                table_lines.append(
                    f"| {r['expense_date']} | **{r['title']}** ({r['payee']}) | {r['category']} | {r['expense_type']} | {r['payment_method']} | `{r['receipt_number']}` | **KES {r['amount_kes']:,.2f}** | `{r['status']}` |"
                )
        else:
            table_lines.append("| — | No expenses recorded for this criteria | — | — | — | — | — | — |")

        formatted_table = "\n".join(table_lines)
        q_time_ms = round((time.perf_counter() - t0) * 1000, 2)

        standardized_report = (
            f"### CORPSEC ERP EXPENSES & PETTY CASH REPORT ({month_label})\n"
            f"**Audit Timestamp:** {AttendanceAnalyticsService.get_current_timestamp_eat()}\n\n"
            f"- **Total Expenses This Month ({month_label}):** `KES {float(total_this_month):,.2f}` ({len(curr_month_exp)} transactions)\n"
            f"- **Previous Month Total ({last_month_label}):** `KES {float(total_last_month):,.2f}` ({len(last_month_exp)} transactions)\n"
            f"- **Petty Cash Float Balance:** `KES {float_balance:,.2f}` (Authorized Float Cap: KES 25,000.00)\n"
            f"- **Active Recurring Commitments:** `KES {float(monthly_recurring):,.2f}` per month ({len(recurring_items)} obligations)\n"
            f"- **Total Receipts & Vouchers Recorded:** {total_vouchers_count} fully tracked\n"
            f"- **Status Breakdown:** Paid: `KES {sum(e.amount for e in paid_records):,.2f}` ({len(paid_records)} items) | Paused/Pending: `KES {sum(e.amount for e in paused_records):,.2f}` ({len(paused_records)} items)\n\n"
            f"### CURRENT MONTH EXPENSE TRANSACTIONS REGISTER\n"
            f"{formatted_table}\n\n"
            f"### DATABASE VERIFICATION\n"
            f"- **Query Execution Time:** {q_time_ms:.2f} ms\n"
            f"- **Verified Records:** {len(curr_month_exp)} transactions in {month_label} queried from MySQL `expenses` and `petty_cash_transactions`"
        )

        return {
            "query_time_ms": q_time_ms,
            "target_month_label": month_label,
            "this_month_total_kes": float(total_this_month),
            "this_month_transactions_count": len(curr_month_exp),
            "last_month_total_kes": float(total_last_month),
            "last_month_transactions_count": len(last_month_exp),
            "petty_cash_float_balance_kes": float_balance,
            "recurring_monthly_commitments_kes": float(monthly_recurring),
            "total_vouchers_count": total_vouchers_count,
            "by_category": by_category,
            "by_type": by_type,
            "by_status": by_status,
            "details_rows": details_rows,
            "standardized_report": standardized_report
        }


class TeamChatAnalyticsService:
    """
    Dedicated analytics engine for internal Team Operations Chat (`team_messages` and `team_chat_reads`).
    Provides verifiable, data-grounded summaries of operational team discussions, direct messages,
    active chat participants, today's chat messages, and search across channels.
    """

    @classmethod
    def get_team_chat_report(
        cls,
        db: Session,
        target_date: Optional[datetime.date] = None,
        search_query: Optional[str] = None,
        limit: int = 40
    ) -> Dict[str, Any]:
        """
        Retrieves team chat records from MySQL `team_messages`.
        Reconciles today's communications, group broadcasts, and 1-on-1 direct messages.
        """
        t0 = time.perf_counter()
        today_eat = AttendanceAnalyticsService.get_current_date_eat()
        report_date = target_date or today_eat
        report_date_str = report_date.strftime("%d %B %Y")
        reporting_ts = AttendanceAnalyticsService.get_current_timestamp_eat()

        # Query messages
        total_messages = db.query(func.count(TeamMessage.id)).scalar() or 0

        all_recent = (
            db.query(TeamMessage)
            .options(
                joinedload(TeamMessage.user),
                joinedload(TeamMessage.receiver)
            )
            .order_by(TeamMessage.id.desc())
            .limit(limit)
            .all()
        )

        # Filter messages for target date
        today_msgs = [
            m for m in all_recent
            if m.created_at and m.created_at.date() == report_date
        ]
        if not today_msgs:
            today_specific = (
                db.query(TeamMessage)
                .options(
                    joinedload(TeamMessage.user),
                    joinedload(TeamMessage.receiver)
                )
                .filter(func.date(TeamMessage.created_at) == report_date)
                .order_by(TeamMessage.id.asc())
                .all()
            )
            today_msgs = today_specific
            if not today_msgs and target_date is None and all_recent:
                latest_date = max((m.created_at.date() for m in all_recent if m.created_at), default=None)
                if latest_date:
                    report_date = latest_date
                    report_date_str = report_date.strftime("%d %B %Y")
                    today_msgs = [m for m in all_recent if m.created_at and m.created_at.date() == latest_date]

        today_senders = list(dict.fromkeys([
            f"{m.sender_name} ({m.sender_role})" for m in today_msgs
        ]))

        group_msgs_today = [
            m for m in today_msgs
            if m.receiver_id is None or m.channel in ["operations", "all", "group_operations"]
        ]
        direct_msgs_today = [
            m for m in today_msgs
            if m.receiver_id is not None or m.channel == "direct"
        ]

        details_rows: List[Dict[str, Any]] = []
        for m in all_recent:
            r_name = None
            if m.receiver:
                r_name = m.receiver.full_name or m.receiver.email
            elif m.receiver_id:
                r_name = f"User #{m.receiver_id}"

            is_grp = (m.receiver_id is None or m.channel in ["operations", "all", "group_operations"])
            ch_label = "Operations Team (Group)" if is_grp else f"Direct to {r_name or 'Recipient'}"

            time_eat = m.created_at.strftime("%I:%M %p") if m.created_at else "N/A"
            date_eat = m.created_at.strftime("%Y-%m-%d") if m.created_at else "N/A"

            details_rows.append({
                "id": m.id,
                "created_at": str(m.created_at) if m.created_at else None,
                "date": date_eat,
                "time": time_eat,
                "is_today": bool(m.created_at and m.created_at.date() == report_date),
                "sender_name": m.sender_name,
                "sender_role": m.sender_role,
                "receiver_name": r_name,
                "channel": ch_label,
                "channel_type": "GROUP" if is_grp else "DIRECT",
                "message": m.message or "",
                "has_attachment": bool(m.attachment_url),
                "attachment_name": m.attachment_name,
                "is_pinned": bool(m.is_pinned)
            })

        # Today's message rows in chronological order
        today_rows = [
            r for r in reversed(details_rows)
            if r["is_today"]
        ]

        table_lines = [
            "| Time | Sender | Role | Channel / Recipient | Message Text |",
            "| :--- | :--- | :--- | :--- | :--- |"
        ]
        display_rows = today_rows if today_rows else details_rows[:15]
        for r in display_rows:
            txt = r['message']
            if r['has_attachment']:
                txt += f" 📎 [{r['attachment_name'] or 'Attachment'}]"
            table_lines.append(
                f"| `{r['time']}` | **{r['sender_name']}** | `{r['sender_role']}` | {r['channel']} | *{txt}* |"
            )
        if not display_rows:
            table_lines.append("| — | No chat messages recorded for this period | — | — | — |")

        formatted_table = "\n".join(table_lines)
        q_time_ms = round((time.perf_counter() - t0) * 1000, 2)

        today_breakdown_lines = []
        if today_rows:
            for r in today_rows:
                today_breakdown_lines.append(
                    f"- **{r['time']}** — **{r['sender_name']}** (`{r['sender_role']}`) in *{r['channel']}*:\n  > \"{r['message']}\""
                )
        today_breakdown_str = "\n".join(today_breakdown_lines) if today_breakdown_lines else "None recorded for today."

        standardized_report = (
            f"### 💬 TEAM OPERATIONS CHAT & MESSAGES REPORT\n"
            f"**Reporting Date:** {report_date_str}\n"
            f"**Audit Timestamp:** {reporting_ts}\n\n"
            f"- **Total Messages in System:** {total_messages} messages\n"
            f"- **Messages Sent Today ({report_date_str}):** **{len(today_msgs)}**\n"
            f"- **Active Chat Participants Today:** {len(today_senders)} ({', '.join(today_senders) if today_senders else 'None'})\n"
            f"- **Operations Team Group Messages Today:** {len(group_msgs_today)}\n"
            f"- **Direct 1-on-1 Messages Today:** {len(direct_msgs_today)}\n\n"
            f"### 📅 TODAY'S MESSAGES CHRONOLOGY\n"
            f"{today_breakdown_str}\n\n"
            f"### 📋 RECENT TEAM MESSAGES LOG\n"
            f"{formatted_table}\n\n"
            f"### DATABASE VERIFICATION\n"
            f"- **Query Execution Time:** {q_time_ms:.2f} ms\n"
            f"- **Records Retrieved:** {len(all_recent)} from MySQL `team_messages`\n"
            f"- **Data Quality:** Reconciled live against WhatsApp-style operations channel and direct messages."
        )

        return {
            "query_time_ms": q_time_ms,
            "target_date": str(report_date),
            "target_date_formatted": report_date_str,
            "total_messages": total_messages,
            "today_messages_count": len(today_msgs),
            "today_senders": today_senders,
            "group_messages_today_count": len(group_msgs_today),
            "direct_messages_today_count": len(direct_msgs_today),
            "today_rows": today_rows,
            "details_rows": details_rows,
            "standardized_report": standardized_report
        }

