import pytest
import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from application.backend.app.services.erp_analytics_service import (
    AttendanceAnalyticsService,
    OvertimeAnalyticsService
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
    assert "**Active Registered Guards:** 11" in fallback_res
    assert "**Guards Currently on Duty:** 3" in fallback_res
