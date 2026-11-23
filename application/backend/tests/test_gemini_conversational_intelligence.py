import pytest
import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from application.backend.app.services.erp_analytics_service import (
    AttendanceAnalyticsService,
    OvertimeAnalyticsService,
    SalaryAdvancesAnalyticsService,
    AssetsInventoryAnalyticsService,
    CallCenterAnalyticsService,
    InvoicesAnalyticsService,
    ContractsAnalyticsService
)
from application.backend.app.services.ai_telemetry_service import (
    AITelemetryService,
    QuestionCategory
)
from application.backend.app.services.gemini_service import GeminiAIService

MYSQL_URL = "mysql+pymysql://root:38556016ab@localhost:3306/corpsec_payroll?charset=utf8mb4"
mysql_engine = create_engine(MYSQL_URL, pool_pre_ping=True)
MySQLSession = sessionmaker(bind=mysql_engine, autocommit=False, autoflush=False)


@pytest.fixture(scope="module")
def db_session():
    session = MySQLSession()
    yield session
    session.close()


def test_attendance_analytics_deterministic_counts(db_session: Session):
    """
    Verifies that the dedicated ERP attendance analytics engine retrieves
    accurate, non-conflicting counts from the MySQL database.
    """
    report = AttendanceAnalyticsService.get_attendance_report(db_session)
    
    assert report["timezone"] == "Africa/Nairobi"
    assert report["total_registered_guards"] == 11
    assert report["active_guards"] == 11
    assert report["guards_clocked_in"] == 4
    assert report["guards_clocked_out"] == 1
    assert report["currently_on_duty"] == 3
    assert report["absent_guards_count"] == 7
    assert len(report["details_rows"]) == 4

    # Verify Section 9 template sections
    text = report["standardized_report"]
    assert "ATTENDANCE REPORT" in text
    assert "**Total registered guards:** 11" in text
    assert "**Active guards:** 11" in text
    assert "**Guards who clocked in:** 4" in text
    assert "**Guards who clocked out:** 1" in text
    assert "**Currently on duty:** 3" in text
    assert "ATTENDANCE DETAILS" in text
    assert "DATABASE VERIFICATION" in text
    assert "Actual database query execution time:" in text


def test_four_question_consistency_challenge(db_session: Session):
    """
    Reproduces the 4-question consistency challenge:
    Q1: 'How many guards were present today?'
    Q2: 'Can you list all guards who attended work today?'
    Q3: 'Check the attendance and overtime sections.'
    Q4: 'How many guards were present today?'
    All 4 must return consistent underlying database metrics.
    """
    q1 = "How many guards were present today?"
    q2 = "Can you list all guards who attended work today?"
    q3 = "Check the attendance and overtime sections."
    q4 = "How many guards were present today?"

    c1 = AITelemetryService.classify_user_query(q1)
    c2 = AITelemetryService.classify_user_query(q2)
    c3 = AITelemetryService.classify_user_query(q3)
    c4 = AITelemetryService.classify_user_query(q4)

    t1 = AITelemetryService.get_system_telemetry(db_session, user_query=q1, category=c1, bypass_cache=True)
    t2 = AITelemetryService.get_system_telemetry(db_session, user_query=q2, category=c2, bypass_cache=True)
    t3 = AITelemetryService.get_system_telemetry(db_session, user_query=q3, category=c3, bypass_cache=True)
    t4 = AITelemetryService.get_system_telemetry(db_session, user_query=q4, category=c4, bypass_cache=True)

    # Core workforce counts must match across all 4 inquiries
    for i, t in enumerate([t1, t2, t3, t4], 1):
        ops = t["workforce_and_operations"]
        assert ops["total_guards_registered"] == 11, f"Q{i} mismatch on total_guards_registered"
        assert ops["active_registered_guards"] == 11, f"Q{i} mismatch on active_registered_guards"
        assert ops["guards_clocked_in_today"] == 4, f"Q{i} mismatch on guards_clocked_in_today"
        assert ops["guards_currently_on_duty"] == 3, f"Q{i} mismatch on guards_currently_on_duty"
        assert ops["guards_clocked_out_today"] == 1, f"Q{i} mismatch on guards_clocked_out_today"
        assert ops["guards_absent_today"] == 7, f"Q{i} mismatch on guards_absent_today"
        assert "standardized_attendance_report" in t
        assert "**Total registered guards:** 11" in t["standardized_attendance_report"]


def test_overtime_analytics_and_reconciliation(db_session: Session):
    """
    Verifies the overtime analytics engine calculates shift hours,
    1.5x/2.0x multipliers, and reconciles against payroll records.
    """
    ot_report = OvertimeAnalyticsService.get_overtime_analysis(db_session)
    assert "OVERTIME ANALYSIS & RECONCILIATION REPORT" in ot_report["standardized_report"]
    assert "1.5x basic hourly rate" in ot_report["standardized_report"]
    assert "2.0x basic hourly rate" in ot_report["standardized_report"]
    assert "Payroll Reconciliation" in ot_report["standardized_report"]
    assert ot_report["payroll_period"] is not None


def test_greeting_does_not_dump_server_infrastructure(db_session: Session):
    """
    Ensures greetings like 'hello' answer politely and concisely
    without dumping server CPU/RAM infrastructure statistics.
    """
    t = AITelemetryService.get_system_telemetry(db_session, user_query="hello", category="SIMPLE")
    fallback_res = GeminiAIService.generate_grounded_fallback_analysis("hello", t)
    
    assert "Hello, Administrator!" in fallback_res
    assert "CPU Utilization" not in fallback_res
    assert "Disk Storage Usage" not in fallback_res
    assert "**Guards & Attendance:**" in fallback_res or "**Active Registered Guards:**" in fallback_res


def test_salary_advances_analytics_and_fallback(db_session: Session):
    """
    Verifies that Salary Advances analytics retrieves exact MySQL records (4 advances, KES 12,000 total)
    and formats verified reports without hallucination.
    """
    adv = SalaryAdvancesAnalyticsService.get_advances_report(db_session)
    assert adv["total_count"] == 4
    assert adv["total_amount_kes"] == 12000.0
    assert adv["approved_amount_kes"] == 7000.0
    assert adv["deducted_amount_kes"] == 5000.0
    assert len(adv["details_rows"]) == 4

    std_rep = adv["standardized_report"]
    assert "SALARY & PAYMENT ADVANCES REPORT" in std_rep
    assert "KES 12,000.00" in std_rep
    assert "John Mwangi" in std_rep
    assert "Samuel Kiptoo" in std_rep

    t = AITelemetryService.get_system_telemetry(db_session, user_query="What salary advances have been issued?", category="PAYROLL")
    res = GeminiAIService.generate_grounded_fallback_analysis("What salary advances have been issued?", t)
    assert "SALARY & PAYMENT ADVANCES REPORT" in res
    assert "KES 12,000.00" in res


def test_assets_inventory_analytics_and_fallback(db_session: Session):
    """
    Verifies that Assets & Inventory analytics retrieves tracked items (4 assets, KES 1,542,000 valuation)
    and formats the report with serial numbers and conditions.
    """
    ast = AssetsInventoryAnalyticsService.get_assets_report(db_session)
    assert ast["total_assets"] == 4
    assert ast["total_current_value_kes"] == 1542000.0
    assert len(ast["details_rows"]) == 4

    std_rep = ast["standardized_report"]
    assert "ASSETS & INVENTORY REPORT" in std_rep
    assert "KES 1,542,000.00" in std_rep
    assert "Mazda Demio" in std_rep or "Digital Radio" in std_rep

    t = AITelemetryService.get_system_telemetry(db_session, user_query="What assets and equipment do we have?", category="WORKFORCE")
    res = GeminiAIService.generate_grounded_fallback_analysis("What assets and equipment do we have?", t)
    assert "ASSETS & INVENTORY REPORT" in res
    assert "KES 1,542,000.00" in res


def test_call_center_analytics_and_fallback(db_session: Session):
    """
    Verifies that Call Centre analytics retrieves CDRs (34 total calls, inbound/outbound breakdown)
    and agent statuses.
    """
    cc = CallCenterAnalyticsService.get_call_center_report(db_session)
    assert cc["total_calls"] == 34
    assert cc["inbound_calls"] == 19
    assert cc["outbound_calls"] == 15
    assert cc["total_talk_minutes"] == 15.7

    std_rep = cc["standardized_report"]
    assert "CALL CENTRE & TELEPHONY REPORT" in std_rep
    assert "19 Inbound calls" in std_rep
    assert "15 Outbound calls" in std_rep

    t = AITelemetryService.get_system_telemetry(db_session, user_query="Show me call center logs and calls handled", category="WORKFORCE")
    res = GeminiAIService.generate_grounded_fallback_analysis("Show me call center logs and calls handled", t)
    assert "CALL CENTRE & TELEPHONY REPORT" in res


def test_invoices_analytics_and_fallback(db_session: Session):
    """
    Verifies that Site Invoices analytics retrieves invoices (6 invoices, KES 212,200 total, KES 84,600 paid)
    and 16% VAT calculations.
    """
    inv = InvoicesAnalyticsService.get_invoices_report(db_session)
    assert inv["total_invoices"] == 6
    assert inv["total_amount_kes"] == 212200.0
    assert inv["paid_amount_kes"] == 84600.0

    std_rep = inv["standardized_report"]
    assert "SITE INVOICES & BILLING REPORT" in std_rep
    assert "KES 212,200.00" in std_rep
    assert "KES 84,600.00" in std_rep

    t = AITelemetryService.get_system_telemetry(db_session, user_query="What are our invoices and billing totals?", category="PAYROLL")
    res = GeminiAIService.generate_grounded_fallback_analysis("What are our invoices and billing totals?", t)
    assert "SITE INVOICES & BILLING REPORT" in res
    assert "KES 212,200.00" in res


def test_contracts_analytics_and_fallback(db_session: Session):
    """
    Verifies that Client Contracts analytics retrieves active contracts (2 active contracts, KES 350,000 MRR, 10 guards required).
    """
    ctr = ContractsAnalyticsService.get_contracts_report(db_session)
    assert ctr["total_contracts"] == 2
    assert ctr["active_contracts"] == 2
    assert ctr["total_mrr_kes"] == 350000.0
    assert ctr["total_guards_required"] == 10

    std_rep = ctr["standardized_report"]
    assert "CLIENT CONTRACTS & REVENUE REPORT" in std_rep
    assert "KES 350,000.00" in std_rep
    assert "Westlands Mall" in std_rep
    assert "quickmart supermarket" in std_rep.lower()

    t = AITelemetryService.get_system_telemetry(db_session, user_query="What is our client contracts MRR and guard quotas?", category="MANAGEMENT")
    res = GeminiAIService.generate_grounded_fallback_analysis("What is our client contracts MRR and guard quotas?", t)
    assert "CLIENT CONTRACTS & REVENUE REPORT" in res
    assert "KES 350,000.00" in res


def test_caps_and_uniforms_inventory_query(db_session: Session):
    """
    Verifies that querying for uniforms, caps, boots, and gear retrieves the exact
    inventory item counts from inventory_items and inventory_transactions.
    Specifically checks:
    - Code 002 (caps): 205 total (75 issued / in use, 130 remaining in store).
    """
    ast = AssetsInventoryAnalyticsService.get_assets_report(db_session)
    assert ast["inventory_items_count"] == 13
    assert ast["total_combined_units"] > 0
    assert "caps" in ast["standardized_report"].lower()
    assert "205 COMBINED" in ast["standardized_report"] or "205" in ast["standardized_report"]

    t = AITelemetryService.get_system_telemetry(
        db_session,
        user_query="how many caps in the firm",
        category="WORKFORCE"
    )
    assert "inventory_items_register" in t
    res = GeminiAIService.generate_grounded_fallback_analysis("how many caps in the firm", t)
    assert "205" in res
    assert "caps" in res.lower()
    assert "75" in res
    assert "130" in res

