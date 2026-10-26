import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from application.backend.app.core.database import Base


class Guard(Base):
    __tablename__ = "guards"

    id = Column(Integer, primary_key=True, index=True)
    employee_number = Column(String(255), unique=True, index=True, nullable=False)
    full_name = Column(String(255), nullable=False)
    national_id = Column(String(255), unique=True, index=True, nullable=False)
    phone = Column(String(255), nullable=False)
    email = Column(String(255), nullable=True)
    date_of_birth = Column(Date, nullable=True)
    gender = Column(String(255), default="Male", nullable=False)
    
    primary_site_id = Column(Integer, ForeignKey("sites.id"), nullable=True)
    shift_id = Column(Integer, ForeignKey("shifts.id"), nullable=True)
    
    hire_date = Column(Date, nullable=False)
    basic_salary = Column(Float, nullable=True)  # Nullable: null -> inherits site.basic_salary; set -> per-guard override
    is_reliever = Column(Boolean, default=False, nullable=False)
    
    payment_method = Column(String(255), default="Bank Transfer", nullable=False)
    bank_name = Column(String(255), nullable=True)
    bank_account = Column(String(255), nullable=True)
    mpesa_number = Column(String(255), nullable=True)
    
    nssf_number = Column(String(255), nullable=True)
    shif_number = Column(String(255), nullable=True)
    kra_pin = Column(String(255), nullable=True)
    
    status = Column(String(255), default="ACTIVE", nullable=False)
    deactivation_reason = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now, nullable=False)

    site = relationship("Site", back_populates="guards")
    shift = relationship("Shift", back_populates="guards")
    user_account = relationship("User", back_populates="guard", uselist=False)
    attendances = relationship("Attendance", back_populates="guard")
    payroll_records = relationship("PayrollRecord", back_populates="guard")

    @property
    def effective_basic_salary(self) -> float:
        if self.basic_salary is not None:
            return float(self.basic_salary)
        if self.site and getattr(self.site, "basic_salary", None) is not None:
            return float(self.site.basic_salary)
        site_name = self.site.site_name if self.site else "Unassigned"
        raise ValueError(
            f"Guard '{self.full_name}' ({self.employee_number}) has no basic salary set "
            f"and assigned site '{site_name}' has no basic salary configured."
        )
