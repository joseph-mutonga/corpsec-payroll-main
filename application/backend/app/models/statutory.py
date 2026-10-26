import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Date, Boolean, Text
from application.backend.app.core.database import Base


class StatutoryNssfTier(Base):
    __tablename__ = "statutory_nssf_tiers"

    id = Column(Integer, primary_key=True, index=True)
    tier_number = Column(Integer, nullable=False, default=1)
    tier_name = Column(String(255), nullable=False)  # e.g., "Tier I", "Tier II"
    rate = Column(Float, nullable=False, default=6.0)  # Percentage, e.g. 6.0
    lower_limit = Column(Float, nullable=False, default=0.0)  # KES
    upper_limit = Column(Float, nullable=True)  # KES (None = uncapped)
    
    effective_from = Column(Date, nullable=False, index=True)
    effective_to = Column(Date, nullable=True, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    
    change_reason = Column(Text, nullable=True)
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)


class StatutoryShif(Base):
    __tablename__ = "statutory_shif"

    id = Column(Integer, primary_key=True, index=True)
    employee_rate = Column(Float, nullable=False, default=2.75)  # Percentage, e.g. 2.75
    minimum_floor = Column(Float, nullable=False, default=300.0)  # KES 300.0
    
    effective_from = Column(Date, nullable=False, index=True)
    effective_to = Column(Date, nullable=True, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    
    change_reason = Column(Text, nullable=True)
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)


class StatutoryHousingLevy(Base):
    __tablename__ = "statutory_housing_levy"

    id = Column(Integer, primary_key=True, index=True)
    employee_rate = Column(Float, nullable=False, default=1.5)  # Percentage, e.g. 1.5
    employer_rate = Column(Float, nullable=False, default=1.5)  # Percentage, e.g. 1.5
    
    effective_from = Column(Date, nullable=False, index=True)
    effective_to = Column(Date, nullable=True, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    
    change_reason = Column(Text, nullable=True)
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)


class StatutoryPayeBand(Base):
    __tablename__ = "statutory_paye_bands"

    id = Column(Integer, primary_key=True, index=True)
    band_order = Column(Integer, nullable=False, default=1)
    lower_limit = Column(Float, nullable=False, default=0.0)
    upper_limit = Column(Float, nullable=True)  # None = "and above" / uncapped
    rate = Column(Float, nullable=False)  # Percentage, e.g. 10.0, 25.0, 30.0, 32.5, 35.0
    
    effective_from = Column(Date, nullable=False, index=True)
    effective_to = Column(Date, nullable=True, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    
    change_reason = Column(Text, nullable=True)
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)


class StatutoryPayeRelief(Base):
    __tablename__ = "statutory_paye_relief"

    id = Column(Integer, primary_key=True, index=True)
    monthly_relief = Column(Float, nullable=False, default=2400.0)
    
    effective_from = Column(Date, nullable=False, index=True)
    effective_to = Column(Date, nullable=True, index=True)
    is_active = Column(Boolean, default=True, nullable=False)
    
    change_reason = Column(Text, nullable=True)
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
