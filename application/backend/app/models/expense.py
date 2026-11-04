import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from application.backend.app.core.database import Base


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    expense_date = Column(Date, default=datetime.date.today, nullable=False)
    title = Column(String(255), nullable=False)
    category = Column(String(100), nullable=False)  # PETTY_CASH, OFFICE_RENT, UTILITIES_INTERNET, FUEL_TRANSPORT, UNIFORMS_GEAR, MEALS_WELFARE, MAINTENANCE_REPAIRS, LEGAL_COMPLIANCE, SHOP_SUPPLIES, COMMUNICATION_RADIO, MISCELLANEOUS
    expense_type = Column(String(50), nullable=False, default="FIRM_OPERATING")  # PETTY_CASH, FIRM_OPERATING, RECURRING, SHOP_EXPENSE
    amount = Column(Float, nullable=False)
    payment_method = Column(String(50), nullable=False, default="CASH")  # PETTY_CASH_FLOAT, CASH, MPESA, BANK_TRANSFER
    payee = Column(String(255), nullable=False)
    receipt_number = Column(String(100), nullable=True)
    
    is_recurring = Column(Boolean, default=False, nullable=False)
    recurrence_interval = Column(String(50), nullable=True)  # MONTHLY, WEEKLY, QUARTERLY, ANNUALLY
    next_due_date = Column(Date, nullable=True)
    
    status = Column(String(50), default="PAID", nullable=False)  # PAID, PENDING, APPROVED
    description = Column(Text, nullable=True)
    
    recorded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now, nullable=False)

    recorded_by = relationship("User", foreign_keys=[recorded_by_user_id])


class PettyCashTransaction(Base):
    __tablename__ = "petty_cash_transactions"

    id = Column(Integer, primary_key=True, index=True)
    transaction_date = Column(Date, default=datetime.date.today, nullable=False)
    transaction_type = Column(String(50), nullable=False)  # TOP_UP, DISBURSEMENT
    amount = Column(Float, nullable=False)
    balance_after = Column(Float, nullable=False, default=0.0)
    voucher_ref = Column(String(100), nullable=True)
    reason = Column(String(255), nullable=False)
    source_or_recipient = Column(String(255), nullable=False)
    
    expense_id = Column(Integer, ForeignKey("expenses.id"), nullable=True)
    recorded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)

    recorded_by = relationship("User", foreign_keys=[recorded_by_user_id])
    expense = relationship("Expense", foreign_keys=[expense_id])

