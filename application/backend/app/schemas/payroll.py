from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class PayrollPeriodCreate(BaseModel):
    year: int = Field(..., json_schema_extra={"example": 2026})
    month: int = Field(..., ge=1, le=12, json_schema_extra={"example": 8})
    period_name: str = Field(..., json_schema_extra={"example": "August 2026"})
    start_date: date
    end_date: date


class PayrollPeriodResponse(BaseModel):
    id: int
    year: int
    month: int
    period_name: str
    start_date: date
    end_date: date
    status: str  # DRAFT, CALCULATED, CONFIRMED, CLOSED
    calculated_at: Optional[datetime] = None
    confirmed_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    closed_by: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PayrollRecordResponse(BaseModel):
    id: int
    payroll_period_id: int
    guard_id: int
    employee_number: str
    guard_name: str
    days_worked: int
    regular_hours: float
    overtime_hours: float
    basic_pay: float
    overtime_pay: float
    allowances: float
    gross_pay: float
    nssf_deduction: float
    shif_deduction: float
    housing_levy_deduction: float
    paye_deduction: float
    other_deductions: Optional[float] = 0.0
    unpaid_leave_deduction: Optional[float] = 0.0
    off_day_deduction: Optional[float] = 0.0
    reliever_earnings: Optional[float] = 0.0
    total_deductions: float
    net_pay: float
    employer_nssf_deduction: Optional[float] = 0.0
    employer_housing_levy_deduction: Optional[float] = 0.0
    total_employer_statutory: Optional[float] = 0.0
    paye_breakdown: Optional[dict] = None

    model_config = ConfigDict(from_attributes=True)


class PayrollErrorResponse(BaseModel):
    id: int
    payroll_period_id: int
    guard_id: Optional[int] = None
    employee_number: Optional[str] = None
    guard_name: Optional[str] = None
    error_code: str
    error_message: str
    severity: str
    status: str
    resolution_notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PayrollCalculationSummary(BaseModel):
    period_id: int
    period_name: str
    total_employees: int
    total_gross_payroll: float
    total_net_payroll: float
    total_nssf: float
    total_shif: float
    total_housing_levy: float
    total_paye: float
    total_employer_nssf: Optional[float] = 0.0
    total_employer_housing_levy: Optional[float] = 0.0
    total_employer_statutory: Optional[float] = 0.0
    error_count: int
    status: str = "CALCULATED"


class ResolveErrorRequest(BaseModel):
    status: str = "IGNORED" # FIXED, IGNORED
    reason: str
