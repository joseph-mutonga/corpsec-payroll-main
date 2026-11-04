import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field, ConfigDict


class ExpenseCreate(BaseModel):
    expense_date: Optional[datetime.date] = None
    title: str = Field(..., min_length=2)
    category: str = Field(..., description="PETTY_CASH, OFFICE_RENT, UTILITIES_INTERNET, FUEL_TRANSPORT, UNIFORMS_GEAR, MEALS_WELFARE, MAINTENANCE_REPAIRS, LEGAL_COMPLIANCE, SHOP_SUPPLIES, COMMUNICATION_RADIO, MISCELLANEOUS")
    expense_type: str = Field(default="FIRM_OPERATING", description="PETTY_CASH, FIRM_OPERATING, RECURRING, SHOP_EXPENSE")
    amount: float = Field(..., gt=0)
    payment_method: str = Field(default="CASH", description="PETTY_CASH_FLOAT, CASH, MPESA, BANK_TRANSFER")
    payee: str = Field(..., min_length=1)
    receipt_number: Optional[str] = None
    is_recurring: bool = False
    recurrence_interval: Optional[str] = None  # MONTHLY, WEEKLY, QUARTERLY, ANNUALLY
    next_due_date: Optional[datetime.date] = None
    status: str = "PAID"
    description: Optional[str] = None


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
    status: str
    description: Optional[str] = None
    recorded_by_user_id: Optional[int] = None
    recorded_by_name: Optional[str] = None
    created_at: datetime.datetime

    model_config = ConfigDict(from_attributes=True)


class PettyCashTopUpRequest(BaseModel):
    amount: float = Field(..., gt=0)
    voucher_ref: Optional[str] = None
    reason: str = Field(default="Petty cash float replenishment")
    source: str = Field(default="Corporate Operating Bank Account")
    transaction_date: Optional[datetime.date] = None


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


class ExpenseSummaryResponse(BaseModel):
    total_expenses_this_month: float = 0.0
    petty_cash_float_balance: float = 0.0
    petty_cash_disbursed_this_month: float = 0.0
    monthly_recurring_commitments: float = 0.0
    total_recorded_count: int = 0
    by_category: Dict[str, float] = {}
    by_type: Dict[str, float] = {}

