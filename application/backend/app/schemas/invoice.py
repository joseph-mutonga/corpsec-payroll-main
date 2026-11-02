from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class InvoiceItemBase(BaseModel):
    item_name: str
    description: Optional[str] = None
    quantity: float = 1.0
    unit_price: float = 0.0
    tax_rate: float = 16.0
    amount: Optional[float] = None


class InvoiceItemCreate(InvoiceItemBase):
    pass


class InvoiceItemUpdate(BaseModel):
    id: Optional[int] = None
    item_name: str
    description: Optional[str] = None
    quantity: float = 1.0
    unit_price: float = 0.0
    tax_rate: float = 16.0
    amount: Optional[float] = None


class InvoiceItemResponse(InvoiceItemBase):
    id: int
    invoice_id: int
    amount: float
    model_config = ConfigDict(from_attributes=True)


class SiteInvoiceBase(BaseModel):
    site_id: int
    client_name: str
    site_name: str
    billing_period: str
    issue_date: date
    due_date: date
    billing_address: Optional[str] = None
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    status: str = "ISSUED"  # DRAFT, ISSUED, PAID, CANCELLED, OVERDUE
    tax_rate: float = 16.0
    discount_amount: float = 0.0
    currency: str = "KES"
    notes: Optional[str] = None
    payment_terms: Optional[str] = None


class SiteInvoiceCreate(SiteInvoiceBase):
    invoice_number: Optional[str] = None
    items: List[InvoiceItemCreate] = Field(default_factory=list)


class SiteInvoiceUpdate(BaseModel):
    invoice_number: Optional[str] = None
    client_name: Optional[str] = None
    site_name: Optional[str] = None
    billing_period: Optional[str] = None
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    billing_address: Optional[str] = None
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    status: Optional[str] = None
    tax_rate: Optional[float] = None
    discount_amount: Optional[float] = None
    currency: Optional[str] = None
    notes: Optional[str] = None
    payment_terms: Optional[str] = None
    items: Optional[List[InvoiceItemUpdate]] = None


class SiteInvoiceResponse(SiteInvoiceBase):
    id: int
    invoice_number: str
    subtotal: float
    tax_amount: float
    total_amount: float
    created_by_user_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    items: List[InvoiceItemResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class GenerateInvoiceRequest(BaseModel):
    site_id: int
    billing_period: str  # e.g. "November 2026"
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    tax_rate: float = 16.0
    include_supervision: bool = True
    custom_notes: Optional[str] = None
    custom_payment_terms: Optional[str] = None
    custom_items: Optional[List[InvoiceItemCreate]] = None

