import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Date, Text, Boolean
from sqlalchemy.orm import relationship
from application.backend.app.core.database import Base


class PayrollPeriod(Base):
    __tablename__ = "payroll_periods"

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, nullable=False, index=True)
    month = Column(Integer, nullable=False, index=True)
    period_name = Column(String(255), nullable=False)  # e.g., "August 2026"
    
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    
    status = Column(String(255), default="DRAFT", nullable=False)  # DRAFT, CALCULATED, CONFIRMED, CLOSED
    
    calculated_at = Column(DateTime, nullable=True)
    confirmed_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    closed_by = Column(String(255), nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)

    records = relationship("PayrollRecord", back_populates="period")
    errors = relationship("PayrollError", back_populates="period")


class PayrollRecord(Base):
    __tablename__ = "payroll_records"

    id = Column(Integer, primary_key=True, index=True)
    payroll_period_id = Column(Integer, ForeignKey("payroll_periods.id"), nullable=False, index=True)
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False, index=True)
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=True)
    
    days_worked = Column(Integer, default=0, nullable=False)
    regular_hours = Column(Float, default=0.0, nullable=False)
    overtime_hours = Column(Float, default=0.0, nullable=False)
    
    basic_pay = Column(Float, default=0.0, nullable=False)
    overtime_pay = Column(Float, default=0.0, nullable=False)
    allowances = Column(Float, default=0.0, nullable=False)
    gross_pay = Column(Float, default=0.0, nullable=False)
    
    nssf_deduction = Column(Float, default=0.0, nullable=False)
    shif_deduction = Column(Float, default=0.0, nullable=False)
    housing_levy_deduction = Column(Float, default=0.0, nullable=False)
    paye_deduction = Column(Float, default=0.0, nullable=False)
    other_deductions = Column(Float, default=0.0, nullable=False)
    unpaid_leave_deduction = Column(Float, default=0.0, nullable=False)
    off_day_deduction = Column(Float, default=0.0, nullable=False)
    salary_advance_deduction = Column(Float, default=0.0, nullable=False)
    damage_deduction = Column(Float, default=0.0, nullable=False)
    reliever_earnings = Column(Float, default=0.0, nullable=False)
    
    total_deductions = Column(Float, default=0.0, nullable=False)
    net_pay = Column(Float, default=0.0, nullable=False)
    
    # Salary Payment Hold & Investigation Tracking
    is_on_hold = Column(Boolean, default=False, nullable=False)
    hold_reason = Column(Text, nullable=True)
    held_by = Column(String(255), nullable=True)
    held_at = Column(DateTime, nullable=True)
    released_by = Column(String(255), nullable=True)
    released_at = Column(DateTime, nullable=True)
    release_notes = Column(Text, nullable=True)
    
    # Employer-side statutory contributions (does not affect employee net pay)
    employer_nssf_deduction = Column(Float, default=0.0, nullable=False)
    employer_housing_levy_deduction = Column(Float, default=0.0, nullable=False)
    paye_breakdown_json = Column(Text, nullable=True)
    
    status = Column(String(255), default="CALCULATED", nullable=False)
    
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)

    period = relationship("PayrollPeriod", back_populates="records")
    guard = relationship("Guard", back_populates="payroll_records")
    site = relationship("Site")


class PayrollError(Base):
    __tablename__ = "payroll_errors"

    id = Column(Integer, primary_key=True, index=True)
    payroll_period_id = Column(Integer, ForeignKey("payroll_periods.id"), nullable=False, index=True)
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=True)
    
    error_type = Column(String(255), nullable=False, default="MISSING_DATA")
    error_code = Column(String(255), nullable=False)  # MISSING_NSSF, ZERO_RATE, UNAPPROVED_OVERTIME
    error_message = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    severity = Column(String(255), default="WARNING", nullable=False)  # CRITICAL, WARNING
    
    status = Column(String(255), default="UNRESOLVED", nullable=False)  # UNRESOLVED, FIXED, IGNORED
    resolved_by = Column(String(255), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    resolution_notes = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)

    period = relationship("PayrollPeriod", back_populates="errors")
    guard = relationship("Guard")


class Payslip(Base):
    __tablename__ = "payslips"

    id = Column(Integer, primary_key=True, index=True)
    payroll_record_id = Column(Integer, ForeignKey("payroll_records.id"), nullable=False, index=True)
    payroll_period_id = Column(Integer, ForeignKey("payroll_periods.id"), nullable=True, index=True)
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=True, index=True)
    payslip_number = Column(String(255), unique=True, index=True, nullable=False)  # PAY-202608-CS00452
    
    pdf_path = Column(String(255), nullable=True)
    generated_at = Column(DateTime, default=datetime.datetime.now, nullable=False)

    record = relationship("PayrollRecord")
    guard = relationship("Guard")




class BankPaymentSchedule(Base):
    __tablename__ = "bank_payment_schedules"

    id = Column(Integer, primary_key=True, index=True)
    payroll_period_id = Column(Integer, ForeignKey("payroll_periods.id"), nullable=False, index=True)
    bank_name = Column(String(255), nullable=False)
    total_amount = Column(Float, nullable=False)
    total_count = Column(Integer, nullable=False)
    
    generated_at = Column(DateTime, default=datetime.datetime.now, nullable=False)


class BankPaymentItem(Base):
    __tablename__ = "bank_payment_items"

    id = Column(Integer, primary_key=True, index=True)
    schedule_id = Column(Integer, ForeignKey("bank_payment_schedules.id"), nullable=False, index=True)
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False)
    
    account_name = Column(String(255), nullable=False)
    account_number = Column(String(255), nullable=False)
    bank_code = Column(String(255), nullable=True)
    amount = Column(Float, nullable=False)


class MpesaPaymentSchedule(Base):
    __tablename__ = "mpesa_payment_schedules"

    id = Column(Integer, primary_key=True, index=True)
    payroll_period_id = Column(Integer, ForeignKey("payroll_periods.id"), nullable=False, index=True)
    batch_reference = Column(String(255), unique=True, index=True, nullable=False)
    total_amount = Column(Float, nullable=False)
    total_count = Column(Integer, nullable=False)
    
    generated_at = Column(DateTime, default=datetime.datetime.now, nullable=False)


class MpesaPaymentItem(Base):
    __tablename__ = "mpesa_payment_items"

    id = Column(Integer, primary_key=True, index=True)
    schedule_id = Column(Integer, ForeignKey("mpesa_payment_schedules.id"), nullable=False, index=True)
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False)
    
    phone_number = Column(String(255), nullable=False)
    guard_name = Column(String(255), nullable=False)
    amount = Column(Float, nullable=False)


class UnpaidLeaveDeduction(Base):
    __tablename__ = "unpaid_leave_deductions"

    id = Column(Integer, primary_key=True, index=True)
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False, index=True)
    leave_request_id = Column(Integer, ForeignKey("leave_requests.id"), nullable=False, index=True)
    payroll_period_id = Column(Integer, ForeignKey("payroll_periods.id"), nullable=True, index=True)
    
    days_deducted = Column(Integer, nullable=False)
    daily_rate = Column(Float, nullable=False)
    amount = Column(Float, nullable=False)
    
    status = Column(String(255), default="PENDING_REVIEW", nullable=False)  # PENDING_REVIEW, APPLIED, DISMISSED
    dismissal_reason = Column(Text, nullable=True)
    
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    applied_by = Column(String(255), nullable=True)
    applied_at = Column(DateTime, nullable=True)

    guard = relationship("Guard", backref="unpaid_leave_deductions")
    leave_request = relationship("LeaveRequest", backref="unpaid_leave_deductions")
    payroll_period = relationship("PayrollPeriod", backref="unpaid_leave_deductions")

