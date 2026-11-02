from datetime import date, datetime
from typing import List, Optional, Any
from pydantic import BaseModel, ConfigDict, Field, model_validator, computed_field


# --- Asset Category ---
class AssetCategoryBase(BaseModel):
    name: str
    code: str
    description: Optional[str] = None


class AssetCategoryCreate(AssetCategoryBase):
    pass


class AssetCategoryResponse(AssetCategoryBase):
    id: int
    is_system: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


# --- Asset ---
class AssetBase(BaseModel):
    name: str
    category_id: int
    description: Optional[str] = None
    serial_number: Optional[str] = None
    make_model: Optional[str] = None
    purchase_date: date
    purchase_cost: float = 0.0
    supplier_name: Optional[str] = None
    salvage_value: float = 0.0
    depreciation_method: str = "STRAIGHT_LINE"  # STRAIGHT_LINE, REDUCING_BALANCE, NONE
    depreciation_rate_annual: float = 10.0
    condition: str = "GOOD"  # NEW, EXCELLENT, GOOD, FAIR, POOR, DAMAGED
    status: str = "AVAILABLE"  # AVAILABLE, ALLOCATED, UNDER_MAINTENANCE, DISPOSED, LOST
    location_branch: str = "Head Office"
    warranty_expiry: Optional[date] = None
    notes: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "purchase_price" in data and "purchase_cost" not in data:
                data["purchase_cost"] = data["purchase_price"]
            if "depreciation_rate" in data and "depreciation_rate_annual" not in data:
                data["depreciation_rate_annual"] = data["depreciation_rate"]
            if "current_location" in data and "location_branch" not in data:
                data["location_branch"] = data["current_location"]
            if ("make" in data or "model" in data) and not data.get("make_model"):
                make = data.get("make", "") or ""
                model = data.get("model", "") or ""
                data["make_model"] = f"{make} {model}".strip() or None
            # Map status aliases: IN_STOCK -> AVAILABLE, ASSIGNED -> ALLOCATED
            if data.get("status") == "IN_STOCK":
                data["status"] = "AVAILABLE"
            elif data.get("status") == "ASSIGNED":
                data["status"] = "ALLOCATED"
        return data


class AssetCreate(AssetBase):
    asset_tag: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def map_tag(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "asset_code" in data and not data.get("asset_tag"):
                data["asset_tag"] = data["asset_code"]
        return data


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[int] = None
    description: Optional[str] = None
    serial_number: Optional[str] = None
    make_model: Optional[str] = None
    purchase_date: Optional[date] = None
    purchase_cost: Optional[float] = None
    supplier_name: Optional[str] = None
    current_value: Optional[float] = None
    salvage_value: Optional[float] = None
    depreciation_method: Optional[str] = None
    depreciation_rate_annual: Optional[float] = None
    condition: Optional[str] = None
    status: Optional[str] = None
    location_branch: Optional[str] = None
    warranty_expiry: Optional[date] = None
    notes: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "purchase_price" in data and "purchase_cost" not in data:
                data["purchase_cost"] = data["purchase_price"]
            if "depreciation_rate" in data and "depreciation_rate_annual" not in data:
                data["depreciation_rate_annual"] = data["depreciation_rate"]
            if "current_location" in data and "location_branch" not in data:
                data["location_branch"] = data["current_location"]
            if ("make" in data or "model" in data) and not data.get("make_model"):
                make = data.get("make", "") or ""
                model = data.get("model", "") or ""
                data["make_model"] = f"{make} {model}".strip() or None
            if data.get("status") == "IN_STOCK":
                data["status"] = "AVAILABLE"
            elif data.get("status") == "ASSIGNED":
                data["status"] = "ALLOCATED"
        return data


class AssetResponse(AssetBase):
    id: int
    asset_tag: str
    current_value: float
    assigned_to_employee_id: Optional[int] = None
    assigned_to_site_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    category_name: Optional[str] = None
    assigned_employee_name: Optional[str] = None
    assigned_site_name: Optional[str] = None

    @computed_field
    def asset_code(self) -> str:
        return self.asset_tag

    @computed_field
    def purchase_price(self) -> float:
        return self.purchase_cost

    @computed_field
    def current_location(self) -> str:
        return self.location_branch

    @computed_field
    def make(self) -> Optional[str]:
        if self.make_model:
            parts = self.make_model.split(maxsplit=1)
            return parts[0]
        return None

    @computed_field
    def model(self) -> Optional[str]:
        if self.make_model:
            parts = self.make_model.split(maxsplit=1)
            return parts[1] if len(parts) > 1 else None
        return None

    model_config = ConfigDict(from_attributes=True)


# --- Allocation ---
class AssetAllocationCreate(BaseModel):
    asset_id: int
    allocation_type: str = "EMPLOYEE"  # EMPLOYEE, STAFF, SITE, BRANCH
    guard_id: Optional[int] = None
    staff_id: Optional[int] = None
    site_id: Optional[int] = None
    branch_name: Optional[str] = None
    allocated_date: date = Field(default_factory=date.today)
    expected_return_date: Optional[date] = None
    condition_on_allocation: str = "GOOD"
    notes: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "condition_at_handover" in data and not data.get("condition_on_allocation"):
                data["condition_on_allocation"] = data["condition_at_handover"]
            if "user_id" in data and not data.get("staff_id"):
                data["staff_id"] = data["user_id"]
        return data


class AssetReturnRequest(BaseModel):
    return_date: date = Field(default_factory=date.today)
    condition_on_return: str = "GOOD"
    notes: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "condition_at_return" in data and not data.get("condition_on_return"):
                data["condition_on_return"] = data["condition_at_return"]
            if "return_notes" in data and not data.get("notes"):
                data["notes"] = data["return_notes"]
        return data


class AssetAllocationResponse(BaseModel):
    id: int
    asset_id: int
    asset_tag: Optional[str] = None
    asset_name: Optional[str] = None
    allocation_type: str
    guard_id: Optional[int] = None
    guard_name: Optional[str] = None
    staff_id: Optional[int] = None
    staff_name: Optional[str] = None
    staff_email: Optional[str] = None
    asset_serial: Optional[str] = None
    asset_category: Optional[str] = None
    site_id: Optional[int] = None
    site_name: Optional[str] = None
    branch_name: Optional[str] = None
    allocated_date: date
    expected_return_date: Optional[date] = None
    return_date: Optional[date] = None
    status: str
    condition_on_allocation: str
    condition_on_return: Optional[str] = None
    notes: Optional[str] = None
    allocated_by_user_id: Optional[int] = None
    created_at: datetime

    @computed_field
    def condition(self) -> str:
        return self.condition_on_return or self.condition_on_allocation

    model_config = ConfigDict(from_attributes=True)


# --- Maintenance ---
class AssetMaintenanceCreate(BaseModel):
    asset_id: int
    maintenance_type: str = "PREVENTIVE"  # PREVENTIVE, REPAIR, INSPECTION, OVERHAUL
    description: str
    service_provider: str
    cost: float = 0.0
    maintenance_date: date = Field(default_factory=date.today)
    next_due_date: Optional[date] = None
    status: str = "COMPLETED"  # SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED
    invoice_receipt_no: Optional[str] = None
    notes: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "invoice_or_receipt_no" in data and not data.get("invoice_receipt_no"):
                data["invoice_receipt_no"] = data["invoice_or_receipt_no"]
            if "next_maintenance_date" in data and not data.get("next_due_date"):
                data["next_due_date"] = data["next_maintenance_date"]
        return data


class AssetMaintenanceResponse(AssetMaintenanceCreate):
    id: int
    asset_tag: Optional[str] = None
    asset_name: Optional[str] = None
    logged_by_user_id: Optional[int] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Inventory ---
class InventoryItemBase(BaseModel):
    item_name: str
    category: str
    description: Optional[str] = None
    unit_of_measure: str = "PIECES"
    unit_cost: float = 0.0
    minimum_stock_level: int = 5
    reorder_quantity: int = 10
    storage_location: str = "Main Logistics Store, Nairobi"

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "min_stock_level" in data and "minimum_stock_level" not in data:
                data["minimum_stock_level"] = data["min_stock_level"]
        return data


class InventoryItemCreate(InventoryItemBase):
    item_code: Optional[str] = None
    initial_stock: int = 0

    @model_validator(mode="before")
    @classmethod
    def map_stock(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "current_stock" in data and "initial_stock" not in data:
                data["initial_stock"] = data["current_stock"]
        return data


class InventoryItemUpdate(BaseModel):
    item_name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    unit_of_measure: Optional[str] = None
    unit_cost: Optional[float] = None
    minimum_stock_level: Optional[int] = None
    reorder_quantity: Optional[int] = None
    storage_location: Optional[str] = None


class InventoryItemResponse(InventoryItemBase):
    id: int
    item_code: str
    current_stock: int
    created_at: datetime
    updated_at: datetime

    @computed_field
    def min_stock_level(self) -> int:
        return self.minimum_stock_level

    @computed_field
    def total_valuation(self) -> float:
        return round(self.current_stock * self.unit_cost, 2)

    model_config = ConfigDict(from_attributes=True)


class InventoryTransactionCreate(BaseModel):
    item_id: int
    transaction_type: str  # RECEIVED, ISSUED, RETURNED, ADJUSTMENT
    quantity: int
    unit_cost: Optional[float] = None
    reference_no: Optional[str] = None
    issued_to_guard_id: Optional[int] = None
    issued_to_staff_id: Optional[int] = None
    issued_to_site_id: Optional[int] = None
    reason_notes: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def map_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "guard_id" in data and not data.get("issued_to_guard_id"):
                data["issued_to_guard_id"] = data["guard_id"]
            if "site_id" in data and not data.get("issued_to_site_id"):
                data["issued_to_site_id"] = data["site_id"]
            if "staff_id" in data and not data.get("issued_to_staff_id"):
                data["issued_to_staff_id"] = data["staff_id"]
            if "reference_number" in data and not data.get("reference_no"):
                data["reference_no"] = data["reference_number"]
            if "notes" in data and not data.get("reason_notes"):
                data["reason_notes"] = data["notes"]
            # Map transaction types
            tt = str(data.get("transaction_type", "")).upper()
            if tt == "STOCK_IN":
                data["transaction_type"] = "RECEIVED"
            elif tt in ["STOCK_OUT", "DISPATCH"]:
                data["transaction_type"] = "ISSUED"
            elif tt == "RETURN":
                data["transaction_type"] = "RETURNED"
        return data


class InventoryTransactionResponse(BaseModel):
    id: int
    item_id: int
    item_code: Optional[str] = None
    item_name: Optional[str] = None
    transaction_type: str
    quantity: int
    unit_cost: float
    total_cost: float
    reference_no: Optional[str] = None
    issued_to_guard_id: Optional[int] = None
    issued_guard_name: Optional[str] = None
    issued_to_staff_id: Optional[int] = None
    issued_staff_name: Optional[str] = None
    issued_to_site_id: Optional[int] = None
    issued_site_name: Optional[str] = None
    reason_notes: Optional[str] = None
    processed_by_user_id: Optional[int] = None
    created_at: datetime

    current_stock: int = 0

    @computed_field
    def guard_name(self) -> Optional[str]:
        return self.issued_guard_name

    @computed_field
    def site_name(self) -> Optional[str]:
        return self.issued_site_name

    @computed_field
    def reference_number(self) -> Optional[str]:
        return self.reference_no

    @computed_field
    def notes(self) -> Optional[str]:
        return self.reason_notes

    @computed_field
    def transaction_date(self) -> datetime:
        return self.created_at

    model_config = ConfigDict(from_attributes=True)
