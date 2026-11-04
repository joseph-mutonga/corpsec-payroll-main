import datetime
from sqlalchemy import Column, Integer, String, Float, Text, Date, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from application.backend.app.core.database import Base


class CompanyProfile(Base):
    __tablename__ = "company_profile"

    id = Column(Integer, primary_key=True, index=True)
    official_name = Column(String(255), default="CorpSec Security Services Ltd", nullable=False)
    trading_name = Column(String(255), default="CorpSec Premier Security", nullable=False)
    registration_number = Column(String(100), default="CPR/2018/385560", nullable=False)
    kra_pin = Column(String(50), default="P051234567X", nullable=False)
    
    incorporation_date = Column(Date, default=datetime.date(2018, 3, 15), nullable=False)
    operations_commenced_date = Column(Date, default=datetime.date(2018, 6, 1), nullable=False)
    slogan = Column(String(255), default="Vigilance, Integrity, Protection & Professional Excellence", nullable=False)
    
    physical_address = Column(String(255), default="Upper Hill Financial District, Cathedral Rd, CorpSec Plaza, 4th Floor", nullable=False)
    postal_address = Column(String(150), default="P.O. Box 45123 - 00100, Nairobi, Kenya", nullable=False)
    county = Column(String(100), default="Nairobi", nullable=False)
    
    phone = Column(String(100), default="+254 700 000 000 / +254 722 000 000", nullable=False)
    email = Column(String(150), default="info@corpsec.co.ke", nullable=False)
    website = Column(String(150), default="https://www.corpsec.co.ke", nullable=False)
    
    business_description = Column(Text, default="CorpSec is a premier licensed commercial security services provider in Kenya offering static manned guarding, rapid alarm response, CCTV installation, canine security, and VIP close protection.", nullable=False)
    mission_statement = Column(Text, default="To deliver robust, technology-driven security services that safeguard our clients' assets, personnel, and peace of mind.", nullable=False)
    vision_statement = Column(Text, default="To be the most trusted and operationally reliable private security organization in East Africa.", nullable=False)
    core_values = Column(Text, default="Integrity, Discipline, Vigilance, Accountability, and Operational Excellence.", nullable=False)
    
    psra_license_number = Column(String(100), default="PSRA/CORP/2026/0894", nullable=False)
    branches_summary = Column(Text, default="Nairobi (Head Office), Mombasa Coastal Branch, Kisumu Western Branch, Nakuru Rift Valley Branch", nullable=False)
    
    updated_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now, nullable=False)

    updated_by = relationship("User", foreign_keys=[updated_by_user_id])


class CompanyFoundingHistory(Base):
    __tablename__ = "company_founding_history"

    id = Column(Integer, primary_key=True, index=True)
    founding_date = Column(Date, default=datetime.date(2018, 3, 15), nullable=False)
    original_location = Column(String(200), default="Industrial Area, Enterprise Road, Nairobi", nullable=False)
    initial_capital = Column(Float, default=2500000.0, nullable=False)
    initial_employee_count = Column(Integer, default=12, nullable=False)
    
    initial_client_summary = Column(Text, default="Secured initial static guarding contracts for Enterprise Warehouses Ltd and Industrial Logistics Park.", nullable=False)
    narrative_history = Column(Text, default="Founded in early 2018 by veteran security and risk management professionals to address corporate security vulnerabilities with disciplined personnel and structured payroll management.", nullable=False)
    
    founders_json = Column(Text, default='[{"name": "Col. (Rtd) David K. Cheruiyot", "role": "Lead Founder & Security Director"}, {"name": "Grace W. Nduta", "role": "Co-Founder & Head of Operations"}]', nullable=False)
    original_directors_json = Column(Text, default='[{"name": "Col. (Rtd) David K. Cheruiyot", "designation": "Managing Director"}, {"name": "Grace W. Nduta", "designation": "Executive Director"}, {"name": "Dr. Joseph M. Ochieng", "designation": "Non-Executive Director"}]', nullable=False)
    initial_shareholders_json = Column(Text, default='[{"name": "Cheruiyot Holdings Ltd", "percentage": 55.0}, {"name": "Nduta Enterprises", "percentage": 35.0}, {"name": "Ochieng Capital Trust", "percentage": 10.0}]', nullable=False)
    
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now, nullable=False)


class CompanyMilestone(Base):
    __tablename__ = "company_milestones"

    id = Column(Integer, primary_key=True, index=True)
    event_title = Column(String(255), nullable=False)
    category = Column(String(50), default="FOUNDING", nullable=False)  # FOUNDING, CONTRACT_WIN, EXPANSION, ACQUISITION, AWARD, MANAGEMENT_CHANGE, OTHER
    event_date = Column(Date, nullable=False)
    description = Column(Text, nullable=False)
    location = Column(String(150), nullable=True)
    significance = Column(String(255), nullable=True)
    
    recorded_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)

    recorded_by = relationship("User", foreign_keys=[recorded_by_user_id])


class CompanyOwnershipRecord(Base):
    __tablename__ = "company_ownership_records"

    id = Column(Integer, primary_key=True, index=True)
    person_or_entity_name = Column(String(255), nullable=False)
    role = Column(String(100), default="DIRECTOR", nullable=False)  # FOUNDER, DIRECTOR, SHAREHOLDER, CHAIRMAN, CEO, MANAGING_DIRECTOR
    shareholding_percentage = Column(Float, default=0.0, nullable=False)
    shares_count = Column(Integer, default=0, nullable=False)
    
    appointment_date = Column(Date, nullable=False)
    resignation_date = Column(Date, nullable=True)
    status = Column(String(50), default="CURRENT", nullable=False)  # CURRENT, PAST
    
    resolution_reference = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)


class CompanyRecommendation(Base):
    __tablename__ = "company_recommendations"

    id = Column(Integer, primary_key=True, index=True)
    client_name = Column(String(255), nullable=False)
    author_name = Column(String(255), nullable=False)
    designation = Column(String(255), nullable=False)
    rating = Column(Integer, default=5, nullable=False)
    recommendation_date = Column(Date, default=datetime.date.today, nullable=False)
    recommendation_text = Column(Text, nullable=False)
    service_scope = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)


class CompanyService(Base):
    __tablename__ = "company_services"

    id = Column(Integer, primary_key=True, index=True)
    service_code = Column(String(50), unique=True, index=True, nullable=False)
    service_name = Column(String(255), nullable=False)
    category = Column(String(100), default="PHYSICAL_SECURITY", nullable=False)  # PHYSICAL_SECURITY, TECHNICAL_SECURITY, SPECIALIZED_SERVICES, CONSULTING
    description = Column(Text, nullable=False)
    sla_standard = Column(String(255), nullable=True)
    billing_rate_guideline = Column(String(255), nullable=True)
    active_sites_count = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)


