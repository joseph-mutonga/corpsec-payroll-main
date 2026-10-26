from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class ClockInRequest(BaseModel):
    site_id: int
    shift_id: Optional[int] = None


class ClockOutRequest(BaseModel):
    attendance_id: int


class AttendanceLogRequest(BaseModel):
    guard_id: int
    shift_id: int
    site_id: Optional[int] = None
    shift_date: date
    actual_clock_in: datetime
    actual_clock_out: datetime
    notes: Optional[str] = None


class AttendanceCorrectionRequest(BaseModel):
    actual_clock_in: Optional[datetime] = None
    actual_clock_out: Optional[datetime] = None
    status: str = "PRESENT"
    reason: str = Field(..., min_length=3)


class AnomalyResponse(BaseModel):
    guard_id: int
    guard_name: str
    shift_date: date
    anomaly_type: str  # MISSING_CLOCK_OUT, UNASSIGNED_SHIFT, EXCESSIVE_OVERTIME
    description: str
    severity: str      # CRITICAL, WARNING


class AttendanceResponse(BaseModel):
    id: int
    guard_id: int
    site_id: Optional[int] = None
    shift_id: Optional[int] = None
    shift_date: date
    actual_clock_in: Optional[datetime] = None
    actual_clock_out: Optional[datetime] = None
    regular_hours: float
    overtime_hours: float
    status: str
    notes: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AttendanceSummaryResponse(BaseModel):
    days_worked: int = 0
    days_off: int = 0
    late_count: int = 0
    absent_count: int = 0
    total_regular_hours: float = 0.0
    total_overtime_hours: float = 0.0


class OvertimeClaimResponse(BaseModel):
    id: int
    guard_id: int
    guard_name: str
    site_name: str
    shift_date: date
    overtime_hours: float
    rate_multiplier: float = 1.5
    status: str
