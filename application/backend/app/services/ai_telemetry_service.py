import os
import re
import sys
import time
import datetime
import platform
import threading
from decimal import Decimal
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import text, func, or_, desc

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
from application.backend.app.models.call_center import CallLog, PhoneNumber, CallQueue, AgentStatus
from application.backend.app.models.salary_advance import SalaryAdvance
from application.backend.app.models.asset import Asset, AssetCategory, AssetAllocation
from application.backend.app.models.leave import LeaveRequest
from application.backend.app.services.erp_analytics_service import (
    AttendanceAnalyticsService,
    OvertimeAnalyticsService,
    SalaryAdvancesAnalyticsService,
    AssetsInventoryAnalyticsService,
    CallCenterAnalyticsService,
    InvoicesAnalyticsService,
    ContractsAnalyticsService
)


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
# INTELLIGENT QUESTION ROUTING & CLASSIFICATION
# ==============================================================================

class QuestionCategory:
    SIMPLE = "SIMPLE"
    WORKFORCE = "WORKFORCE"
    PAYROLL = "PAYROLL"
    MANAGEMENT = "MANAGEMENT"
    COMPLEX = "COMPLEX"


def classify_user_query(prompt: Optional[str]) -> str:
    """
    Classifies inquiries into 5 distinct operational domains:
    A. SIMPLE: health pings, greetings, host metrics (CPU/RAM/Disk), status checks.
    B. WORKFORCE: security guards, field supervisors, shifts, deployments, sites.
    C. PAYROLL: wages, mid-month advances, overtime, statutory deductions (NSSF, SHIF, Housing Levy, PAYE).
    D. MANAGEMENT: client contracts, MRR, invoices, commercial performance, recurrent expenditure.
    E. COMPLEX: error rates, incident spikes, bottlenecks, multi-domain analytics.
    """
    if not prompt or not prompt.strip():
        return QuestionCategory.SIMPLE

    p = prompt.strip().lower()

    # 1. Greetings & System Pings
    simple_exact = {
        "hi", "hello", "hey", "ping", "status", "health", "system health", "test",
        "help", "who are you", "what can you do", "system status", "uptime", "how are you"
    }
    if p in simple_exact or any(p.startswith(g) for g in ["hi ", "hello ", "hey ", "good morning", "good afternoon", "good evening"]):
        return QuestionCategory.SIMPLE

    # 2. Host infrastructure & hardware questions (only if no payroll/workforce entities are mentioned)
    host_terms = ["cpu", "ram", "memory", "disk", "ping latency", "database latency", "server uptime", "mysql threads"]
    business_entities = ["guard", "supervisor", "salary", "payroll", "invoice", "incident", "contract"]
    if any(h in p for h in host_terms) and not any(w in p for w in business_entities):
        return QuestionCategory.SIMPLE

    # 3. Security Workforce & Attendance Operations (check before generic payroll if attendance mentioned)
    workforce_terms = [
        "guard", "guards", "supervisor", "supervisors", "shift", "shifts",
        "roster", "attendance", "clock in", "clock-in", "clock out", "clock-out",
        "duty", "on duty", "who is on duty", "deployment", "station",
        "client site", "site", "sites", "absent", "absence", "leave",
        "present", "attended", "who attended", "guards present"
    ]
    if any(w in p for w in workforce_terms):
        return QuestionCategory.WORKFORCE

    # 4. Payroll & Statutory Deductions
    payroll_terms = [
        "payroll", "salary", "salaries", "pay", "payslip", "advance", "advances",
        "nssf", "shif", "nhif", "housing levy", "levy", "tax", "paye", "relief",
        "personal relief", "deduction", "deductions", "gross pay", "net pay",
        "disbursement", "remittance", "statutory", "allowance", "overtime pay",
        "overtime", "ot", "basic salary", "effective salary", "salary advance"
    ]
    if any(w in p for w in payroll_terms):
        return QuestionCategory.PAYROLL

    # 5. Management & Commercial Financials
    mgmt_terms = [
        "mrr", "revenue", "monthly recurring revenue", "contract", "contracts",
        "client", "clients", "invoice", "invoices", "billing", "profit",
        "expense", "expenses", "petty cash", "expenditure", "director", "commercial", "turnover"
    ]
    if any(w in p for w in mgmt_terms):
        return QuestionCategory.MANAGEMENT

    # 6. Default to Complex Analytical
    return QuestionCategory.COMPLEX


# ==============================================================================
# SAFE IN-MEMORY TELEMETRY CACHE (READ-ONLY, ROLE-ISOLATED, AUTO-EXPIRING)
# ==============================================================================

class SafeTelemetryCache:
    """
    Lightweight, thread-safe in-memory cache for repeated read-only queries and telemetry snapshots.
    Guarantees role isolation (strictly ADMIN).
    Never caches passwords, tokens, OTPs, or authentication credentials.
    """
    def __init__(self, default_ttl_seconds: int = 60):
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()
        self.default_ttl = default_ttl_seconds

    def _make_key(self, category: str, query: str, user_role: str = "ADMIN") -> str:
        clean_q = re.sub(r"\s+", " ", (query or "").strip().lower())
        return f"{user_role}:{category}:{clean_q}"

    def get(self, category: str, query: str = "", user_role: str = "ADMIN") -> Optional[Dict[str, Any]]:
        key = self._make_key(category, query, user_role)
        now_ts = time.time()
        with self._lock:
            entry = self._cache.get(key)
            if not entry:
                return None
            if entry["expires_at"] < now_ts:
                del self._cache[key]
                return None
            # Return deepcopy of data so caller modifications don't corrupt cache
            return dict(entry["data"])

    def set(self, category: str, query: str = "", data: Dict[str, Any] = None, ttl_seconds: Optional[int] = None, user_role: str = "ADMIN") -> None:
        if data is None:
            return
        key = self._make_key(category, query, user_role)
        ttl = ttl_seconds if ttl_seconds is not None else self.default_ttl
        now_ts = time.time()
        with self._lock:
            # Housekeeping: evict stale entries if size exceeds limit
            if len(self._cache) > 150:
                expired = [k for k, v in self._cache.items() if v["expires_at"] < now_ts]
                for k in expired:
                    del self._cache[k]
            self._cache[key] = {
                "data": dict(data),
                "created_at": now_ts,
                "expires_at": now_ts + ttl,
                "role": user_role
            }

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()


global_telemetry_cache = SafeTelemetryCache(default_ttl_seconds=60)


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
            "matched_incidents": [],
            "matched_salary_advances": [],
            "matched_assets": [],
            "matched_invoices": [],
            "matched_contracts": [],
            "matched_calls": [],
            "matched_leave_requests": []
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

        # 5. Salary Advances search
        advances = db.query(SalaryAdvance).options(joinedload(SalaryAdvance.guard), joinedload(SalaryAdvance.staff)).all()
        for sa in advances:
            b_name = sa.guard.full_name if sa.guard else (sa.staff.full_name if sa.staff else "")
            emp_no = sa.guard.employee_number if sa.guard else ""
            sa_str = f"{sa.advance_reference} {b_name} {emp_no} {sa.payment_method} {sa.reference_number or ''} {sa.status} {sa.reason or ''}".lower()
            if any(t in sa_str for t in tokens):
                results["matched_salary_advances"].append({
                    "advance_reference": sa.advance_reference,
                    "beneficiary": b_name,
                    "employee_number": emp_no,
                    "amount_kes": float(sa.amount),
                    "disbursement_date": str(sa.disbursement_date) if sa.disbursement_date else None,
                    "payment_method": sa.payment_method,
                    "reference_number": sa.reference_number or "N/A",
                    "status": sa.status,
                    "reason": sa.reason or "Emergency personal advance"
                })

        # 6. Assets & Inventory search
        assets = db.query(Asset).options(joinedload(Asset.category), joinedload(Asset.assigned_employee), joinedload(Asset.assigned_site)).all()
        for ast in assets:
            cat_name = ast.category.name if ast.category else ""
            g_name = ast.assigned_employee.full_name if ast.assigned_employee else ""
            st_name = ast.assigned_site.site_name if ast.assigned_site else ""
            ast_str = f"{ast.asset_tag} {ast.name} {cat_name} {ast.make_model or ''} {ast.serial_number or ''} {ast.status} {ast.condition} {g_name} {st_name}".lower()
            if any(t in ast_str for t in tokens):
                results["matched_assets"].append({
                    "asset_tag": ast.asset_tag,
                    "name": ast.name,
                    "category": cat_name,
                    "current_value_kes": float(ast.current_value),
                    "condition": ast.condition,
                    "status": ast.status,
                    "assigned_to": g_name or st_name or "Unassigned",
                    "location": ast.location_branch or "Head Office"
                })

        # 7. Invoices search
        invoices = db.query(SiteInvoice).all()
        for inv in invoices:
            inv_str = f"{inv.invoice_number} {inv.client_name} {inv.site_name} {inv.billing_period} {inv.status}".lower()
            if any(t in inv_str for t in tokens):
                results["matched_invoices"].append({
                    "invoice_number": inv.invoice_number,
                    "client_name": inv.client_name,
                    "site_name": inv.site_name,
                    "billing_period": inv.billing_period,
                    "total_amount_kes": float(inv.total_amount),
                    "due_date": str(inv.due_date) if inv.due_date else None,
                    "status": inv.status
                })

        # 8. Client Contracts search
        contracts = db.query(ClientContract).options(joinedload(ClientContract.client)).all()
        for c in contracts:
            c_name = c.client.name if c.client else ""
            ctr_str = f"{c.contract_ref} {c_name} {c.title} {c.contract_type} {c.status}".lower()
            if any(t in ctr_str for t in tokens):
                results["matched_contracts"].append({
                    "contract_ref": c.contract_ref,
                    "client_name": c_name,
                    "title": c.title,
                    "monthly_charge_kes": float(c.monthly_charge or 0),
                    "guards_required": c.guards_required,
                    "status": c.status
                })

        # 9. Call Logs search
        call_logs = db.query(CallLog).order_by(CallLog.id.desc()).limit(30).all()
        for cl in call_logs:
            cl_str = f"{cl.call_sid} {cl.caller_number} {cl.caller_name or ''} {cl.recipient_number} {cl.status} {cl.disposition or ''}".lower()
            if any(t in cl_str for t in tokens):
                results["matched_calls"].append({
                    "call_sid": cl.call_sid,
                    "direction": cl.direction,
                    "caller": cl.caller_number,
                    "recipient": cl.recipient_number,
                    "duration_seconds": cl.duration_seconds,
                    "status": cl.status,
                    "disposition": cl.disposition or "RESOLVED"
                })

        # 10. Leave Requests search
        leave_reqs = db.query(LeaveRequest).options(joinedload(LeaveRequest.guard)).all()
        for lr in leave_reqs:
            g_name = lr.guard.full_name if lr.guard else ""
            lr_str = f"{g_name} {lr.leave_type} {lr.status} {lr.reason}".lower()
            if any(t in lr_str for t in tokens):
                results["matched_leave_requests"].append({
                    "guard_name": g_name,
                    "leave_type": lr.leave_type,
                    "duration_days": lr.duration_days,
                    "start_date": str(lr.start_date) if lr.start_date else None,
                    "end_date": str(lr.end_date) if lr.end_date else None,
                    "status": lr.status
                })

        return results

    classify_user_query = staticmethod(classify_user_query)
    global_cache = global_telemetry_cache

    @classmethod
    def get_system_telemetry(
        cls,
        db: Session,
        user_query: Optional[str] = None,
        category: Optional[str] = None,
        bypass_cache: bool = False
    ) -> Dict[str, Any]:
        """
        Aggregates grounded telemetry across host, database, operations,
        workforce registries, payroll, financials, errors, and audit logs.
        Applies Intelligent Question Routing (SIMPLE, WORKFORCE, PAYROLL, MANAGEMENT, COMPLEX).
        Uses Python Decimal for exact financial calculations.
        Safely caches read-only results for 60 seconds with strict ADMIN role isolation.
        """
        now = datetime.datetime.now()
        today_start = datetime.datetime(now.year, now.month, now.day)

        if not category:
            category = classify_user_query(user_query)

        # Check in-memory safe cache
        if not bypass_cache:
            cached_data = global_telemetry_cache.get(category, user_query or "", user_role="ADMIN")
            if cached_data:
                cached_data["from_cache"] = True
                return cached_data

        t_db_start = time.perf_counter()

        # 1. Host and Database Infrastructure (Always collected: ~1-2ms)
        host_telemetry = cls.get_host_telemetry()
        db_telemetry = cls.get_database_telemetry(db)

        # Baseline empty/default structures
        error_rates = {
            "unresolved_payroll_errors_total": 0,
            "payroll_records_on_hold": 0,
            "open_security_incidents_total": 0,
            "critical_or_high_severity_incidents": 0,
            "missed_call_center_calls_today": 0,
            "recent_payroll_error_samples": []
        }
        operations_telemetry = {
            "total_guards_registered": 0,
            "active_guards_on_duty_roster": 0,
            "total_client_sites": 0,
            "active_client_sites": 0,
            "today_attendance_punches_logged": 0,
            "active_field_supervisors": 0,
            "call_center_calls_handled_today": 0
        }
        financial_telemetry = {
            "active_client_contracts": 0,
            "monthly_recurring_revenue_mrr_kes": 0.0,
            "latest_payroll_cycle": None,
            "unpaid_site_invoices_count": 0,
            "overdue_invoices_count": 0,
            "unpaid_invoices_amount_kes": 0.0,
            "month_to_date_recurrent_expenses_kes": 0.0
        }
        active_users_summary = {
            "total_system_users": 0,
            "administrators_count": 0,
            "supervisors_count": 0,
            "finance_hr_staff_count": 0,
            "currently_active_authenticated_sessions": 0
        }
        guards_register = []
        supervisors_register = []
        client_sites_register = []
        shifts_register = []
        client_contracts_register = []
        recent_incidents_register = []
        recent_attendance_register = []
        targeted_matches = {}
        audit_trail = []

        # ======================================================================
        # DETERMINISTIC GROUNDING: COMPLETE ERP SINGLE SOURCE OF TRUTH
        # ======================================================================
        att_report = AttendanceAnalyticsService.get_attendance_report(db)
        ot_report = OvertimeAnalyticsService.get_overtime_analysis(db)
        adv_report = SalaryAdvancesAnalyticsService.get_advances_report(db)
        ast_report = AssetsInventoryAnalyticsService.get_assets_report(db)
        cc_report = CallCenterAnalyticsService.get_call_center_report(db)
        inv_report = InvoicesAnalyticsService.get_invoices_report(db)
        ctr_report = ContractsAnalyticsService.get_contracts_report(db)

        # ======================================================================
        # CATEGORY-BASED SELECTIVE QUERY EXECUTION
        # ======================================================================

        if category == QuestionCategory.SIMPLE:
            # Simple questions: greetings, status check, CPU/RAM/Disk stats
            total_guards = att_report["total_registered_guards"]
            active_guards = att_report["active_guards"]
            operations_telemetry.update({
                "total_guards_registered": total_guards,
                "active_registered_guards": active_guards,
                "guards_clocked_in_today": att_report["guards_clocked_in"],
                "guards_clocked_out_today": att_report["guards_clocked_out"],
                "guards_currently_on_duty": att_report["currently_on_duty"],
                "active_guards_on_duty_roster": att_report["currently_on_duty"],
                "guards_absent_today": att_report["absent_guards_count"],
                "incomplete_attendance_records": att_report["incomplete_records_count"]
            })

        elif category == QuestionCategory.WORKFORCE:
            # Workforce questions: guards, supervisors, shifts, deployments
            guards_q = db.query(Guard).options(
                joinedload(Guard.site),
                joinedload(Guard.shift),
                joinedload(Guard.supervisor)
            )
            guards_all = guards_q.limit(100).all()
            total_guards = att_report["total_registered_guards"]
            active_guards = att_report["active_guards"]

            sites_all = db.query(Site).options(joinedload(Site.supervisor)).all()
            total_sites = len(sites_all)

            supervisors_all = db.query(User).filter(User.role == UserRole.SUPERVISOR.value).all()
            supervisors_count = len(supervisors_all)

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
                } for sh in shifts_all
            ]

            operations_telemetry.update({
                "total_guards_registered": total_guards,
                "active_registered_guards": active_guards,
                "guards_clocked_in_today": att_report["guards_clocked_in"],
                "guards_clocked_out_today": att_report["guards_clocked_out"],
                "guards_currently_on_duty": att_report["currently_on_duty"],
                "active_guards_on_duty_roster": att_report["currently_on_duty"],
                "guards_absent_today": att_report["absent_guards_count"],
                "incomplete_attendance_records": att_report["incomplete_records_count"],
                "total_client_sites": total_sites,
                "active_client_sites": total_sites,
                "active_field_supervisors": supervisors_count
            })
            recent_attendance_register = att_report.get("details_rows", [])

            # Guards Register
            for g in guards_all:
                guards_register.append({
                    "id": g.id,
                    "employee_number": g.employee_number,
                    "full_name": g.full_name,
                    "phone": g.phone,
                    "status": g.status,
                    "gender": g.gender,
                    "assigned_site": g.site.site_name if g.site else "Unassigned",
                    "assigned_shift": g.shift.name if g.shift else "Unassigned",
                    "shift_type": g.shift.shift_type if g.shift else "N/A",
                    "supervisor_name": (g.supervisor.full_name or g.supervisor.email) if g.supervisor else "Unassigned",
                    "supervisor_phone": g.supervisor.phone if g.supervisor else "N/A",
                    "basic_salary_kes": round(float(Decimal(str(g.effective_basic_salary or 0))), 2)
                })

            # Supervisors Register
            for s in supervisors_all:
                assigned_guards_list = [
                    {"full_name": g.full_name, "employee_number": g.employee_number, "phone": g.phone, "assigned_site": g.site.site_name if g.site else "Unassigned"}
                    for g in guards_all if g.supervisor_id == s.id
                ]
                assigned_sites_list = [st.site_name for st in sites_all if st.supervisor_id == s.id]
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

            # Client Sites Register
            for st in sites_all:
                st_guards = [{"full_name": g.full_name, "employee_number": g.employee_number} for g in (st.guards or [])]
                sup_name = (st.supervisor.full_name or st.supervisor.email) if st.supervisor else "Unassigned"
                client_sites_register.append({
                    "id": st.id,
                    "site_name": st.site_name,
                    "location": st.location,
                    "client_name": st.client_name,
                    "assigned_supervisor": sup_name,
                    "stationed_guards_count": len(st_guards),
                    "stationed_guards": st_guards,
                    "daily_rate_kes": round(float(Decimal(str(st.daily_rate or 1200.0))), 2)
                })

            if user_query:
                try:
                    targeted_matches = cls.search_database_entities(db, user_query)
                except Exception as e:
                    targeted_matches = {"error": str(e)}

        elif category == QuestionCategory.PAYROLL:
            # Payroll questions: Decimal-based wages, statutory tax, advances, deductions
            latest_payroll_period = db.query(PayrollPeriod).order_by(PayrollPeriod.id.desc()).first()
            if latest_payroll_period:
                records = db.query(
                    PayrollRecord.gross_pay,
                    PayrollRecord.net_pay,
                    PayrollRecord.nssf_deduction,
                    PayrollRecord.shif_deduction,
                    PayrollRecord.housing_levy_deduction,
                    PayrollRecord.paye_deduction,
                    PayrollRecord.salary_advance_deduction
                ).filter(PayrollRecord.payroll_period_id == latest_payroll_period.id).all()

                total_gross = sum(Decimal(str(r[0] or 0)) for r in records)
                total_net = sum(Decimal(str(r[1] or 0)) for r in records)
                total_nssf = sum(Decimal(str(r[2] or 0)) for r in records)
                total_shif = sum(Decimal(str(r[3] or 0)) for r in records)
                total_levy = sum(Decimal(str(r[4] or 0)) for r in records)
                total_paye = sum(Decimal(str(r[5] or 0)) for r in records)
                total_advances = sum(Decimal(str(r[6] or 0)) for r in records)

                financial_telemetry["latest_payroll_cycle"] = {
                    "period_id": latest_payroll_period.id,
                    "period_name": f"{latest_payroll_period.month}/{latest_payroll_period.year}",
                    "status": latest_payroll_period.status,
                    "employees_processed": len(records),
                    "total_gross_pay_kes": round(float(total_gross), 2),
                    "total_net_pay_kes": round(float(total_net), 2),
                    "total_nssf_remittance_kes": round(float(total_nssf), 2),
                    "total_shif_remittance_kes": round(float(total_shif), 2),
                    "total_housing_levy_kes": round(float(total_levy), 2),
                    "total_paye_tax_kes": round(float(total_paye), 2),
                    "total_salary_advance_deductions_kes": round(float(total_advances), 2)
                }

            error_rates["unresolved_payroll_errors_total"] = db.query(PayrollError).count()
            error_rates["payroll_records_on_hold"] = db.query(PayrollRecord).filter(PayrollRecord.is_on_hold == True).count()
            recent_errors = db.query(PayrollError).order_by(PayrollError.id.desc()).limit(5).all()
            error_rates["recent_payroll_error_samples"] = [
                {
                    "id": err.id,
                    "guard_name": getattr(err.guard, "full_name", "Guard") if getattr(err, "guard", None) else "System",
                    "error_type": err.error_type,
                    "description": err.error_message if hasattr(err, "error_message") else getattr(err, "description", ""),
                    "resolved": bool(getattr(err, "resolved_at", None))
                } for err in recent_errors
            ]

            if user_query:
                try:
                    targeted_matches = cls.search_database_entities(db, user_query)
                except Exception as e:
                    targeted_matches = {"error": str(e)}

        elif category == QuestionCategory.MANAGEMENT:
            # Management questions: MRR, contracts, invoices, revenue
            active_contracts_q = db.query(ClientContract).filter(ClientContract.status == "ACTIVE").all()
            mrr_dec = sum(Decimal(str(c.monthly_charge or 0)) for c in active_contracts_q)

            unpaid_invoices_count = db.query(SiteInvoice).filter(SiteInvoice.status.in_(["DRAFT", "PENDING", "OVERDUE", "ISSUED"])).count()
            overdue_invoices_count = db.query(SiteInvoice).filter(SiteInvoice.status == "OVERDUE").count()
            unpaid_inv_rows = db.query(SiteInvoice.total_amount).filter(SiteInvoice.status.in_(["PENDING", "OVERDUE", "ISSUED"])).all()
            unpaid_invoices_dec = sum(Decimal(str(r[0] or 0)) for r in unpaid_inv_rows)

            exp_rows = db.query(Expense.amount).filter(Expense.expense_date >= today_start.replace(day=1).date()).all()
            month_expenses_dec = sum(Decimal(str(r[0] or 0)) for r in exp_rows)

            financial_telemetry.update({
                "active_client_contracts": len(active_contracts_q),
                "monthly_recurring_revenue_mrr_kes": round(float(mrr_dec), 2),
                "unpaid_site_invoices_count": unpaid_invoices_count,
                "overdue_invoices_count": overdue_invoices_count,
                "unpaid_invoices_amount_kes": round(float(unpaid_invoices_dec), 2),
                "month_to_date_recurrent_expenses_kes": round(float(month_expenses_dec), 2)
            })

            for c in active_contracts_q[:25]:
                client_contracts_register.append({
                    "contract_ref": c.contract_ref,
                    "client_name": c.client.name if c.client else "N/A",
                    "title": c.title,
                    "status": c.status,
                    "monthly_charge_kes": round(float(Decimal(str(c.monthly_charge or 0))), 2),
                    "guards_required": c.guards_required,
                    "start_date": str(c.start_date) if c.start_date else None,
                    "end_date": str(c.end_date) if c.end_date else None
                })

        else:
            # COMPLEX Analytical: Complete system telemetry snapshot
            unresolved_payroll_errors = db.query(PayrollError).count()
            recent_errors = db.query(PayrollError).order_by(PayrollError.id.desc()).limit(5).all()
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

            guards_q = db.query(Guard).options(joinedload(Guard.site), joinedload(Guard.shift), joinedload(Guard.supervisor))
            guards_all = guards_q.limit(100).all()
            total_guards = att_report["total_registered_guards"]
            active_guards = att_report["active_guards"]
            sites_all = db.query(Site).options(joinedload(Site.supervisor)).all()
            total_sites = len(sites_all)
            supervisors_all = db.query(User).filter(User.role == UserRole.SUPERVISOR.value).all()
            supervisors_count = len(supervisors_all)
            total_call_logs_today = db.query(CallLog).filter(CallLog.created_at >= today_start).count()

            operations_telemetry = {
                "total_guards_registered": total_guards,
                "active_registered_guards": active_guards,
                "guards_clocked_in_today": att_report["guards_clocked_in"],
                "guards_clocked_out_today": att_report["guards_clocked_out"],
                "guards_currently_on_duty": att_report["currently_on_duty"],
                "active_guards_on_duty_roster": att_report["currently_on_duty"],
                "guards_absent_today": att_report["absent_guards_count"],
                "incomplete_attendance_records": att_report["incomplete_records_count"],
                "total_client_sites": total_sites,
                "active_client_sites": total_sites,
                "today_attendance_punches_logged": att_report["records_count"],
                "active_field_supervisors": supervisors_count,
                "call_center_calls_handled_today": total_call_logs_today
            }
            recent_attendance_register = att_report.get("details_rows", [])

            for g in guards_all:
                guards_register.append({
                    "id": g.id,
                    "employee_number": g.employee_number,
                    "full_name": g.full_name,
                    "phone": g.phone,
                    "email": g.email or "",
                    "status": g.status,
                    "assigned_site": g.site.site_name if g.site else "Unassigned",
                    "assigned_shift": g.shift.name if g.shift else "Unassigned",
                    "supervisor_name": (g.supervisor.full_name or g.supervisor.email) if g.supervisor else "Unassigned",
                    "basic_salary_kes": round(float(Decimal(str(g.effective_basic_salary or 0))), 2)
                })

            for s in supervisors_all:
                assigned_guards_list = [
                    {"full_name": g.full_name, "employee_number": g.employee_number, "phone": g.phone, "assigned_site": g.site.site_name if g.site else "Unassigned"}
                    for g in guards_all if g.supervisor_id == s.id
                ]
                assigned_sites_list = [st.site_name for st in sites_all if st.supervisor_id == s.id]
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

            for st in sites_all:
                st_guards = [{"full_name": g.full_name, "employee_number": g.employee_number} for g in (st.guards or [])]
                sup_name = (st.supervisor.full_name or st.supervisor.email) if st.supervisor else "Unassigned"
                client_sites_register.append({
                    "id": st.id,
                    "site_name": st.site_name,
                    "location": st.location,
                    "client_name": st.client_name,
                    "assigned_supervisor": sup_name,
                    "stationed_guards_count": len(st_guards),
                    "stationed_guards": st_guards,
                    "daily_rate_kes": round(float(Decimal(str(st.daily_rate or 1200.0))), 2)
                })

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
                } for sh in shifts_all
            ]

            contracts_all = db.query(ClientContract).all()
            client_contracts_register = [
                {
                    "contract_ref": c.contract_ref,
                    "client_name": c.client.name if c.client else "N/A",
                    "title": c.title,
                    "status": c.status,
                    "monthly_charge_kes": round(float(Decimal(str(c.monthly_charge or 0))), 2),
                    "guards_required": c.guards_required,
                    "start_date": str(c.start_date) if c.start_date else None,
                    "end_date": str(c.end_date) if c.end_date else None
                } for c in contracts_all
            ]

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
                } for inc in incidents_all
            ]

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
                } for att in attendances_all
            ]

            if user_query:
                try:
                    targeted_matches = cls.search_database_entities(db, user_query)
                except Exception as e:
                    targeted_matches = {"error": f"Search execution: {str(e)}"}

            # Financial Summary
            active_contracts = db.query(ClientContract).filter(ClientContract.status == "ACTIVE").count()
            mrr_sum = sum(Decimal(str(c.monthly_charge or 0)) for c in contracts_all if c.status == "ACTIVE")
            
            latest_payroll_period = db.query(PayrollPeriod).order_by(PayrollPeriod.id.desc()).first()
            latest_period_info = None
            if latest_payroll_period:
                p_records = db.query(PayrollRecord.gross_pay, PayrollRecord.net_pay).filter(PayrollRecord.payroll_period_id == latest_payroll_period.id).all()
                gross_sum = sum(Decimal(str(r[0] or 0)) for r in p_records)
                net_sum = sum(Decimal(str(r[1] or 0)) for r in p_records)
                latest_period_info = {
                    "period_id": latest_payroll_period.id,
                    "period_name": f"{latest_payroll_period.month}/{latest_payroll_period.year}",
                    "status": latest_payroll_period.status,
                    "employees_processed": len(p_records),
                    "total_gross_pay_kes": round(float(gross_sum), 2),
                    "total_net_pay_kes": round(float(net_sum), 2)
                }

            unpaid_invoices_count = db.query(SiteInvoice).filter(SiteInvoice.status.in_(["DRAFT", "PENDING", "OVERDUE", "ISSUED"])).count()
            overdue_invoices_count = db.query(SiteInvoice).filter(SiteInvoice.status == "OVERDUE").count()
            unpaid_inv_rows = db.query(SiteInvoice.total_amount).filter(SiteInvoice.status.in_(["PENDING", "OVERDUE", "ISSUED"])).all()
            unpaid_invoices_amount = sum(Decimal(str(r[0] or 0)) for r in unpaid_inv_rows)

            current_month_expenses = sum(Decimal(str(r[0] or 0)) for r in db.query(Expense.amount).filter(Expense.expense_date >= today_start.replace(day=1).date()).all())

            financial_telemetry = {
                "active_client_contracts": active_contracts,
                "monthly_recurring_revenue_mrr_kes": round(float(mrr_sum), 2),
                "latest_payroll_cycle": latest_period_info,
                "unpaid_site_invoices_count": unpaid_invoices_count,
                "overdue_invoices_count": overdue_invoices_count,
                "unpaid_invoices_amount_kes": round(float(unpaid_invoices_amount), 2),
                "month_to_date_recurrent_expenses_kes": round(float(current_month_expenses), 2)
            }

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

            recent_audits = db.query(AuditLog).order_by(AuditLog.id.desc()).limit(12).all()
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

        # Leave requests register
        leave_all = db.query(LeaveRequest).options(joinedload(LeaveRequest.guard)).order_by(LeaveRequest.id.desc()).limit(20).all()
        leave_requests_register = [
            {
                "id": lr.id,
                "guard_name": lr.guard.full_name if lr.guard else "N/A",
                "employee_number": lr.guard.employee_number if lr.guard else "N/A",
                "leave_type": lr.leave_type,
                "start_date": str(lr.start_date) if lr.start_date else None,
                "end_date": str(lr.end_date) if lr.end_date else None,
                "duration_days": lr.duration_days,
                "status": lr.status,
                "reason": lr.reason
            } for lr in leave_all
        ]

        # Expenses register
        expenses_all = db.query(Expense).order_by(Expense.id.desc()).limit(25).all()
        expenses_register = [
            {
                "id": exp.id,
                "expense_date": str(exp.expense_date) if exp.expense_date else None,
                "title": exp.title,
                "category": exp.category,
                "amount_kes": float(exp.amount),
                "payee": exp.payee,
                "payment_method": exp.payment_method,
                "status": exp.status
            } for exp in expenses_all
        ]

        db_query_time_ms = round((time.perf_counter() - t_db_start) * 1000, 2)

        raw_telemetry = {
            "telemetry_timestamp": now.isoformat(),
            "query_classification": category,
            "db_query_time_ms": db_query_time_ms,
            "data_freshness": now.strftime("%Y-%m-%d %H:%M:%S"),
            "host_performance": host_telemetry,
            "database_telemetry": db_telemetry,
            "error_rates_and_alerts": error_rates,
            "workforce_and_operations": operations_telemetry,
            "attendance_analytics": att_report,
            "overtime_analytics": ot_report,
            "salary_advances_analytics": adv_report,
            "assets_inventory_analytics": ast_report,
            "call_center_summary": cc_report,
            "site_invoices_analytics": inv_report,
            "client_contracts_analytics": ctr_report,
            "standardized_attendance_report": att_report.get("standardized_report", ""),
            "standardized_overtime_report": ot_report.get("standardized_report", ""),
            "standardized_advances_report": adv_report.get("standardized_report", ""),
            "standardized_assets_report": ast_report.get("standardized_report", ""),
            "standardized_calls_report": cc_report.get("standardized_report", ""),
            "standardized_invoices_report": inv_report.get("standardized_report", ""),
            "standardized_contracts_report": ctr_report.get("standardized_report", ""),
            "attendance_details_table": att_report.get("details_rows", []),
            "salary_advances_register": adv_report.get("details_rows", []),
            "assets_inventory_register": ast_report.get("details_rows", []),
            "call_center_logs_register": cc_report.get("recent_calls", []),
            "site_invoices_register": inv_report.get("details_rows", []),
            "client_contracts_register": ctr_report.get("details_rows", []),
            "leave_requests_register": leave_requests_register,
            "expenses_register": expenses_register,
            "guards_register": guards_register,
            "supervisors_register": supervisors_register,
            "client_sites_register": client_sites_register,
            "shifts_register": shifts_register,
            "recent_incidents_register": recent_incidents_register,
            "recent_attendance_register": recent_attendance_register,
            "targeted_database_matches": targeted_matches,
            "financial_and_payroll": financial_telemetry,
            "users_and_sessions": active_users_summary,
            "recent_audit_trail": audit_trail
        }

        sanitized_res = sanitize_dict_or_list(raw_telemetry)
        
        # Cache for subsequent read-only queries
        global_telemetry_cache.set(category, user_query or "", sanitized_res, ttl_seconds=60, user_role="ADMIN")

        return sanitized_res
