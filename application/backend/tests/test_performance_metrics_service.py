import datetime
import pytest
from sqlalchemy.orm import Session

from application.backend.app.core.security import get_password_hash
from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.user_session import UserSession
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.shift import Shift
from application.backend.app.models.attendance import Attendance
from application.backend.app.models.incident import Incident
from application.backend.app.services.performance_metrics_service import PerformanceMetricsService
from application.backend.app.services.ai_telemetry_service import AITelemetryService
from application.backend.app.services.gemini_service import GeminiAIService


def setup_test_performance_data(db: Session):
    """Sets up realistic test supervisors, sessions, sites, and guards in the test DB."""
    # Ensure a Shift exists
    shift = db.query(Shift).first()
    if not shift:
        shift = Shift(name="Day Shift", start_time="06:00", end_time="18:00")
        db.add(shift)
        db.commit()
        db.refresh(shift)

    # 1. Admin
    admin = db.query(User).filter(User.email == "mutongajoseph29@gmail.com").first()
    if not admin:
        admin = User(
            email="mutongajoseph29@gmail.com",
            phone="+254700000001",
            full_name="Joseph Mutonga",
            role=UserRole.ADMIN.value,
            status=UserStatus.ACTIVE.value,
            password_hash=get_password_hash("Pass123!")
        )
        db.add(admin)

    # 2. Supervisor John Kimene Kimani (High system hours, 2 guards)
    sup_john = db.query(User).filter(User.email == "johnchege@gmail.com").first()
    if not sup_john:
        sup_john = User(
            email="johnchege@gmail.com",
            phone="+254700000002",
            full_name="John Kimene Kimani",
            role=UserRole.SUPERVISOR.value,
            status=UserStatus.ACTIVE.value,
            password_hash=get_password_hash("Pass123!")
        )
        db.add(sup_john)
        db.commit()
        db.refresh(sup_john)

    # 3. Supervisor Joseph Kimani (High site count, 3 sites, 1 guard, 0 web hours)
    sup_joseph = db.query(User).filter(User.email == "joseph.kimani@corpsec.co.ke").first()
    if not sup_joseph:
        sup_joseph = User(
            email="joseph.kimani@corpsec.co.ke",
            phone="+254700000003",
            full_name="Joseph Kimani",
            role=UserRole.SUPERVISOR.value,
            status=UserStatus.ACTIVE.value,
            password_hash=get_password_hash("Pass123!")
        )
        db.add(sup_joseph)
        db.commit()
        db.refresh(sup_joseph)

    # 4. Supervisor Alex Omondi (Field supervisor, 1 guard)
    sup_alex = db.query(User).filter(User.email == "alex.omondi@corpsec.co.ke").first()
    if not sup_alex:
        sup_alex = User(
            email="alex.omondi@corpsec.co.ke",
            phone="+254700000004",
            full_name="Alex Omondi",
            role=UserRole.SUPERVISOR.value,
            status=UserStatus.ACTIVE.value,
            password_hash=get_password_hash("Pass123!")
        )
        db.add(sup_alex)
        db.commit()
        db.refresh(sup_alex)

    # Sessions for John Kimene Kimani (8.17 hours = 29412 seconds)
    sess_john = db.query(UserSession).filter(UserSession.user_id == sup_john.id).first()
    if not sess_john:
        sess_john = UserSession(
            user_id=sup_john.id,
            login_time=datetime.datetime.now() - datetime.timedelta(days=2),
            last_activity=datetime.datetime.now() - datetime.timedelta(days=2) + datetime.timedelta(hours=8),
            logout_time=datetime.datetime.now() - datetime.timedelta(days=2) + datetime.timedelta(hours=8),
            duration_seconds=29412,
            is_active=False
        )
        db.add(sess_john)

    # Sites for Joseph Kimani (3 sites)
    for site_name in ["Karen Commercial Hub", "Westlands Plaza", "Upper Hill Tower"]:
        st = db.query(Site).filter(Site.site_name == site_name).first()
        if not st:
            st = Site(
                site_name=site_name,
                location="Nairobi",
                client_name="Corporate Client",
                supervisor_id=sup_joseph.id,
                daily_rate=1500.0
            )
            db.add(st)

    # Guards for John (2 guards)
    g1 = db.query(Guard).filter(Guard.employee_number == "EMP-TEST-001").first()
    if not g1:
        g1 = Guard(
            full_name="Guard Peter Otieno",
            employee_number="EMP-TEST-001",
            national_id="99887701",
            phone="+254711000001",
            hire_date=datetime.date(2025, 1, 1),
            supervisor_id=sup_john.id,
            shift_id=shift.id,
            status="ACTIVE"
        )
        db.add(g1)

    g2 = db.query(Guard).filter(Guard.employee_number == "EMP-TEST-002").first()
    if not g2:
        g2 = Guard(
            full_name="Guard Samuel Mwangi",
            employee_number="EMP-TEST-002",
            national_id="99887702",
            phone="+254711000002",
            hire_date=datetime.date(2025, 1, 1),
            supervisor_id=sup_john.id,
            shift_id=shift.id,
            status="ACTIVE"
        )
        db.add(g2)

    # Guard for Joseph Kimani
    g3 = db.query(Guard).filter(Guard.employee_number == "EMP-TEST-003").first()
    if not g3:
        g3 = Guard(
            full_name="Guard David Njoroge",
            employee_number="EMP-TEST-003",
            national_id="99887703",
            phone="+254711000003",
            hire_date=datetime.date(2025, 1, 1),
            supervisor_id=sup_joseph.id,
            shift_id=shift.id,
            status="ACTIVE"
        )
        db.add(g3)

    db.commit()


def test_supervisor_performance_metrics_computation(db: Session):
    """
    Verifies that PerformanceMetricsService computes supervisor session hours,
    guards supervised, assigned sites, and rankings correctly from the database.
    """
    setup_test_performance_data(db)

    metrics = PerformanceMetricsService.get_supervisor_performance_metrics(db, days=30)
    assert metrics is not None
    assert metrics["total_supervisors"] >= 3
    assert "ranked_by_hours" in metrics
    assert "ranked_by_workload" in metrics

    # Verify ranked by hours list
    by_hours = metrics["ranked_by_hours"]
    assert len(by_hours) == metrics["total_supervisors"]
    # John Kimene Kimani has an active session of 8.17 hours
    top_sup = by_hours[0]
    assert top_sup["hours_rank"] == 1
    assert top_sup["total_session_hours"] >= 8.0
    assert "john" in top_sup["full_name"].lower()


def test_supervisor_individual_hours_lookup(db: Session):
    """
    Verifies looking up an individual supervisor by name or ID works.
    """
    setup_test_performance_data(db)

    sup_data = PerformanceMetricsService.get_individual_supervisor_hours(db, "john kimene kimani", days=30)
    assert sup_data is not None
    assert sup_data["total_session_hours"] >= 8.0
    assert sup_data["active_sessions_count"] >= 1

    # Non-existent supervisor lookup returns None
    assert PerformanceMetricsService.get_individual_supervisor_hours(db, "non_existent_supervisor_9999") is None


def test_format_supervisor_performance_report(db: Session):
    """
    Verifies the generated Markdown grounding report contains standard tables,
    rankings, and analytical caveats.
    """
    setup_test_performance_data(db)

    metrics = PerformanceMetricsService.get_supervisor_performance_metrics(db, days=30)
    report = PerformanceMetricsService.format_supervisor_performance_report(metrics)
    assert "RANKING BY ACTIVE HOURS STAYED IN SYSTEM" in report
    assert "RANKING BY COMPOSITE WORKLOAD" in report
    assert "John Kimene Kimani" in report or "john kimene kimani" in report.lower()
    assert "Hours stayed in the system measures active web dashboard engagement" in report


def test_ai_hardworking_supervisor_query_ranking(db: Session):
    """
    Verifies that asking 'which supervisor is more hardworking' returns a ranked
    evaluation with metrics and date range, instead of a refusal.
    """
    setup_test_performance_data(db)

    telemetry = AITelemetryService.get_system_telemetry(db, user_query="which supervisor is more hardworking", category="WORKFORCE")
    answer = GeminiAIService.generate_grounded_fallback_analysis("which supervisor is more hardworking", telemetry)
    
    assert "I cannot determine" not in answer
    assert "Supervisor Performance & Workload Ranking" in answer
    assert "John Kimene Kimani" in answer
    assert "Joseph Kimani" in answer
    assert "Caveat" in answer or "imperfect proxy" in answer


def test_ai_hours_stayed_in_system_followup(db: Session):
    """
    Verifies follow-up query 'based that arguments by hours stayed in the system'
    returns ranking strictly by hours in system.
    """
    setup_test_performance_data(db)

    telemetry = AITelemetryService.get_system_telemetry(db, user_query="based that arguments by hours stayed in the system", category="WORKFORCE")
    answer = GeminiAIService.generate_grounded_fallback_analysis("based that arguments by hours stayed in the system", telemetry)

    assert "I cannot determine" not in answer
    assert "Ranked by Active Hours in the System" in answer
    assert "John Kimene Kimani" in answer
    assert "8.17 hrs" in answer or "8.1" in answer
    assert "0.00 hrs" in answer


def test_ai_hours_this_week_for_specific_supervisor(db: Session):
    """
    Verifies 'Show hours in the system for supervisor john kimene kimani this week' works.
    """
    setup_test_performance_data(db)

    prompt = "Show hours in the system for supervisor john kimene kimani this week"
    telemetry = AITelemetryService.get_system_telemetry(db, user_query=prompt, category="WORKFORCE")
    answer = GeminiAIService.generate_grounded_fallback_analysis(prompt, telemetry)

    assert "I cannot determine" not in answer
    assert "System Engagement Hours for Supervisor" in answer
    assert "John Kimene Kimani" in answer
    assert "Hours in System This Week" in answer


def test_existing_count_questions_still_work(db: Session):
    """
    Verifies existing workforce/count questions continue to return accurate data.
    """
    setup_test_performance_data(db)

    telemetry = AITelemetryService.get_system_telemetry(db, user_query="how many users in system", category="WORKFORCE")
    # Verify supervisors and workforce registers are properly populated
    assert len(telemetry.get("supervisors_register", [])) >= 3
    assert telemetry.get("workforce_and_operations", {}).get("active_field_supervisors", 0) >= 3
