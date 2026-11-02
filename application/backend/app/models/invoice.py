import datetime
from sqlalchemy import Column, Integer, String, Float, Text, Date, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from application.backend.app.core.database import Base


class SiteInvoice(Base):
    __tablename__ = "site_invoices"

    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String(100), unique=True, index=True, nullable=False)
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=False)
    client_name = Column(String(255), nullable=False)
    site_name = Column(String(255), nullable=False)
    billing_period = Column(String(100), nullable=False)  # e.g. "November 2026"
    issue_date = Column(Date, nullable=False, default=datetime.date.today)
    due_date = Column(Date, nullable=False)
    
    billing_address = Column(String(255), nullable=True)
    client_email = Column(String(255), nullable=True)
    client_phone = Column(String(255), nullable=True)
    
    status = Column(String(50), default="ISSUED", nullable=False)  # DRAFT, ISSUED, PAID, CANCELLED, OVERDUE
    
    subtotal = Column(Float, default=0.0, nullable=False)
    tax_rate = Column(Float, default=16.0, nullable=False)  # e.g. 16.0 for 16% VAT
    tax_amount = Column(Float, default=0.0, nullable=False)
    discount_amount = Column(Float, default=0.0, nullable=False)
    total_amount = Column(Float, default=0.0, nullable=False)
    currency = Column(String(20), default="KES", nullable=False)
    
    notes = Column(Text, nullable=True)
    payment_terms = Column(Text, nullable=True)
    
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now, nullable=False)

    site = relationship("Site")
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    items = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan", order_by="InvoiceItem.id")


class InvoiceItem(Base):
    __tablename__ = "invoice_items"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("site_invoices.id", ondelete="CASCADE"), nullable=False)
    item_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    quantity = Column(Float, default=1.0, nullable=False)
    unit_price = Column(Float, default=0.0, nullable=False)
    tax_rate = Column(Float, default=16.0, nullable=False)
    amount = Column(Float, default=0.0, nullable=False)

    invoice = relationship("SiteInvoice", back_populates="items")

