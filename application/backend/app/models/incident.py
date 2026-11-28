import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Date, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from application.backend.app.core.database import Base


class Incident(Base):
    __tablename__ = "incidents"
    __table_args__ = (
        UniqueConstraint("guard_id", "client_uuid", name="uq_incidents_guard_client_uuid"),
    )

    id = Column(Integer, primary_key=True, index=True)
    reference_number = Column(String(255), unique=True, index=True, nullable=False)
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False, index=True)
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=False)
    
    incident_type = Column(String(255), nullable=False)
    incident_date = Column(Date, nullable=False)
    incident_time = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    photo_path = Column(String(255), nullable=True)

    # Offline Sync & Supervisor Review Metadata (Additive / Nullable)
    client_uuid = Column(String(64), nullable=True, index=True)
    device_timestamp = Column(DateTime, nullable=True)
    server_received_at = Column(DateTime, nullable=True)
    clock_skew_ms = Column(Integer, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    submitted_offline = Column(Boolean, default=False, nullable=True)
    needs_supervisor_review = Column(Boolean, default=False, nullable=True, index=True)
    review_reason = Column(Text, nullable=True)
    reviewed_by = Column(String(255), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    
    status = Column(String(255), default="OPEN", nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    
    guard = relationship("Guard", backref="incidents")
    site = relationship("Site")
