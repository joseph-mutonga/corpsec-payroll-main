import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Date, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from application.backend.app.core.database import Base


class Attendance(Base):
    __tablename__ = "attendance"
    __table_args__ = (
        UniqueConstraint("guard_id", "client_uuid", name="uq_attendance_guard_client_uuid"),
        UniqueConstraint("guard_id", "clock_out_client_uuid", name="uq_attendance_guard_clock_out_uuid"),
    )

    id = Column(Integer, primary_key=True, index=True)
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False, index=True)
    shift_id = Column(Integer, ForeignKey("shifts.id"), nullable=False)
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=True)
    
    shift_date = Column(Date, nullable=False, index=True)
    actual_clock_in = Column(DateTime, nullable=True)
    actual_clock_out = Column(DateTime, nullable=True)
    
    regular_hours = Column(Float, default=0.0, nullable=False)
    overtime_hours = Column(Float, default=0.0, nullable=False)
    
    status = Column(String(255), default="PRESENT", nullable=False)  # PRESENT, ABSENT, LATE, OFF, PENDING_REVIEW
    notes = Column(Text, nullable=True)

    # Offline Sync & Supervisor Review Metadata (Additive / Nullable)
    client_uuid = Column(String(64), nullable=True, index=True)
    clock_out_client_uuid = Column(String(64), nullable=True, index=True)
    device_clock_in_at = Column(DateTime, nullable=True)
    server_clock_in_received_at = Column(DateTime, nullable=True)
    device_clock_out_at = Column(DateTime, nullable=True)
    server_clock_out_received_at = Column(DateTime, nullable=True)
    clock_skew_ms = Column(Integer, nullable=True)
    submitted_offline = Column(Boolean, default=False, nullable=True)
    needs_supervisor_review = Column(Boolean, default=False, nullable=True, index=True)
    review_reason = Column(Text, nullable=True)
    reviewed_by = Column(String(255), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)

    guard = relationship("Guard", back_populates="attendances")
    shift = relationship("Shift")
    site = relationship("Site")

    @property
    def guard_name(self):
        return self.guard.full_name if self.guard else None

    @property
    def guard_employee_number(self):
        return self.guard.employee_number if self.guard else None

    @property
    def site_name(self):
        return self.site.site_name if self.site else None

    @property
    def shift_name(self):
        return self.shift.name if self.shift else None

    @property
    def shift_type(self):
        if self.shift:
            return self.shift.shift_type or ("NIGHT" if self.shift.is_night_shift else "DAY")
        return "DAY"

    @property
    def is_night_shift(self):
        return bool(self.shift.is_night_shift) if self.shift else False


class OvertimeClaim(Base):
    __tablename__ = "overtime_claims"

    id = Column(Integer, primary_key=True, index=True)
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False, index=True)
    attendance_id = Column(Integer, ForeignKey("attendance.id"), nullable=False)
    
    claim_date = Column(Date, nullable=False)
    hours_claimed = Column(Float, nullable=False)
    multiplier = Column(Float, default=1.5, nullable=False)  # 1.5x regular, 2.0x public holiday
    reason = Column(Text, nullable=False)
    
    status = Column(String(255), default="PENDING", nullable=False)  # PENDING, APPROVED, REJECTED
    approved_by = Column(String(255), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)

    guard = relationship("Guard")
    attendance = relationship("Attendance")
