import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Date, Text
from application.backend.app.core.database import Base


class ArchivePayroll(Base):
    __tablename__ = "archive_payroll"

    id = Column(Integer, primary_key=True, index=True)
    payroll_period_id = Column(Integer, nullable=False, unique=True, index=True)
    year = Column(Integer, nullable=False, index=True)
    month = Column(Integer, nullable=False, index=True)
    period_name = Column(String(255), nullable=False)
    
    total_guards = Column(Integer, nullable=False)
    total_gross_pay = Column(Float, nullable=False)
    total_deductions = Column(Float, nullable=False)
    total_net_pay = Column(Float, nullable=False)
    
    closed_at = Column(DateTime, nullable=False)
    closed_by = Column(String(255), nullable=False)
    notes = Column(Text, nullable=True)


class ArchivePayrollItem(Base):
    __tablename__ = "archive_payroll_items"

    id = Column(Integer, primary_key=True, index=True)
    archive_payroll_id = Column(Integer, nullable=False, index=True)
    guard_id = Column(Integer, nullable=False, index=True)
    employee_number = Column(String(255), nullable=False)
    guard_name = Column(String(255), nullable=False)
    site_name = Column(String(255), nullable=False)
    
    days_worked = Column(Integer, nullable=False)
    regular_hours = Column(Float, nullable=False)
    overtime_hours = Column(Float, nullable=False)
    
    basic_pay = Column(Float, nullable=False)
    overtime_pay = Column(Float, nullable=False)
    allowances = Column(Float, nullable=False)
    gross_pay = Column(Float, nullable=False)
    
    nssf_deduction = Column(Float, nullable=False)
    shif_deduction = Column(Float, nullable=False)
    housing_levy_deduction = Column(Float, nullable=False)
    paye_deduction = Column(Float, nullable=False)
    other_deductions = Column(Float, nullable=False)
    
    total_deductions = Column(Float, nullable=False)
    net_pay = Column(Float, nullable=False)
    payment_method = Column(String(255), nullable=False)
    bank_account_or_mpesa = Column(String(255), nullable=True)
