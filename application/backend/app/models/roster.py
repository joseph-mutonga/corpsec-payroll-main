import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Date, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from application.backend.app.core.database import Base


class RosterPattern(Base):
    __tablename__ = "roster_patterns"

    id = Column(Integer, primary_key=True, index=True)
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False, index=True)
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=False, index=True)
    shift_id = Column(Integer, ForeignKey("shifts.id"), nullable=False, index=True)

    # Days of week as comma-separated integers, e.g., "0,1,2,3,4" for Mon-Fri (Monday=0 ... Sunday=6)
    days_of_week = Column(String(255), nullable=False, default="0,1,2,3,4")
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)

    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now, nullable=False)

    guard = relationship("Guard")
    site = relationship("Site")
    shift = relationship("Shift")
    assignments = relationship("RosterAssignment", back_populates="pattern", cascade="all, delete-orphan")


class RosterAssignment(Base):
    __tablename__ = "roster_assignments"

    id = Column(Integer, primary_key=True, index=True)
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False, index=True)
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=True, index=True)
    shift_id = Column(Integer, ForeignKey("shifts.id"), nullable=True, index=True)

    shift_date = Column(Date, nullable=False, index=True)
    is_override = Column(Boolean, default=False, nullable=False)
    pattern_id = Column(Integer, ForeignKey("roster_patterns.id"), nullable=True, index=True)

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now, nullable=False)

    __table_args__ = (
        UniqueConstraint('guard_id', 'shift_date', name='uq_guard_shift_date'),
    )

    guard = relationship("Guard")
    site = relationship("Site")
    shift = relationship("Shift")
    pattern = relationship("RosterPattern", back_populates="assignments")
