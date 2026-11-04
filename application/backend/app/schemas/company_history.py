from datetime import date, datetime
from typing import List, Optional, Any
from pydantic import BaseModel, ConfigDict, Field, model_validator, computed_field


# --- Company Profile Schemas ---
class CompanyProfileBase(BaseModel):
    official_name: str = "CorpSec Security Services Ltd"
    trading_name: str = "CorpSec Premier Security"
    registration_number: str = "CPR/2018/385560"
    kra_pin: str = "P051234567X"
    incorporation_date: date = Field(default_factory=lambda: date(2018, 3, 15))
    operations_commenced_date: date = Field(default_factory=lambda: date(2018, 6, 1))
    slogan: str = "Vigilance, Integrity, Protection & Professional Excellence"
    physical_address: str = "Upper Hill Financial District, Cathedral Rd, CorpSec Plaza, 4th Floor"
    postal_address: str = "P.O. Box 45123 - 00100, Nairobi, Kenya"
    county: str = "Nairobi"
    phone: str = "+254 700 000 000"
    email: str = "info@corpsec.co.ke"
    website: str = "https://www.corpsec.co.ke"
    business_description: str = "Licensed private security service contractor providing static guarding, executive close protection, rapid alarm response and security risk consulting across East Africa."
    mission_statement: str = "To provide disciplined, dependable and technologically advanced security solutions."
    vision_statement: str = "To be Kenya's most trusted and respected private security provider."
    core_values: str = "Integrity, Vigilance, Professionalism, Accountability"
    psra_license_number: str = "PSRA/2026/A-0042"
    branches_summary: str = "Nairobi HQ, Mombasa Coastal Detachment, Kisumu Lake Detachment, Nakuru Rift Detachment"

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "company_name" in data and not data.get("official_name"):
                data["official_name"] = data["company_name"]
            if "trading_brand_name" in data and not data.get("trading_name"):
                data["trading_name"] = data["trading_brand_name"]
            if "tax_pin" in data and not data.get("kra_pin"):
                data["kra_pin"] = data["tax_pin"]
            if "primary_phone" in data and not data.get("phone"):
                data["phone"] = data["primary_phone"]
            if "primary_email" in data and not data.get("email"):
                data["email"] = data["primary_email"]
            if "headquarters_address" in data and not data.get("physical_address"):
                data["physical_address"] = data["headquarters_address"]
        return data


class CompanyProfileUpdate(BaseModel):
    official_name: Optional[str] = None
    trading_name: Optional[str] = None
    registration_number: Optional[str] = None
    kra_pin: Optional[str] = None
    incorporation_date: Optional[date] = None
    operations_commenced_date: Optional[date] = None
    slogan: Optional[str] = None
    physical_address: Optional[str] = None
    postal_address: Optional[str] = None
    county: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    business_description: Optional[str] = None
    mission_statement: Optional[str] = None
    vision_statement: Optional[str] = None
    core_values: Optional[str] = None
    psra_license_number: Optional[str] = None
    branches_summary: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "company_name" in data and not data.get("official_name"):
                data["official_name"] = data["company_name"]
            if "trading_brand_name" in data and not data.get("trading_name"):
                data["trading_name"] = data["trading_brand_name"]
            if "tax_pin" in data and not data.get("kra_pin"):
                data["kra_pin"] = data["tax_pin"]
            if "primary_phone" in data and not data.get("phone"):
                data["phone"] = data["primary_phone"]
            if "primary_email" in data and not data.get("email"):
                data["email"] = data["primary_email"]
            if "headquarters_address" in data and not data.get("physical_address"):
                data["physical_address"] = data["headquarters_address"]
        return data


class CompanyProfileResponse(CompanyProfileBase):
    id: int
    updated_at: datetime
    updated_by_user_id: Optional[int] = None
    updated_by_name: Optional[str] = None

    @computed_field
    def company_name(self) -> str:
        return self.official_name

    @computed_field
    def trading_brand_name(self) -> str:
        return self.trading_name

    @computed_field
    def tax_pin(self) -> str:
        return self.kra_pin

    @computed_field
    def primary_phone(self) -> str:
        return self.phone

    @computed_field
    def primary_email(self) -> str:
        return self.email

    @computed_field
    def headquarters_address(self) -> str:
        return self.physical_address

    model_config = ConfigDict(from_attributes=True)


# --- Founding History Schemas ---
class CompanyFoundingHistoryBase(BaseModel):
    founding_date: date = Field(default_factory=lambda: date(2018, 3, 15))
    founder_names: str = "Col. (Rtd) James Mwangi & Capt. Beatrice Wanjiku"
    original_location: str = "Industrial Area, Enterprise Road, Nairobi"
    initial_capital: float = 2500000.0
    initial_guards_count: int = 12
    background_story: str = "Founded in early 2018 by veteran security and risk management professionals."
    original_equipment_description: Optional[str] = None
    first_client_name: Optional[str] = None
    first_client_commencement_date: Optional[date] = None


class CompanyFoundingHistoryUpdate(BaseModel):
    founding_date: Optional[date] = None
    founder_names: Optional[str] = None
    original_location: Optional[str] = None
    initial_capital: Optional[float] = None
    initial_guards_count: Optional[int] = None
    background_story: Optional[str] = None
    original_equipment_description: Optional[str] = None
    first_client_name: Optional[str] = None
    first_client_commencement_date: Optional[date] = None


class CompanyFoundingHistoryResponse(CompanyFoundingHistoryBase):
    id: int
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_orm_model(cls, obj: Any):
        return cls(
            id=obj.id,
            founding_date=obj.founding_date,
            original_location=obj.original_location,
            initial_capital=obj.initial_capital,
            initial_guards_count=getattr(obj, "initial_employee_count", 12) or 12,
            founder_names=getattr(obj, "founder_summary", None) or "Col. (Rtd) James Mwangi & Capt. Beatrice Wanjiku",
            background_story=getattr(obj, "narrative_history", None) or "Founded in early 2018 by veteran security and risk management professionals.",
            created_at=obj.created_at,
            updated_at=obj.updated_at
        )

    model_config = ConfigDict(from_attributes=True)


# --- Milestone Schemas ---
class CompanyMilestoneBase(BaseModel):
    event_title: str = ""
    event_date: date = Field(default_factory=date.today)
    category: str = "EXPANSION"
    description: str = ""
    location: Optional[str] = None
    significance: Optional[str] = None
    order_index: int = 0

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "title" in data and not data.get("event_title"):
                data["event_title"] = data["title"]
            if "milestone_date" in data and not data.get("event_date"):
                data["event_date"] = data["milestone_date"]
        return data


class CompanyMilestoneCreate(CompanyMilestoneBase):
    pass


class CompanyMilestoneUpdate(BaseModel):
    title: Optional[str] = None
    event_title: Optional[str] = None
    milestone_date: Optional[date] = None
    event_date: Optional[date] = None
    category: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    significance: Optional[str] = None
    order_index: Optional[int] = None

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "title" in data and not data.get("event_title"):
                data["event_title"] = data["title"]
            if "milestone_date" in data and not data.get("event_date"):
                data["event_date"] = data["milestone_date"]
        return data


class CompanyMilestoneResponse(CompanyMilestoneBase):
    id: int
    recorded_by_name: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    @computed_field
    def title(self) -> str:
        return self.event_title

    @computed_field
    def milestone_date(self) -> date:
        return self.event_date

    model_config = ConfigDict(from_attributes=True)


# --- Ownership Schemas ---
class CompanyOwnershipRecordBase(BaseModel):
    person_or_entity_name: str
    role_title: str = "DIRECTOR"
    role: Optional[str] = None
    shareholding_percentage: float = 0.0
    number_of_shares: int = 0
    shares_count: Optional[int] = None
    appointment_date: date
    resignation_date: Optional[date] = None
    national_id_or_registration: Optional[str] = None
    board_resolution_ref: Optional[str] = None
    resolution_reference: Optional[str] = None
    status: str = "ACTIVE"
    contact_info: Optional[str] = None
    notes: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "role_title" in data and not data.get("role"):
                data["role"] = data["role_title"]
            elif "role" in data and not data.get("role_title"):
                data["role_title"] = data["role"]
            if "number_of_shares" in data and "shares_count" not in data:
                data["shares_count"] = data["number_of_shares"]
            elif "shares_count" in data and "number_of_shares" not in data:
                data["number_of_shares"] = data["shares_count"]
            if "board_resolution_ref" in data and not data.get("resolution_reference"):
                data["resolution_reference"] = data["board_resolution_ref"]
            elif "resolution_reference" in data and not data.get("board_resolution_ref"):
                data["board_resolution_ref"] = data["resolution_reference"]
        return data


class CompanyOwnershipRecordCreate(CompanyOwnershipRecordBase):
    pass


class CompanyOwnershipRecordUpdate(BaseModel):
    person_or_entity_name: Optional[str] = None
    role_title: Optional[str] = None
    role: Optional[str] = None
    shareholding_percentage: Optional[float] = None
    number_of_shares: Optional[int] = None
    shares_count: Optional[int] = None
    appointment_date: Optional[date] = None
    resignation_date: Optional[date] = None
    national_id_or_registration: Optional[str] = None
    board_resolution_ref: Optional[str] = None
    resolution_reference: Optional[str] = None
    status: Optional[str] = None
    contact_info: Optional[str] = None
    notes: Optional[str] = None


class CompanyOwnershipRecordResponse(CompanyOwnershipRecordBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    @classmethod
    def from_orm_model(cls, obj: Any):
        r = getattr(obj, "role", "DIRECTOR")
        s = getattr(obj, "shares_count", 0)
        res_ref = getattr(obj, "resolution_reference", None)
        return cls(
            id=obj.id,
            person_or_entity_name=obj.person_or_entity_name,
            role_title=r,
            role=r,
            shareholding_percentage=obj.shareholding_percentage,
            number_of_shares=s,
            shares_count=s,
            appointment_date=obj.appointment_date,
            resignation_date=obj.resignation_date,
            board_resolution_ref=res_ref,
            resolution_reference=res_ref,
            status=obj.status,
            notes=obj.notes,
            created_at=obj.created_at,
            updated_at=getattr(obj, "updated_at", None)
        )

    model_config = ConfigDict(from_attributes=True)


# --- Company Recommendations Schemas ---
class CompanyRecommendationCreate(BaseModel):
    client_name: str = Field(..., min_length=2)
    author_name: str = Field(..., min_length=2)
    designation: str = Field(..., min_length=2)
    rating: int = Field(default=5, ge=1, le=5)
    recommendation_date: Optional[date] = None
    recommendation_text: str = Field(..., min_length=5)
    service_scope: Optional[str] = None


class CompanyRecommendationResponse(BaseModel):
    id: int
    client_name: str
    author_name: str
    designation: str
    rating: int
    recommendation_date: date
    recommendation_text: str
    service_scope: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Company Services Schemas ---
class CompanyServiceCreate(BaseModel):
    service_code: str = Field(..., min_length=2)
    service_name: str = Field(..., min_length=2)
    category: str = Field(default="PHYSICAL_SECURITY")
    description: str = Field(..., min_length=5)
    sla_standard: Optional[str] = None
    billing_rate_guideline: Optional[str] = None
    active_sites_count: int = 0
    is_active: bool = True


class CompanyServiceResponse(BaseModel):
    id: int
    service_code: str
    service_name: str
    category: str
    description: str
    sla_standard: Optional[str] = None
    billing_rate_guideline: Optional[str] = None
    active_sites_count: int = 0
    is_active: bool = True
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
