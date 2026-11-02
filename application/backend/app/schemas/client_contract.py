from datetime import date, datetime
from typing import List, Optional, Any
from pydantic import BaseModel, ConfigDict, Field, model_validator, computed_field


# --- Client Schemas ---
class ClientBase(BaseModel):
    name: str
    business_registration_no: Optional[str] = None
    kra_pin: Optional[str] = None
    client_type: str = "CORPORATE"  # CORPORATE, RESIDENTIAL, COMMERCIAL, FACTORY, SCHOOL, HOSPITAL, GOVERNMENT, PRIVATE, OTHER
    industry: Optional[str] = None
    physical_address: str
    postal_address: Optional[str] = None
    county: str = "Nairobi"
    contact_person: str
    designation: Optional[str] = None
    phone: str
    email: Optional[str] = None
    alternative_phone: Optional[str] = None
    status: str = "ACTIVE"
    notes: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "primary_contact_name" in data and not data.get("contact_person"):
                data["contact_person"] = data["primary_contact_name"]
            if "primary_contact_phone" in data and not data.get("phone"):
                data["phone"] = data["primary_contact_phone"]
            if "primary_contact_email" in data and not data.get("email"):
                data["email"] = data["primary_contact_email"]
            if "city" in data and not data.get("county"):
                data["county"] = data["city"]
            if "tax_pin" in data and not data.get("kra_pin"):
                data["kra_pin"] = data["tax_pin"]
            if "primary_contact_designation" in data and not data.get("designation"):
                data["designation"] = data["primary_contact_designation"]
        return data


class ClientCreate(ClientBase):
    client_code: Optional[str] = None
    date_registered: Optional[date] = None


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    business_registration_no: Optional[str] = None
    kra_pin: Optional[str] = None
    client_type: Optional[str] = None
    industry: Optional[str] = None
    physical_address: Optional[str] = None
    postal_address: Optional[str] = None
    county: Optional[str] = None
    contact_person: Optional[str] = None
    designation: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    alternative_phone: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def map_update_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "primary_contact_name" in data and not data.get("contact_person"):
                data["contact_person"] = data["primary_contact_name"]
            if "primary_contact_phone" in data and not data.get("phone"):
                data["phone"] = data["primary_contact_phone"]
            if "primary_contact_email" in data and not data.get("email"):
                data["email"] = data["primary_contact_email"]
            if "city" in data and not data.get("county"):
                data["county"] = data["city"]
            if "tax_pin" in data and not data.get("kra_pin"):
                data["kra_pin"] = data["tax_pin"]
            if "primary_contact_designation" in data and not data.get("designation"):
                data["designation"] = data["primary_contact_designation"]
        return data


class ClientResponse(ClientBase):
    id: int
    client_code: str
    date_registered: date
    created_at: datetime
    updated_at: datetime
    active_contracts_count: int = 0
    total_guards_deployed: int = 0
    sites_count: int = 0

    @computed_field
    def primary_contact_name(self) -> Optional[str]:
        return self.contact_person

    @computed_field
    def primary_contact_phone(self) -> Optional[str]:
        return self.phone

    @computed_field
    def primary_contact_email(self) -> Optional[str]:
        return self.email

    @computed_field
    def city(self) -> str:
        return self.county

    @computed_field
    def tax_pin(self) -> Optional[str]:
        return self.kra_pin

    @computed_field
    def primary_contact_designation(self) -> Optional[str]:
        return self.designation

    model_config = ConfigDict(from_attributes=True)


# --- Contract Schemas ---
class ClientContractBase(BaseModel):
    client_id: int
    title: str
    description: Optional[str] = None
    contract_type: str = "SECURITY_GUARDING"
    start_date: date
    end_date: date
    contract_value: float = 0.0
    monthly_charge: float = 0.0
    billing_frequency: str = "MONTHLY"
    payment_terms: str = "14 Days Net"
    guards_required: int = 1
    supervisors_required: int = 1
    status: str = "ACTIVE"  # DRAFT, PENDING_APPROVAL, ACTIVE, EXPIRING_SOON, EXPIRED, RENEWED, SUSPENDED, TERMINATED
    special_terms: Optional[str] = None
    document_url: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "contract_reference" in data and not data.get("contract_ref"):
                data["contract_ref"] = data["contract_reference"]
            if "total_contract_value" in data and "contract_value" not in data:
                data["contract_value"] = data["total_contract_value"]
            if "monthly_service_charge" in data and "monthly_charge" not in data:
                data["monthly_charge"] = data["monthly_service_charge"]
            if "special_terms_and_conditions" in data and not data.get("special_terms"):
                data["special_terms"] = data["special_terms_and_conditions"]
        return data


class ClientContractCreate(ClientContractBase):
    contract_ref: Optional[str] = None


class ClientContractUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    contract_type: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    contract_value: Optional[float] = None
    monthly_charge: Optional[float] = None
    billing_frequency: Optional[str] = None
    payment_terms: Optional[str] = None
    guards_required: Optional[int] = None
    supervisors_required: Optional[int] = None
    status: Optional[str] = None
    special_terms: Optional[str] = None
    document_url: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def map_update_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "total_contract_value" in data and "contract_value" not in data:
                data["contract_value"] = data["total_contract_value"]
            if "monthly_service_charge" in data and "monthly_charge" not in data:
                data["monthly_charge"] = data["monthly_service_charge"]
            if "special_terms_and_conditions" in data and not data.get("special_terms"):
                data["special_terms"] = data["special_terms_and_conditions"]
        return data


class ContractRenewalRequest(BaseModel):
    new_start_date: date
    new_end_date: date
    new_contract_value: float = 0.0
    new_monthly_charge: float = 0.0
    guards_required: int = 1
    supervisors_required: int = 1
    special_terms: Optional[str] = None
    payment_terms: str = "14 Days Net"

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "new_total_value" in data and "new_contract_value" not in data:
                data["new_contract_value"] = data["new_total_value"]
            if "special_terms_and_conditions" in data and not data.get("special_terms"):
                data["special_terms"] = data["special_terms_and_conditions"]
        return data


class ContractDeploymentCreate(BaseModel):
    site_id: int
    primary_supervisor_id: Optional[int] = None
    guards_target: int = 1
    commencement_date: date = Field(default_factory=date.today)
    notes: Optional[str] = None


class ContractDeploymentResponse(BaseModel):
    id: int
    contract_id: int
    site_id: int
    site_name: Optional[str] = None
    location: Optional[str] = None
    primary_supervisor_id: Optional[int] = None
    supervisor_name: Optional[str] = None
    guards_target: int
    active_guards_assigned: int = 0
    commencement_date: date
    status: str
    notes: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ClientContractResponse(ClientContractBase):
    id: int
    contract_ref: str
    client_name: Optional[str] = None
    version: int
    previous_contract_id: Optional[int] = None
    contract_manager_user_id: Optional[int] = None
    contract_manager_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    deployments: List[ContractDeploymentResponse] = Field(default_factory=list)

    @computed_field
    def contract_reference(self) -> str:
        return self.contract_ref

    @computed_field
    def monthly_service_charge(self) -> float:
        return self.monthly_charge

    @computed_field
    def total_contract_value(self) -> float:
        return self.contract_value

    @computed_field
    def special_terms_and_conditions(self) -> Optional[str]:
        return self.special_terms

    model_config = ConfigDict(from_attributes=True)
