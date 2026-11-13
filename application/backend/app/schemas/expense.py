import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field, ConfigDict, field_validator


class ExpenseCreate(BaseModel):
    expense_date: Optional[datetime.date] = None
    title: Optional[str] = None
    category: str = Field(default="MISCELLANEOUS", description="PETTY_CASH, OFFICE_RENT, UTILITIES_INTERNET, FUEL_TRANSPORT, UNIFORMS_GEAR, MEALS_WELFARE, MAINTENANCE_REPAIRS, LEGAL_COMPLIANCE, SHOP_SUPPLIES, COMMUNICATION_RADIO, MISCELLANEOUS")
    expense_type: str = Field(default="FIRM_OPERATING", description="PETTY_CASH, FIRM_OPERATING, RECURRING, SHOP_EXPENSE")
    amount: float = Field(..., gt=0)
    payment_method: str = Field(default="CASH", description="PETTY_CASH_FLOAT, PETTY_CASH, CASH, MPESA, BANK_TRANSFER, CHEQUE")
    payee: str = Field(..., min_length=1)
    receipt_number: Optional[str] = None
    is_recurring: bool = False
    recurrence_interval: Optional[str] = None  # MONTHLY, WEEKLY, QUARTERLY, ANNUALLY
    next_due_date: Optional[datetime.date] = None
    last_paid_date: Optional[datetime.date] = None
    recurring_parent_id: Optional[int] = None
    status: str = "PAID"
    description: Optional[str] = None

    @field_validator("expense_date", "next_due_date", "last_paid_date", mode="before")
    @classmethod
    def parse_empty_dates(cls, v):
        if v is None or v == "" or (isinstance(v, str) and not v.strip()):
            return None
        return v

    @field_validator("receipt_number", "recurrence_interval", "description", mode="before")
    @classmethod
    def parse_empty_strings(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return v.strip() if isinstance(v, str) else v

    @field_validator("title", mode="before")
    @classmethod
    def ensure_title(cls, v):
        if v is not None and isinstance(v, str) and v.strip():
            val = v.strip()
            return val if len(val) >= 2 else (val + " Expense")
        return None


class ExpenseResponse(BaseModel):
    id: int
    expense_date: datetime.date
    title: str
    category: str
    expense_type: str
    amount: float
    payment_method: str
    payee: str
    receipt_number: Optional[str] = None
    is_recurring: bool = False
    recurrence_interval: Optional[str] = None
    next_due_date: Optional[datetime.date] = None
    last_paid_date: Optional[datetime.date] = None
    recurring_parent_id: Optional[int] = None
    status: str
    description: Optional[str] = None
    recorded_by_user_id: Optional[int] = None
    recorded_by_name: Optional[str] = None
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


class RecurringExpenseCreate(BaseModel):
    title: str = Field(..., min_length=2)
    category: str = Field(default="Rent & Facilities")
    amount: float = Field(..., gt=0)
    payee: str = Field(..., min_length=1)
    recurrence_interval: str = Field(default="MONTHLY")  # MONTHLY, WEEKLY, QUARTERLY, ANNUALLY
    next_due_date: Optional[datetime.date] = None
    last_paid_date: Optional[datetime.date] = None
    payment_method: str = Field(default="BANK_TRANSFER")
    status: str = Field(default="ACTIVE")
    description: Optional[str] = None

    @field_validator("next_due_date", "last_paid_date", mode="before")
    @classmethod
    def parse_empty_dates(cls, v):
        if v is None or v == "" or (isinstance(v, str) and not v.strip()):
            return None
        return v

    @field_validator("description", mode="before")
    @classmethod
    def parse_empty_strings(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return v.strip() if isinstance(v, str) else v


class RecurringExpenseUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[float] = Field(None, gt=0)
    payee: Optional[str] = None
    recurrence_interval: Optional[str] = None
    next_due_date: Optional[datetime.date] = None
    last_paid_date: Optional[datetime.date] = None
    payment_method: Optional[str] = None
    status: Optional[str] = None
    description: Optional[str] = None

    @field_validator("next_due_date", "last_paid_date", mode="before")
    @classmethod
    def parse_empty_dates(cls, v):
        if v is None or v == "" or (isinstance(v, str) and not v.strip()):
            return None
        return v

    @field_validator("description", "title", "payee", mode="before")
    @classmethod
    def parse_empty_strings(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return v.strip() if isinstance(v, str) else v


class RecordRecurringPaymentRequest(BaseModel):
    payment_date: Optional[datetime.date] = None
    amount: Optional[float] = Field(None, gt=0)
    payment_method: str = "BANK_TRANSFER"
    receipt_number: Optional[str] = None
    description: Optional[str] = None
    advance_next_due_date: bool = True

    @field_validator("payment_date", mode="before")
    @classmethod
    def parse_empty_dates(cls, v):
        if v is None or v == "" or (isinstance(v, str) and not v.strip()):
            return None
        return v

    @field_validator("receipt_number", "description", mode="before")
    @classmethod
    def parse_empty_strings(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return v.strip() if isinstance(v, str) else v


class RecurringPaymentHistoryItem(BaseModel):
    id: int
    expense_date: datetime.date
    amount: float
    payment_method: str
    payee: str
    receipt_number: Optional[str] = None
    description: Optional[str] = None
    recorded_by_name: Optional[str] = None
    created_at: datetime.datetime


class RecurringExpenseDetailResponse(BaseModel):
    id: int
    title: str
    category: str
    payee: str
    amount: float
    recurrence_interval: str
    monthly_normalized_amount: float
    next_due_date: Optional[datetime.date] = None
    last_paid_date: Optional[datetime.date] = None
    last_paid_amount: Optional[float] = None
    last_payment_method: Optional[str] = None
    payment_method: str = "BANK_TRANSFER"
    total_paid_to_date: float = 0.0
    payment_count: int = 0
    days_until_due: Optional[int] = None
    status: str
    description: Optional[str] = None
    created_at: datetime.datetime
    payments_history: List[RecurringPaymentHistoryItem] = []


class PettyCashTopUpRequest(BaseModel):
    amount: float = Field(..., gt=0)
    voucher_ref: Optional[str] = None
    reference_number: Optional[str] = None
    reason: Optional[str] = "Petty cash float replenishment"
    notes: Optional[str] = None
    source: str = Field(default="Corporate Operating Bank Account")
    transaction_date: Optional[datetime.date] = None

    @field_validator("transaction_date", mode="before")
    @classmethod
    def parse_empty_dates(cls, v):
        if v is None or v == "" or (isinstance(v, str) and not v.strip()):
            return None
        return v

    @field_validator("voucher_ref", "reference_number", "reason", "notes", mode="before")
    @classmethod
    def parse_empty_strings(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return v.strip() if isinstance(v, str) else v


class PettyCashTransactionResponse(BaseModel):
    id: int
    transaction_date: datetime.date
    transaction_type: str
    amount: float
    balance_after: float
    voucher_ref: Optional[str] = None
    reason: str
    source_or_recipient: str
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


class AvailableMonthItem(BaseModel):
    value: str  # e.g. "2026-11"
    label: str  # e.g. "November 2026"
    is_current: bool = False
    is_last: bool = False
    expense_count: int = 0
    total_amount: float = 0.0


class ExpenseSummaryResponse(BaseModel):
    total_expenses_this_month: float = 0.0
    total_expenses_last_month: float = 0.0
    selected_month: str = ""
    selected_month_label: str = ""
    selected_month_total: float = 0.0
    petty_cash_float_balance: float = 0.0
    petty_cash_disbursed_this_month: float = 0.0
    monthly_recurring_commitments: float = 0.0
    total_recorded_count: int = 0
    by_category: Dict[str, float] = {}
    by_type: Dict[str, float] = {}
    available_months: List[AvailableMonthItem] = []

