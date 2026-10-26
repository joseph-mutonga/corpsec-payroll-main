import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from application.backend.app.core.database import Base


class OffDayAllowance(Base):
    __tablename__ = "off_day_allowances"

    id = Column(Integer, primary_key=True, index=True)
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False, index=True)
    year = Column(Integer, nullable=False)
    month = Column(Integer, nullable=False)
    days_allowed = Column(Integer, nullable=False)
    set_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now, nullable=False)

    __table_args__ = (
        UniqueConstraint('guard_id', 'year', 'month', name='uq_guard_offday_allowance_month'),
    )

    guard = relationship("Guard")
    set_by = relationship("User")


class OffDayRequest(Base):
    __tablename__ = "off_day_requests"

    id = Column(Integer, primary_key=True, index=True)
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False, index=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    days_count = Column(Integer, nullable=False)
    status = Column(String(255), default="PENDING_REVIEW", nullable=False)  # PENDING_REVIEW, APPROVED, REJECTED
    rejection_reason = Column(Text, nullable=True)

    requested_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    reviewed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)

    guard = relationship("Guard", foreign_keys=[guard_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_user_id])
    reliever_assignments = relationship("RelieverAssignment", back_populates="off_day_request", cascade="all, delete-orphan")


class RelieverAssignment(Base):
    __tablename__ = "reliever_assignments"

    id = Column(Integer, primary_key=True, index=True)
    off_day_request_id = Column(Integer, ForeignKey("off_day_requests.id"), nullable=False, index=True)
    reliever_guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False, index=True)
    covering_for_guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False, index=True)
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=False, index=True)
    shift_id = Column(Integer, ForeignKey("shifts.id"), nullable=False, index=True)
    shift_date = Column(Date, nullable=False, index=True)

    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)

    off_day_request = relationship("OffDayRequest", back_populates="reliever_assignments")
    reliever_guard = relationship("Guard", foreign_keys=[reliever_guard_id])
    covering_for_guard = relationship("Guard", foreign_keys=[covering_for_guard_id])
    site = relationship("Site")
    shift = relationship("Shift")
