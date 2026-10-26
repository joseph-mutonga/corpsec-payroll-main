from datetime import datetime
from typing import Optional, List, Dict
from pydantic import BaseModel, ConfigDict


class SettingItem(BaseModel):
    key: str
    value: str
    description: Optional[str] = None
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class SettingUpdateRequest(BaseModel):
    settings: Dict[str, str]


class ArchivePayrollResponse(BaseModel):
    id: int
    payroll_period_id: int
    period_name: str
    year: int
    month: int
    total_guards: int
    total_gross_pay: float
    total_deductions: float
    total_net_pay: float
    closed_at: datetime
    closed_by: str

    model_config = ConfigDict(from_attributes=True)
