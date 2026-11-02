import datetime
from sqlalchemy import Column, Integer, String, Float, Text, Date, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from application.backend.app.core.database import Base


class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    client_code = Column(String(50), unique=True, index=True, nullable=False)  # e.g. CLT-0001
    name = Column(String(255), unique=True, index=True, nullable=False)
    business_registration_no = Column(String(100), nullable=True)
    kra_pin = Column(String(50), nullable=True)
    
    client_type = Column(String(50), default="CORPORATE", nullable=False)  # CORPORATE, RESIDENTIAL, COMMERCIAL, FACTORY, SCHOOL, HOSPITAL, GOVERNMENT, PRIVATE, OTHER
    industry = Column(String(100), nullable=True)
    
    physical_address = Column(String(255), nullable=False)
    postal_address = Column(String(150), nullable=True)
    county = Column(String(100), default="Nairobi", nullable=False)
    
    contact_person = Column(String(150), nullable=False)
    designation = Column(String(100), nullable=True)
    phone = Column(String(100), nullable=False)
    email = Column(String(150), nullable=True)
    alternative_phone = Column(String(100), nullable=True)
    
    date_registered = Column(Date, default=datetime.date.today, nullable=False)
    status = Column(String(50), default="ACTIVE", nullable=False)  # ACTIVE, PROSPECT, INACTIVE, SUSPENDED
    notes = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now, nullable=False)

    contracts = relationship("ClientContract", back_populates="client", cascade="all, delete-orphan", order_by="ClientContract.id.desc()")


class ClientContract(Base):
    __tablename__ = "client_contracts"

    id = Column(Integer, primary_key=True, index=True)
    contract_ref = Column(String(100), unique=True, index=True, nullable=False)  # e.g. CTR-2026-0001
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    contract_type = Column(String(100), default="SECURITY_GUARDING", nullable=False)
    
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    contract_value = Column(Float, default=0.0, nullable=False)
    monthly_charge = Column(Float, default=0.0, nullable=False)
    billing_frequency = Column(String(50), default="MONTHLY", nullable=False)  # MONTHLY, QUARTERLY, ANNUALLY
    payment_terms = Column(String(100), default="14 Days Net", nullable=False)
    
    guards_required = Column(Integer, default=1, nullable=False)
    supervisors_required = Column(Integer, default=1, nullable=False)
    status = Column(String(50), default="ACTIVE", nullable=False)  # DRAFT, PENDING_APPROVAL, ACTIVE, EXPIRING_SOON, EXPIRED, RENEWED, SUSPENDED, TERMINATED
    
    version = Column(Integer, default=1, nullable=False)
    previous_contract_id = Column(Integer, ForeignKey("client_contracts.id"), nullable=True)
    contract_manager_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    special_terms = Column(Text, nullable=True)
    document_url = Column(String(255), nullable=True)
    
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now, nullable=False)

    client = relationship("Client", back_populates="contracts")
    deployments = relationship("ContractDeployment", back_populates="contract", cascade="all, delete-orphan")
    previous_contract = relationship("ClientContract", remote_side=[id])
    contract_manager = relationship("User", foreign_keys=[contract_manager_user_id])


class ContractDeployment(Base):
    __tablename__ = "contract_deployments"

    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("client_contracts.id", ondelete="CASCADE"), nullable=False)
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=False)
    primary_supervisor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    guards_target = Column(Integer, default=1, nullable=False)
    commencement_date = Column(Date, default=datetime.date.today, nullable=False)
    status = Column(String(50), default="ACTIVE", nullable=False)  # ACTIVE, CONCLUDED
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)

    contract = relationship("ClientContract", back_populates="deployments")
    site = relationship("Site")
    supervisor = relationship("User", foreign_keys=[primary_supervisor_id])

