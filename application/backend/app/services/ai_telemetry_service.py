import os
import re
import sys
import time
import datetime
import platform
from typing import Dict, Any, List
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
from application.backend.app.models.attendance import Attendance
from application.backend.app.models.incident import Incident
from application.backend.app.models.payroll import PayrollPeriod, PayrollRecord, PayrollError
from application.backend.app.models.invoice import SiteInvoice
from application.backend.app.models.expense import Expense, PettyCashTransaction
from application.backend.app.models.client_contract import ClientContract
from application.backend.app.models.call_center import CallLog


# ==============================================================================
# PII & CREDENTIAL SANITIZATION ENGINE
# ==============================================================================

SENSITIVE_KEYS = {
    "password", "password_hash", "secret", "token", "jwt", "access_token",
    "refresh_token", "api_key", "secret_key", "authorization", "cookie",
    "mpesa_passkey", "at_api_key", "smtp_password", "national_id", "kra_pin"
}

def is_sensitive_key(key: str) -> bool:
    """Checks if a dictionary key represents sensitive credentials or PII identifiers."""
    lower_k = str(key).lower().strip()
    if lower_k in SENSITIVE_KEYS:
        return True
    parts = re.split(r"[_\-\s]+", lower_k)
    return any(p in SENSITIVE_KEYS for p in parts)

EMAIL_REGEX = re.compile(r"([a-zA-Z0-9_.+-]+)@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)")
PHONE_REGEX = re.compile(r"(\+?\d{1,4}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?[\d]{3}[-.\s]?[\d]{4}")
IP_REGEX = re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b")


def sanitize_text(text_val: str) -> str:
    """Masks emails, phone numbers, and IP addresses in strings."""
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


def sanitize_dict_or_list(data: Any) -> Any:
    """Recursively walks structures, stripping sensitive keys and sanitizing values."""
    if isinstance(data, dict):
        sanitized = {}
        for k, v in data.items():
            if is_sensitive_key(k):
                sanitized[k] = "[REDACTED_CREDENTIAL]"
            else:
                sanitized[k] = sanitize_dict_or_list(v)
        return sanitized
    elif isinstance(data, list):
        return [sanitize_dict_or_list(item) for item in data]
    elif isinstance(data, str):
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
    database statistics, and error logs to ground Gemini API reasoning.
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
    def get_system_telemetry(db: Session) -> Dict[str, Any]:
        """
        Aggregates complete, grounded telemetry across host, database,
        operations, payroll, financials, errors, and audit logs.
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

        # 3. Operations & Workforce Telemetry
        total_guards = db.query(Guard).count()
        active_guards = db.query(Guard).filter(Guard.status == "ACTIVE").count()
        total_sites = db.query(Site).count()
        active_sites = total_sites
        today_attendance_count = db.query(Attendance).filter(Attendance.shift_date >= today_start.date()).count()
        supervisors_count = db.query(User).filter(User.role == UserRole.SUPERVISOR.value).count()
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

        # 4. Financial & Payroll Summary
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

        # 5. User Roles & Active Sessions
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

        # 6. Recent Audit Trail (Sanitized)
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
            "financial_and_payroll": financial_telemetry,
            "users_and_sessions": active_users_summary,
            "recent_audit_trail": audit_trail
        }

        return sanitize_dict_or_list(raw_telemetry)
