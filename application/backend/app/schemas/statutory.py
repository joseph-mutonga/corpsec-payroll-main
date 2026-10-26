from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field


class NssfTierSchema(BaseModel):
    id: Optional[int] = None
    tier_number: int = 1
    tier_name: str
    rate: float = Field(..., ge=0.0, description="Rate percentage, e.g. 6.0")
    lower_limit: float = Field(0.0, ge=0.0)
    upper_limit: Optional[float] = None  # None = uncapped
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None

    model_config = ConfigDict(from_attributes=True)


class ShifRateSchema(BaseModel):
    id: Optional[int] = None
    employee_rate: float = Field(..., ge=0.0, description="Employee rate percentage, e.g. 2.75")
    minimum_floor: float = Field(300.0, ge=0.0)
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None

    model_config = ConfigDict(from_attributes=True)


class HousingLevySchema(BaseModel):
    id: Optional[int] = None
    employee_rate: float = Field(..., ge=0.0, description="Employee rate percentage, e.g. 1.5")
    employer_rate: float = Field(..., ge=0.0, description="Employer rate percentage, e.g. 1.5")
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None

    model_config = ConfigDict(from_attributes=True)


class PayeBandSchema(BaseModel):
    id: Optional[int] = None
    band_order: int = 1
    lower_limit: float = Field(0.0, ge=0.0)
    upper_limit: Optional[float] = None  # None = uncapped
    rate: float = Field(..., ge=0.0, description="Rate percentage, e.g. 10.0")
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None

    model_config = ConfigDict(from_attributes=True)


class PayeReliefSchema(BaseModel):
    id: Optional[int] = None
    monthly_relief: float = Field(2400.0, ge=0.0)
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None

    model_config = ConfigDict(from_attributes=True)


class CurrentStatutoryRatesResponse(BaseModel):
    nssf_tiers: List[NssfTierSchema]
    shif: Optional[ShifRateSchema] = None
    housing_levy: Optional[HousingLevySchema] = None
    paye_bands: List[PayeBandSchema]
    paye_relief: Optional[PayeReliefSchema] = None


class NssfTiersUpdateRequest(BaseModel):
    tiers: List[NssfTierSchema]
    effective_from: date
    change_reason: str = Field(..., min_length=3, description="Short reason for rate change")


class ShifUpdateRequest(BaseModel):
    employee_rate: float = Field(..., ge=0.0)
    minimum_floor: float = Field(300.0, ge=0.0)
    effective_from: date
    change_reason: str = Field(..., min_length=3)


class HousingLevyUpdateRequest(BaseModel):
    employee_rate: float = Field(..., ge=0.0)
    employer_rate: float = Field(..., ge=0.0)
    effective_from: date
    change_reason: str = Field(..., min_length=3)


class PayeUpdateRequest(BaseModel):
    bands: List[PayeBandSchema]
    monthly_relief: float = Field(2400.0, ge=0.0)
    effective_from: date
    change_reason: str = Field(..., min_length=3)


class RateHistoryItem(BaseModel):
    id: int
    statutory_type: str  # NSSF, SHIF, HOUSING_LEVY, PAYE_BAND, PAYE_RELIEF
    title: str
    details: str
    effective_from: date
    effective_to: Optional[date] = None
    is_active: bool
    change_reason: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
