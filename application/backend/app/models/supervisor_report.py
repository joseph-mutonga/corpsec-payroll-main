import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, Date, ForeignKey
from sqlalchemy.orm import relationship
from application.backend.app.core.database import Base


class SupervisorReport(Base):
    """
    Formal Field Supervisor Operational Reports submitted directly to System Administration in PDF format.
    Allows Supervisors to dispatch site inspections, patrol summaries, and incident dossiers in PDF form,
    and allows System Administrators to review, inspect, and acknowledge them.
    """
    __tablename__ = "supervisor_reports"

    id = Column(Integer, primary_key=True, index=True)
    reference_number = Column(String(100), unique=True, index=True, nullable=False)
    supervisor_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=True, index=True)

    title = Column(String(255), nullable=False, index=True)
    report_type = Column(String(100), default="FIELD_INSPECTION", nullable=False)
    report_date = Column(Date, default=datetime.date.today, nullable=False)
    summary = Column(Text, nullable=True)
    recommendations = Column(Text, nullable=True)

    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size_bytes = Column(Integer, nullable=True)
    mime_type = Column(String(100), default="application/pdf", nullable=False)

    status = Column(String(50), default="SUBMITTED", nullable=False)  # SUBMITTED, UNDER_REVIEW, REVIEWED, ACTION_REQUIRED
    admin_notes = Column(Text, nullable=True)
    reviewed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now, nullable=False)

    supervisor = relationship("User", foreign_keys=[supervisor_id], backref="submitted_supervisor_reports")
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])
    site = relationship("Site")
