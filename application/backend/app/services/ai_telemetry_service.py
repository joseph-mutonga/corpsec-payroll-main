import os
import re
import sys
import time
import datetime
import platform
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text, func

try:
    import psutil
except ImportError:
    psutil = None

from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.user_session import UserSession
from application.backend.app.models.audit import AuditLog
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.shift import Shift
from application.backend.app.models.attendance import Attendance
from application.backend.app.models.incident import Incident
from application.backend.app.models.payroll import PayrollPeriod, PayrollRecord, PayrollError
from application.backend.app.models.invoice import SiteInvoice
from application.backend.app.models.expense import Expense, PettyCashTransaction
from application.backend.app.models.client_contract import ClientContract, Client
from application.backend.app.models.call_center import CallLog


# ==============================================================================
# PII & CREDENTIAL SANITIZATION ENGINE
# ==============================================================================

SENSITIVE_KEYS = {
    "password", "password_hash", "secret", "token", "jwt", "access_token",
    "refresh_token", "api_key", "secret_key", "authorization", "cookie",
    "mpesa_passkey", "at_api_key", "smtp_password"
}

# Legitimate business entities that must remain fully legible for authenticated admins & AI
EXEMPT_OPERATIONAL_KEYS = {
    "full_name", "guard_name", "supervisor_name", "email", "phone",
    "contact_person", "client_name", "site_name", "assigned_supervisor",
    "supervisor_phone", "emergency_contact_name", "employee_number"
}

def is_sensitive_key(key: str) -> bool:
    """Checks if a dictionary key represents sensitive credentials or tokens."""
    lower_k = str(key).lower().strip()
    if lower_k in SENSITIVE_KEYS:
        return True
    parts = re.split(r"[_\-\s]+", lower_k)
    return any(p in SENSITIVE_KEYS for p in parts)

EMAIL_REGEX = re.compile(r"([a-zA-Z0-9_.+-]+)@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)")
IP_REGEX = re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b")


def sanitize_text(text_val: str) -> str:
    """Masks emails and IP addresses in arbitrary strings while preserving operational data."""
    if not isinstance(text_val, str):
        return text_val
    # Mask emails: e.g. j***@corpsec.co.ke
    def mask_email(match):
        user, domain = match.group(1), match.group(2)
        masked_user = user[0] + "***" if len(user) > 1 else "***"
        return f"{masked_user}@{domain}"
    
    text_val = EMAIL_REGEX.sub(mask_email, text_val)
    # Mask IPs
    text_val = IP_REGEX.sub("***.***.***.***", text_val)
    return text_val


def sanitize_dict_or_list(data: Any, current_key: Optional[str] = None) -> Any:
    """
    Recursively walks structures, redacting sensitive keys and sanitizing values,
    while strictly preserving operational business entities (guard & supervisor names, phones, emails).
    """
    if isinstance(data, dict):
        sanitized = {}
        for k, v in data.items():
            if is_sensitive_key(k):
                sanitized[k] = "[REDACTED_CREDENTIAL]"
            elif str(k).lower() in EXEMPT_OPERATIONAL_KEYS:
                # Operational attributes remain fully preserved
                sanitized[k] = v
            else:
                sanitized[k] = sanitize_dict_or_list(v, current_key=k)
        return sanitized
    elif isinstance(data, list):
        return [sanitize_dict_or_list(item, current_key=current_key) for item in data]
    elif isinstance(data, str):
        if current_key and str(current_key).lower() in EXEMPT_OPERATIONAL_KEYS:
            return data
        return sanitize_text(data)
    elif isinstance(data, (int, float, bool)) or data is None:
        return data
    else:
        return str(data)


# ==============================================================================
# REAL-TIME SYSTEM TELEMETRY CONTEXT AGGREGATOR (STRICTLY READ-ONLY)
# ==============================================================================

class AITelemetryService:
    """
    Collects real-time, read-only operational telemetry, performance metrics,
    and complete database entity registers to ground Gemini AI Assistant reasoning.
    """

    @staticmethod
    def get_host_telemetry() -> Dict[str, Any]:
        """Collects server-level performance: CPU, RAM, Disk, and Process Uptime."""
        metrics = {
            "os": platform.system(),
            "os_release": platform.release(),
            "python_version": sys.version.split()[0],
            "timestamp": datetime.datetime.now().isoformat()
        }

        if psutil:
            try:
                vm = psutil.virtual_memory()
                metrics["cpu_percent"] = psutil.cpu_percent(interval=0.05)
                metrics["cpu_cores_logical"] = psutil.cpu_count(logical=True)
                metrics["cpu_cores_physical"] = psutil.cpu_count(logical=False)
                metrics["memory_total_mb"] = round(vm.total / (1024 * 1024), 2)
                metrics["memory_used_mb"] = round(vm.used / (1024 * 1024), 2)
                metrics["memory_available_mb"] = round(vm.available / (1024 * 1024), 2)
                metrics["memory_percent"] = vm.percent

                disk = psutil.disk_usage(os.path.abspath(os.sep))
                metrics["disk_total_gb"] = round(disk.total / (1024 ** 3), 2)
                metrics["disk_used_gb"] = round(disk.used / (1024 ** 3), 2)
                metrics["disk_free_gb"] = round(disk.free / (1024 ** 3), 2)
                metrics["disk_percent"] = disk.percent

                # Process specific metrics
                proc = psutil.Process(os.getpid())
                metrics["process_memory_rss_mb"] = round(proc.memory_info().rss / (1024 * 1024), 2)
                metrics["process_threads"] = proc.num_threads()
                metrics["process_uptime_seconds"] = int(time.time() - proc.create_time())
            except Exception as e:
                metrics["telemetry_warning"] = f"Partial host metric collection: {str(e)}"
        else:
            metrics["notice"] = "psutil not available; basic runtime info provided."

        return metrics

    @staticmethod
    def get_database_telemetry(db: Session) -> Dict[str, Any]:
        """Measures database ping latency and retrieves live engine status variables."""
        db_metrics = {
            "dialect": db.bind.dialect.name if db.bind else "unknown",
            "latency_ms": 0.0,
            "status_vars": {}
        }

        try:
            # Measure DB Ping Latency
            t0 = time.perf_counter()
            db.execute(text("SELECT 1"))
            db_metrics["latency_ms"] = round((time.perf_counter() - t0) * 1000, 2)

            # Query MySQL status variables if dialect is MySQL
            if "mysql" in str(db_metrics["dialect"]).lower():
                status_keys = [
                    "Threads_connected", "Threads_running", "Uptime", "Questions",
                    "Slow_queries", "Open_tables", "Table_locks_waited", "Max_used_connections"
                ]
                quoted_keys = ", ".join([f"'{k}'" for k in status_keys])
                rows = db.execute(text(f"SHOW STATUS WHERE Variable_name IN ({quoted_keys})")).fetchall()
                db_metrics["status_vars"] = {r[0]: int(r[1]) if str(r[1]).isdigit() else str(r[1]) for r in rows}
        except Exception as e:
            db_metrics["error"] = str(e)

        return db_metrics

    @staticmethod
    def search_database_entities(db: Session, query_text: str) -> Dict[str, Any]:
        """
        Smart keyword search across Guards, Supervisors, Sites, Incidents, and Contracts.
        Returns matching records to directly answer targeted queries.
        """
        if not query_text or not query_text.strip():
            return {}

        raw_tokens = re.findall(r"\w+", query_text.lower())
        stopwords = {
            "what", "who", "which", "where", "when", "why", "how", "are", "is",
            "the", "a", "an", "and", "or", "to", "in", "at", "for", "from",
            "of", "on", "with", "by", "all", "list", "show", "give", "me", "tell",
            "assigned", "their", "them", "names", "data", "database", "information"
        }
        tokens = [t for t in raw_tokens if len(t) >= 2 and t not in stopwords]
        if not tokens:
            return {}

        results = {
            "matched_guards": [],
            "matched_supervisors": [],
            "matched_sites": [],
            "matched_incidents": []
        }

        # 1. Guards search
        guards = db.query(Guard).all()
        for g in guards:
            site_name = g.site.site_name if g.site else ""
            shift_name = g.shift.name if g.shift else ""
            sup_name = (g.supervisor.full_name or g.supervisor.email) if g.supervisor else ""
            g_str = f"{g.full_name} {g.employee_number} {g.phone} {g.status} {site_name} {shift_name} {sup_name}".lower()
            if any(t in g_str for t in tokens):
                results["matched_guards"].append({
                    "employee_number": g.employee_number,
                    "full_name": g.full_name,
                    "phone": g.phone,
                    "status": g.status,
                    "assigned_site": site_name or "Unassigned",
                    "assigned_shift": shift_name or "Unassigned",
                    "supervisor": sup_name or "Unassigned",
                    "basic_salary_kes": round(float(g.effective_basic_salary), 2)
                })

        # 2. Supervisors search
        supervisors = db.query(User).filter(User.role == UserRole.SUPERVISOR.value).all()
        for s in supervisors:
            assigned_guards = [
                f"{g.full_name} ({g.employee_number})" for g in guards if g.supervisor_id == s.id
            ]
            assigned_sites = [
                st.site_name for st in db.query(Site).filter(Site.supervisor_id == s.id).all()
            ]
            s_str = f"{s.full_name or ''} {s.email} {s.phone} {' '.join(assigned_sites)} {' '.join(assigned_guards)}".lower()
            if any(t in s_str for t in tokens):
                results["matched_supervisors"].append({
                    "id": s.id,
                    "full_name": s.full_name or s.email,
                    "email": s.email,
                    "phone": s.phone,
                    "status": s.status,
                    "assigned_sites": assigned_sites,
                    "assigned_guards_count": len(assigned_guards),
                    "assigned_guards": assigned_guards
                })

        # 3. Sites search
        sites = db.query(Site).all()
        for st in sites:
            st_guards = [f"{g.full_name} ({g.employee_number})" for g in (st.guards or [])]
            sup_name = (st.supervisor.full_name or st.supervisor.email) if st.supervisor else "Unassigned"
            st_str = f"{st.site_name} {st.location} {st.client_name} {sup_name} {' '.join(st_guards)}".lower()
            if any(t in st_str for t in tokens):
                results["matched_sites"].append({
                    "id": st.id,
                    "site_name": st.site_name,
                    "location": st.location,
                    "client_name": st.client_name,
                    "supervisor": sup_name,
                    "stationed_guards_count": len(st_guards),
                    "stationed_guards": st_guards,
                    "daily_rate_kes": round(float(st.daily_rate), 2) if st.daily_rate else 1200.0
                })

        # 4. Incidents search
        incidents = db.query(Incident).order_by(Incident.id.desc()).limit(20).all()
        for inc in incidents:
            g_name = inc.guard.full_name if inc.guard else ""
            s_name = inc.site.site_name if inc.site else ""
            inc_str = f"{inc.reference_number} {inc.incident_type} {g_name} {s_name} {inc.description} {inc.status}".lower()
            if any(t in inc_str for t in tokens):
                results["matched_incidents"].append({
                    "reference_number": inc.reference_number,
                    "incident_type": inc.incident_type,
                    "guard": g_name,
                    "site": s_name,
                    "date": str(inc.incident_date),
                    "status": inc.status,
                    "description": inc.description
                })

        return results

    @staticmethod
    def get_system_telemetry(db: Session, user_query: Optional[str] = None) -> Dict[str, Any]:
        """
        Aggregates complete, grounded telemetry across host, database,
        operations, workforce registries, payroll, financials, errors, and audit logs.
        All queries are strictly read-only.
        """
        now = datetime.datetime.now()
        today_start = datetime.datetime(now.year, now.month, now.day)

        # 1. Host and DB
        host_telemetry = AITelemetryService.get_host_telemetry()
        db_telemetry = AITelemetryService.get_database_telemetry(db)

        # 2. Error Rates & Anomaly Tracking
        unresolved_payroll_errors = db.query(PayrollError).count()
        recent_errors = (
            db.query(PayrollError)
            .order_by(PayrollError.id.desc())
            .limit(5)
            .all()
        )
        held_records_count = db.query(PayrollRecord).filter(PayrollRecord.is_on_hold == True).count()
        open_incidents_count = db.query(Incident).filter(Incident.status.in_(["OPEN", "INVESTIGATING", "ESCALATED"])).count()
        critical_incidents_count = db.query(Incident).filter(
            (Incident.incident_type.ilike("%critical%") | Incident.incident_type.ilike("%theft%") | Incident.incident_type.ilike("%breach%")),
            Incident.status.in_(["OPEN", "INVESTIGATING", "ESCALATED"])
        ).count()
        missed_calls_today = db.query(CallLog).filter(
            CallLog.status == "MISSED",
            CallLog.created_at >= today_start
        ).count()

        error_rates = {
            "unresolved_payroll_errors_total": unresolved_payroll_errors,
            "payroll_records_on_hold": held_records_count,
            "open_security_incidents_total": open_incidents_count,
            "critical_or_high_severity_incidents": critical_incidents_count,
            "missed_call_center_calls_today": missed_calls_today,
            "recent_payroll_error_samples": [
                {
                    "id": err.id,
                    "guard_name": getattr(err.guard, "full_name", "Guard") if getattr(err, "guard", None) else "System",
                    "error_type": err.error_type,
                    "description": err.error_message if hasattr(err, "error_message") else getattr(err, "description", ""),
                    "resolved": bool(getattr(err, "resolved_at", None))
                } for err in recent_errors
            ]
        }

        # 3. Operations & Workforce Telemetry (Summary Counts)
        guards_all = db.query(Guard).all()
        total_guards = len(guards_all)
        active_guards = len([g for g in guards_all if g.status == "ACTIVE"])
        sites_all = db.query(Site).all()
        total_sites = len(sites_all)
        active_sites = total_sites
        today_attendance_count = db.query(Attendance).filter(Attendance.shift_date >= today_start.date()).count()
        supervisors_all = db.query(User).filter(User.role == UserRole.SUPERVISOR.value).all()
        supervisors_count = len(supervisors_all)
        total_call_logs_today = db.query(CallLog).filter(CallLog.created_at >= today_start).count()

        operations_telemetry = {
            "total_guards_registered": total_guards,
            "active_guards_on_duty_roster": active_guards,
            "total_client_sites": total_sites,
            "active_client_sites": active_sites,
            "today_attendance_punches_logged": today_attendance_count,
            "active_field_supervisors": supervisors_count,
            "call_center_calls_handled_today": total_call_logs_today
        }

        # 4. Detailed Database Registries
        # 4A. Guards Register
        guards_register = [
            {
                "id": g.id,
                "employee_number": g.employee_number,
                "full_name": g.full_name,
                "phone": g.phone,
                "email": g.email or "",
                "status": g.status,
                "gender": g.gender,
                "hire_date": str(g.hire_date) if g.hire_date else None,
                "assigned_site": g.site.site_name if g.site else "Unassigned",
                "assigned_shift": g.shift.name if g.shift else "Unassigned",
                "shift_type": g.shift.shift_type if g.shift else "N/A",
                "supervisor_name": (g.supervisor.full_name or g.supervisor.email) if g.supervisor else "Unassigned",
                "supervisor_phone": g.supervisor.phone if g.supervisor else "N/A",
                "basic_salary_kes": round(float(g.effective_basic_salary), 2),
                "is_super_guard": bool(g.is_super_guard),
                "is_reliever": bool(g.is_reliever),
                "payment_method": g.payment_method,
                "bank_name": g.bank_name or "N/A"
            }
            for g in guards_all
        ]

        # 4B. Supervisors Register
        supervisors_register = []
        for s in supervisors_all:
            assigned_guards_list = [
                {
                    "full_name": g.full_name,
                    "employee_number": g.employee_number,
                    "phone": g.phone,
                    "assigned_site": g.site.site_name if g.site else "Unassigned"
                }
                for g in guards_all if g.supervisor_id == s.id
            ]
            assigned_sites_list = [
                st.site_name for st in sites_all if st.supervisor_id == s.id
            ]
            supervisors_register.append({
                "id": s.id,
                "full_name": s.full_name or s.email,
                "email": s.email,
                "phone": s.phone,
                "status": s.status,
                "assigned_sites": assigned_sites_list,
                "assigned_guards_count": len(assigned_guards_list),
                "assigned_guards": assigned_guards_list
            })

        # 4C. Client Sites Register
        client_sites_register = []
        for st in sites_all:
            st_guards = [
                {
                    "full_name": g.full_name,
                    "employee_number": g.employee_number,
                    "phone": g.phone,
                    "shift": g.shift.name if g.shift else "Unassigned",
                    "status": g.status
                }
                for g in (st.guards or [])
            ]
            sup_name = (st.supervisor.full_name or st.supervisor.email) if st.supervisor else "Unassigned"
            sup_phone = st.supervisor.phone if st.supervisor else "N/A"
            client_sites_register.append({
                "id": st.id,
                "site_name": st.site_name,
                "location": st.location,
                "client_name": st.client_name,
                "assigned_supervisor": sup_name,
                "supervisor_phone": sup_phone,
                "stationed_guards_count": len(st_guards),
                "stationed_guards": st_guards,
                "daily_rate_kes": round(float(st.daily_rate), 2) if st.daily_rate else 1200.0,
                "basic_salary_kes": round(float(st.basic_salary), 2) if st.basic_salary else 15000.0
            })

        # 4D. Shifts Register
        shifts_all = db.query(Shift).all()
        shifts_register = [
            {
                "id": sh.id,
                "name": sh.name,
                "shift_type": sh.shift_type,
                "start_time": sh.start_time,
                "end_time": sh.end_time,
                "is_night_shift": bool(sh.is_night_shift),
                "duration_hours": sh.duration_hours
            }
            for sh in shifts_all
        ]

        # 4E. Client Contracts Register
        contracts_all = db.query(ClientContract).all()
        client_contracts_register = [
            {
                "contract_ref": c.contract_ref,
                "client_name": c.client.name if c.client else "N/A",
                "title": c.title,
                "status": c.status,
                "monthly_charge_kes": round(float(c.monthly_charge), 2) if c.monthly_charge else 0.0,
                "guards_required": c.guards_required,
                "supervisors_required": c.supervisors_required,
                "start_date": str(c.start_date) if c.start_date else None,
                "end_date": str(c.end_date) if c.end_date else None
            }
            for c in contracts_all
        ]

        # 4F. Recent Incidents Register
        incidents_all = db.query(Incident).order_by(Incident.id.desc()).limit(15).all()
        recent_incidents_register = [
            {
                "reference_number": inc.reference_number,
                "incident_type": inc.incident_type,
                "guard_name": inc.guard.full_name if inc.guard else "N/A",
                "site_name": inc.site.site_name if inc.site else "N/A",
                "incident_date": str(inc.incident_date) if inc.incident_date else None,
                "incident_time": inc.incident_time,
                "status": inc.status,
                "description": inc.description
            }
            for inc in incidents_all
        ]

        # 4G. Recent Attendance Register
        attendances_all = db.query(Attendance).order_by(Attendance.id.desc()).limit(20).all()
        recent_attendance_register = [
            {
                "id": att.id,
                "guard_name": att.guard.full_name if att.guard else "N/A",
                "employee_number": att.guard.employee_number if att.guard else "N/A",
                "site_name": att.site.site_name if att.site else "N/A",
                "shift_name": att.shift.name if att.shift else "N/A",
                "shift_date": str(att.shift_date) if att.shift_date else None,
                "status": att.status,
                "clock_in": att.actual_clock_in.strftime("%H:%M") if att.actual_clock_in else None,
                "clock_out": att.actual_clock_out.strftime("%H:%M") if att.actual_clock_out else None,
                "regular_hours": att.regular_hours,
                "overtime_hours": att.overtime_hours
            }
            for att in attendances_all
        ]

        # 4H. Targeted Database Matches (if user query provided)
        targeted_matches = {}
        if user_query:
            try:
                targeted_matches = AITelemetryService.search_database_entities(db, user_query)
            except Exception as e:
                targeted_matches = {"error": f"Search execution: {str(e)}"}

        # 5. Financial & Payroll Summary
        active_contracts = db.query(ClientContract).filter(ClientContract.status == "ACTIVE").count()
        mrr_sum = db.query(func.coalesce(func.sum(ClientContract.monthly_charge), 0.0)).filter(ClientContract.status == "ACTIVE").scalar() or 0.0
        
        latest_payroll_period = db.query(PayrollPeriod).order_by(PayrollPeriod.id.desc()).first()
        latest_period_info = None
        if latest_payroll_period:
            gross_sum = db.query(func.coalesce(func.sum(PayrollRecord.gross_pay), 0.0)).filter(PayrollRecord.payroll_period_id == latest_payroll_period.id).scalar() or 0.0
            net_sum = db.query(func.coalesce(func.sum(PayrollRecord.net_pay), 0.0)).filter(PayrollRecord.payroll_period_id == latest_payroll_period.id).scalar() or 0.0
            emp_count = db.query(PayrollRecord).filter(PayrollRecord.payroll_period_id == latest_payroll_period.id).count()
            latest_period_info = {
                "period_id": latest_payroll_period.id,
                "period_name": f"{latest_payroll_period.month}/{latest_payroll_period.year}",
                "status": latest_payroll_period.status,
                "employees_processed": emp_count,
                "total_gross_pay_kes": round(float(gross_sum), 2),
                "total_net_pay_kes": round(float(net_sum), 2)
            }

        unpaid_invoices_count = db.query(SiteInvoice).filter(SiteInvoice.status.in_(["DRAFT", "PENDING", "OVERDUE", "ISSUED"])).count()
        overdue_invoices_count = db.query(SiteInvoice).filter(SiteInvoice.status == "OVERDUE").count()
        unpaid_invoices_amount = db.query(func.coalesce(func.sum(SiteInvoice.total_amount), 0.0)).filter(SiteInvoice.status.in_(["PENDING", "OVERDUE", "ISSUED"])).scalar() or 0.0

        current_month_expenses = db.query(func.coalesce(func.sum(Expense.amount), 0.0)).filter(
            Expense.expense_date >= today_start.replace(day=1).date()
        ).scalar() or 0.0

        financial_telemetry = {
            "active_client_contracts": active_contracts,
            "monthly_recurring_revenue_mrr_kes": round(float(mrr_sum), 2),
            "latest_payroll_cycle": latest_period_info,
            "unpaid_site_invoices_count": unpaid_invoices_count,
            "overdue_invoices_count": overdue_invoices_count,
            "unpaid_invoices_amount_kes": round(float(unpaid_invoices_amount), 2),
            "month_to_date_recurrent_expenses_kes": round(float(current_month_expenses), 2)
        }

        # 6. User Roles & Active Sessions
        total_users = db.query(User).count()
        admin_count = db.query(User).filter(User.role == UserRole.ADMIN.value).count()
        staff_count = db.query(User).filter(User.role == UserRole.STAFF.value).count()
        active_sessions_count = db.query(UserSession).filter(UserSession.is_active == True).count()

        active_users_summary = {
            "total_system_users": total_users,
            "administrators_count": admin_count,
            "supervisors_count": supervisors_count,
            "finance_hr_staff_count": staff_count,
            "currently_active_authenticated_sessions": active_sessions_count
        }

        # 7. Recent Audit Trail (Sanitized)
        recent_audits = (
            db.query(AuditLog)
            .order_by(AuditLog.id.desc())
            .limit(12)
            .all()
        )
        audit_trail = [
            {
                "id": a.id,
                "action": a.action,
                "target_entity": a.target_entity,
                "role": a.role,
                "reason": sanitize_text(a.reason or ""),
                "timestamp": a.timestamp.isoformat() if hasattr(a, "timestamp") and a.timestamp else None
            } for a in recent_audits
        ]

        raw_telemetry = {
            "telemetry_timestamp": now.isoformat(),
            "host_performance": host_telemetry,
            "database_telemetry": db_telemetry,
            "error_rates_and_alerts": error_rates,
            "workforce_and_operations": operations_telemetry,
            "guards_register": guards_register,
            "supervisors_register": supervisors_register,
            "client_sites_register": client_sites_register,
            "shifts_register": shifts_register,
            "client_contracts_register": client_contracts_register,
            "recent_incidents_register": recent_incidents_register,
            "recent_attendance_register": recent_attendance_register,
            "targeted_database_matches": targeted_matches,
            "financial_and_payroll": financial_telemetry,
            "users_and_sessions": active_users_summary,
            "recent_audit_trail": audit_trail
        }

        return sanitize_dict_or_list(raw_telemetry)
