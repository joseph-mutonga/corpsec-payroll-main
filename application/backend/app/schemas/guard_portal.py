from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class GuardTodayShift(BaseModel):
    site_name: str
    shift_name: str
    shift_id: Optional[int] = None
    start_time: str
    end_time: str
    supervisor_name: str = "Supervisor"
    is_clocked_in: bool = False
    is_scheduled: bool = True
    attendance_id: Optional[int] = None


class GuardHomeResponse(BaseModel):
    guard_id: int
    employee_number: str
    full_name: str
    today_shift: Optional[GuardTodayShift] = None
    latest_pay_period: Optional[str] = None
    latest_net_pay: Optional[float] = None
    latest_payroll_record_id: Optional[int] = None
    recent_notifications_count: int = 0


class ShiftInfoResponse(BaseModel):
    shift_name: str
    shift_type: str
    start_time: str
    end_time: str
    site_name: str
    site_location: str


class ClockInStatusResponse(BaseModel):
    is_clocked_in: bool
    clock_in_time: Optional[str] = None
    clock_out_time: Optional[str] = None
    shift_date: str


class GuardDashboardResponse(BaseModel):
    guard_id: int
    employee_number: str
    full_name: str
    status: str
    today_shift: ShiftInfoResponse
    clock_status: ClockInStatusResponse


class GuardLeaveCreate(BaseModel):
    leave_type: str = Field(..., description="Annual, Sick, Compassionate, Unpaid")
    start_date: date
    end_date: date
    reason: str = Field(..., min_length=3)


LeaveRequestCreate = GuardLeaveCreate


class LeaveRequestResponse(BaseModel):
    id: int
    guard_id: int
    leave_type: str
    start_date: date
    end_date: date
    duration_days: int
    reason: str
    status: str

    model_config = ConfigDict(from_attributes=True)


class GuardIncidentCreate(BaseModel):
    incident_type: str = Field(..., description="Security Incident, Equipment Issue, Site Liability, Theft Attempt")
    site_id: Optional[int] = 1
    incident_date: Optional[date] = None
    incident_time: Optional[str] = None
    description: str = Field(..., min_length=5)
    photo_path: Optional[str] = None


IncidentReportCreate = GuardIncidentCreate


class IncidentReportResponse(BaseModel):
    id: int
    reference_number: str
    guard_id: int
    site_id: int
    incident_type: str
    incident_date: date
    incident_time: str
    description: str
    status: str

    model_config = ConfigDict(from_attributes=True)


class GuardPayslipResponse(BaseModel):
    id: int
    payroll_record_id: int
    payslip_number: str
    period_name: str
    period_id: int
    year: int
    month: int
    gross_pay: float
    net_pay: float
    basic_pay: float
    total_deductions: float
    days_worked: int
    status: str
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

