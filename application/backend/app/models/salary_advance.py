import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Date, ForeignKey, Text
from sqlalchemy.orm import relationship
from application.backend.app.core.database import Base


class SalaryAdvance(Base):
    __tablename__ = "salary_advances"

    id = Column(Integer, primary_key=True, index=True)
    advance_reference = Column(String(50), unique=True, index=True, nullable=False)
    advance_type = Column(String(20), default="GUARD", nullable=False)  # "GUARD" or "STAFF"
    
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=True, index=True)
    staff_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    payroll_period_id = Column(Integer, ForeignKey("payroll_periods.id"), nullable=True, index=True)
    
    amount = Column(Float, nullable=False)
    disbursement_date = Column(Date, nullable=False, default=datetime.date.today)
    payment_method = Column(String(50), default="M-PESA", nullable=False)  # M-PESA, BANK, CASH
    reference_number = Column(String(100), nullable=True)  # M-Pesa code, Cheque / Voucher #
    reason = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    
    status = Column(String(50), default="APPROVED", nullable=False)  # PENDING, APPROVED, DEDUCTED, REJECTED
    approved_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    deducted_at = Column(DateTime, nullable=True)

    guard = relationship("Guard", foreign_keys=[guard_id], backref="salary_advances")
    staff = relationship("User", foreign_keys=[staff_id], backref="staff_salary_advances")
    approved_by = relationship("User", foreign_keys=[approved_by_user_id])
    payroll_period = relationship("PayrollPeriod", foreign_keys=[payroll_period_id])

