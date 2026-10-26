from datetime import date, datetime
from typing import Optional, Union
from pydantic import BaseModel, EmailStr, Field, ConfigDict


class GuardCreate(BaseModel):
    employee_number: str = Field(..., description="Unique Employee ID (e.g. CS-00452)")
    full_name: str
    national_id: str
    phone: str
    email: Optional[EmailStr] = None
    initial_password: Optional[str] = Field(None, min_length=6, description="Initial Guard Portal password set by admin")
    date_of_birth: Optional[date] = None
    gender: str = "Male"
    
    site_id: Optional[int] = None
    shift_id: Optional[int] = None
    
    hire_date: date
    basic_salary: Union[float, None] = None  # None -> inherits site basic salary; set -> per-guard override
    is_reliever: bool = False
    
    payment_method: str = "Bank Transfer"  # Bank Transfer or M-Pesa
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    mpesa_number: Optional[str] = None
    
    nssf_number: Optional[str] = None
    shif_number: Optional[str] = None
    kra_pin: Optional[str] = None


class GuardUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    gender: Optional[str] = None
    site_id: Optional[int] = None
    shift_id: Optional[int] = None
    basic_salary: Optional[float] = None
    is_reliever: Optional[bool] = None
    payment_method: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    mpesa_number: Optional[str] = None
    nssf_number: Optional[str] = None
    shif_number: Optional[str] = None
    kra_pin: Optional[str] = None


class GuardDeactivateRequest(BaseModel):
    reason: str = Field(..., min_length=3, description="Reason for deactivation")


class GuardResponse(BaseModel):
    id: int
    employee_number: str
    full_name: str
    national_id: str
    phone: str
    email: Optional[str] = None
    site_id: Optional[int] = None
    shift_id: Optional[int] = None
    hire_date: date
    basic_salary: Optional[float] = None
    resolved_basic_salary: Optional[float] = None
    is_reliever: bool = False
    payment_method: str
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    mpesa_number: Optional[str] = None
    nssf_number: Optional[str] = None
    shif_number: Optional[str] = None
    kra_pin: Optional[str] = None
    status: str
    deactivation_reason: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SiteMinimal(BaseModel):
    id: int
    site_name: str
    location: str
    daily_rate: float
    basic_salary: float = 15000.0
    model_config = ConfigDict(from_attributes=True)


class ShiftMinimal(BaseModel):
    id: int
    name: str
    shift_type: str
    start_time: str
    end_time: str
    model_config = ConfigDict(from_attributes=True)


class GuardDetailResponse(GuardResponse):
    site: Optional[SiteMinimal] = None
    shift: Optional[ShiftMinimal] = None
