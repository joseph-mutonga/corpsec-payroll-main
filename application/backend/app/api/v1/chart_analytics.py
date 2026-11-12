from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from application.backend.app.api.deps import get_db, authorize_chart_analytics
from application.backend.app.models.user import User
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.attendance import Attendance, OvertimeClaim
from application.backend.app.models.payroll import PayrollPeriod, PayrollRecord
from application.backend.app.models.incident import Incident

router = APIRouter(prefix="/chart-analytics", tags=["Restricted Chart Analytics"])


@router.get("/dashboard")
def getChartAnalyticsDashboard(
    year: Optional[int] = Query(None, description="Calendar year filter"),
    db: Session = Depends(get_db),
    current_user: User = Depends(authorize_chart_analytics)
):
    """
    Role-Restricted Charting & System Metrics Dashboard Endpoint.
    Authorized Roles: 'System Admin', 'HR', 'Supervisor', 'Staff'.
    Guards are strictly forbidden (403 Forbidden).
    """
    target_year = year or 2026

    # 1. High-level KPIs
    total_guards = db.query(Guard).filter(Guard.status == "ACTIVE").count()
    total_sites = db.query(Site).count()
    total_incidents = db.query(Incident).count()
    total_overtime_claims = db.query(OvertimeClaim).count()

    # 2. Monthly Trend Records for Line/Bar Charts
    periods = db.query(PayrollPeriod).filter(PayrollPeriod.year == target_year).order_by(PayrollPeriod.month.asc()).all()
    monthly_trend = []
    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    for p in periods:
        records = db.query(PayrollRecord).filter(PayrollRecord.payroll_period_id == p.id).all()
        gross_sum = sum(r.gross_pay or 0.0 for r in records)
        net_sum = sum(r.net_pay or 0.0 for r in records)
        shifts_sum = sum(r.shifts_worked or 0 for r in records)
        m_label = month_names[p.month - 1] if 1 <= p.month <= 12 else f"M{p.month}"
        monthly_trend.append({
            "period_id": p.id,
            "month": p.month,
            "label": m_label,
            "gross_payroll": round(gross_sum, 2),
            "net_payroll": round(net_sum, 2),
            "shifts_count": shifts_sum,
            "guards_paid": len(records)
        })

    # 3. Guard Distribution by Site (for Pie/Donut Chart)
    site_counts = (
        db.query(Site.site_name, func.count(Guard.id))
        .outerjoin(Guard, Guard.primary_site_id == Site.id)
        .group_by(Site.id, Site.site_name)
        .all()
    )
    site_distribution = [
        {"site_name": s_name, "guard_count": count}
        for s_name, count in site_counts
    ]

    # 4. Attendance Status Breakdown
    attendance_counts = (
        db.query(Attendance.status, func.count(Attendance.id))
        .group_by(Attendance.status)
        .all()
    )
    attendance_breakdown = {status_name: count for status_name, count in attendance_counts}

    return {
        "status": "success",
        "year": target_year,
        "caller_role": current_user.role,
        "kpis": {
            "active_guards": total_guards,
            "active_sites": total_sites,
            "total_incidents": total_incidents,
            "total_overtime_claims": total_overtime_claims
        },
        "monthly_trend": monthly_trend,
        "site_distribution": site_distribution,
        "attendance_breakdown": attendance_breakdown
    }


@router.get("/monthly-trends")
def getChartMonthlyTrends(
    year: Optional[int] = Query(2026, description="Calendar year"),
    db: Session = Depends(get_db),
    current_user: User = Depends(authorize_chart_analytics)
):
    """
    Retrieves monthly trends for charting.
    Authorized Roles: 'System Admin', 'HR', 'Supervisor', 'Staff'.
    Guards: 403 Forbidden.
    """
    periods = db.query(PayrollPeriod).filter(PayrollPeriod.year == year).order_by(PayrollPeriod.month.asc()).all()
    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    trends = []

    for p in periods:
        records = db.query(PayrollRecord).filter(PayrollRecord.payroll_period_id == p.id).all()
        gross = sum(r.gross_pay or 0.0 for r in records)
        net = sum(r.net_pay or 0.0 for r in records)
        trends.append({
            "period_id": p.id,
            "month": p.month,
            "label": month_names[p.month - 1] if 1 <= p.month <= 12 else f"Month {p.month}",
            "gross_payroll": round(gross, 2),
            "net_payroll": round(net, 2),
            "guard_count": len(records)
        })

    return {
        "year": year,
        "trends": trends
    }


@router.get("/site-distribution")
def getChartSiteDistribution(
    db: Session = Depends(get_db),
    current_user: User = Depends(authorize_chart_analytics)
):
    """
    Retrieves site guard distribution for charting.
    Authorized Roles: 'System Admin', 'HR', 'Supervisor', 'Staff'.
    Guards: 403 Forbidden.
    """
    sites = db.query(Site).all()
    distribution = []
    total_guards = db.query(Guard).filter(Guard.status == "ACTIVE").count()

    for s in sites:
        cnt = db.query(Guard).filter(Guard.primary_site_id == s.id, Guard.status == "ACTIVE").count()
        pct = round((cnt / total_guards * 100), 1) if total_guards > 0 else 0.0
        distribution.append({
            "site_id": s.id,
            "site_name": s.site_name,
            "guard_count": cnt,
            "percentage": pct
        })

    return {
        "total_active_guards": total_guards,
        "distribution": distribution
    }
