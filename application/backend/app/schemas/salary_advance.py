from typing import Optional, List
from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, Field


class SalaryAdvanceCreate(BaseModel):
    advance_type: str = Field(default="GUARD", description="GUARD or STAFF")
    guard_id: Optional[int] = None
    staff_id: Optional[int] = None
    payroll_period_id: Optional[int] = None
    amount: float = Field(..., gt=0, description="Amount in KES")
    disbursement_date: Optional[date] = None
    payment_method: str = Field(default="M-PESA", description="M-PESA, BANK, or CASH")
    reference_number: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None


class SalaryAdvanceResponse(BaseModel):
    id: int
    advance_reference: str
    advance_type: str
    guard_id: Optional[int] = None
    staff_id: Optional[int] = None
    payroll_period_id: Optional[int] = None
    recipient_name: str = ""
    recipient_number: Optional[str] = ""
    amount: float
    disbursement_date: date
    payment_method: str
    reference_number: Optional[str] = None
    reason: Optional[str] = None
    notes: Optional[str] = None
    status: str
    approved_by_name: Optional[str] = None
    created_at: datetime
    deducted_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class SalaryAdvanceSummary(BaseModel):
    total_advances_count: int
    total_amount_disbursed: float
    total_amount_deducted: float
    total_amount_pending: float


class BulkUploadAdvanceResult(BaseModel):
    success: bool
    total_rows: int
    successful_records: int
    failed_records: int
    total_amount_processed: float
    errors: List[str] = []
    created_references: List[str] = []

