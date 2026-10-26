from datetime import datetime, date
from typing import Optional, Union
from pydantic import BaseModel, Field, ConfigDict


class SiteCreate(BaseModel):
    site_name: str = Field(..., min_length=2)
    location: str
    client_name: str
    region_id: Optional[int] = None
    basic_salary: float = Field(..., gt=0, description="Default basic salary for guards at this site")
    daily_rate: float = 1300.0
    night_allowance: float = 200.0
    transport_allowance: float = 100.0
    housing_allowance: float = 150.0


class SiteUpdate(BaseModel):
    site_name: Optional[str] = None
    location: Optional[str] = None
    client_name: Optional[str] = None
    region_id: Optional[int] = None
    basic_salary: Optional[float] = None
    daily_rate: Optional[float] = None
    night_allowance: Optional[float] = None
    transport_allowance: Optional[float] = None
    housing_allowance: Optional[float] = None


class BulkSalaryChangeRequest(BaseModel):
    change_type: str = "FLAT_AMOUNT"  # PERCENTAGE or FLAT_AMOUNT
    adjustment_value: float = 0.0
    new_daily_rate: Optional[float] = None
    new_night_allowance: Optional[float] = None
    effective_date: Union[str, date] = Field(..., description="YYYY-MM-DD")
    reason: str = Field(..., min_length=3)
    is_preview: bool = False


class BulkSalaryChangePreviewResponse(BaseModel):
    site_name: str
    guards_affected: int = 0
    affected_guards_count: int = 0
    old_daily_rate: float = 0.0
    new_daily_rate: float = 0.0
    new_night_allowance: float = 0.0
    applied: bool = True
    effective_date: Union[str, date]


class SiteResponse(BaseModel):
    id: int
    site_name: str
    location: str
    client_name: str
    region_id: Optional[int] = None
    region_name: Optional[str] = None
    basic_salary: float = 15000.0
    daily_rate: float
    night_allowance: float
    transport_allowance: float
    housing_allowance: float
    guard_count: int = 0
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
