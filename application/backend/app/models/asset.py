import datetime
from sqlalchemy import Column, Integer, String, Float, Text, Date, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from application.backend.app.core.database import Base


class AssetCategory(Base):
    __tablename__ = "asset_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True, nullable=False)
    code = Column(String(50), unique=True, index=True, nullable=False)
    description = Column(String(255), nullable=True)
    is_system = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)

    assets = relationship("Asset", back_populates="category")


class Asset(Base):
    __tablename__ = "assets"

    id = Column(Integer, primary_key=True, index=True)
    asset_tag = Column(String(100), unique=True, index=True, nullable=False)  # e.g. AST-VEH-0001
    name = Column(String(255), nullable=False)
    category_id = Column(Integer, ForeignKey("asset_categories.id"), nullable=False)
    description = Column(Text, nullable=True)
    serial_number = Column(String(100), nullable=True, index=True)
    make_model = Column(String(150), nullable=True)
    purchase_date = Column(Date, nullable=False)
    purchase_cost = Column(Float, default=0.0, nullable=False)
    supplier_name = Column(String(200), nullable=True)
    current_value = Column(Float, default=0.0, nullable=False)
    salvage_value = Column(Float, default=0.0, nullable=False)
    
    # Depreciation: STRAIGHT_LINE, REDUCING_BALANCE, NONE
    depreciation_method = Column(String(50), default="STRAIGHT_LINE", nullable=False)
    depreciation_rate_annual = Column(Float, default=10.0, nullable=False)  # Percentage, e.g. 10.0%
    
    condition = Column(String(50), default="GOOD", nullable=False)  # NEW, EXCELLENT, GOOD, FAIR, POOR, DAMAGED
    status = Column(String(50), default="AVAILABLE", nullable=False)  # AVAILABLE, ALLOCATED, UNDER_MAINTENANCE, DISPOSED, LOST
    location_branch = Column(String(150), default="Head Office", nullable=False)
    warranty_expiry = Column(Date, nullable=True)
    
    # Current active allocation foreign keys (convenience snapshots)
    assigned_to_employee_id = Column(Integer, ForeignKey("guards.id"), nullable=True)
    assigned_to_staff_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_to_site_id = Column(Integer, ForeignKey("sites.id"), nullable=True)
    
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now, nullable=False)

    category = relationship("AssetCategory", back_populates="assets")
    assigned_employee = relationship("Guard", foreign_keys=[assigned_to_employee_id])
    assigned_staff = relationship("User", foreign_keys=[assigned_to_staff_id])
    assigned_site = relationship("Site", foreign_keys=[assigned_to_site_id])
    allocations = relationship("AssetAllocation", back_populates="asset", cascade="all, delete-orphan", order_by="AssetAllocation.id.desc()")
    maintenance_records = relationship("AssetMaintenance", back_populates="asset", cascade="all, delete-orphan", order_by="AssetMaintenance.id.desc()")


class AssetAllocation(Base):
    __tablename__ = "asset_allocations"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    allocation_type = Column(String(50), default="EMPLOYEE", nullable=False)  # EMPLOYEE, SITE, BRANCH
    
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=True)
    staff_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=True)
    branch_name = Column(String(150), nullable=True)
    
    allocated_date = Column(Date, nullable=False, default=datetime.date.today)
    expected_return_date = Column(Date, nullable=True)
    return_date = Column(Date, nullable=True)
    
    status = Column(String(50), default="ACTIVE", nullable=False)  # ACTIVE, RETURNED, TRANSFERRED, LOST, DAMAGED
    condition_on_allocation = Column(String(50), default="GOOD", nullable=False)
    condition_on_return = Column(String(50), nullable=True)
    
    notes = Column(Text, nullable=True)
    allocated_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)

    asset = relationship("Asset", back_populates="allocations")
    guard = relationship("Guard", foreign_keys=[guard_id])
    staff = relationship("User", foreign_keys=[staff_id])
    site = relationship("Site", foreign_keys=[site_id])
    allocated_by = relationship("User", foreign_keys=[allocated_by_user_id])


class AssetMaintenance(Base):
    __tablename__ = "asset_maintenance_records"

    id = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id", ondelete="CASCADE"), nullable=False)
    maintenance_type = Column(String(50), default="PREVENTIVE", nullable=False)  # PREVENTIVE, REPAIR, INSPECTION, OVERHAUL
    description = Column(Text, nullable=False)
    service_provider = Column(String(200), nullable=False)
    cost = Column(Float, default=0.0, nullable=False)
    
    maintenance_date = Column(Date, nullable=False, default=datetime.date.today)
    next_due_date = Column(Date, nullable=True)
    
    status = Column(String(50), default="COMPLETED", nullable=False)  # SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED
    invoice_receipt_no = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    logged_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)

    asset = relationship("Asset", back_populates="maintenance_records")
    logged_by = relationship("User", foreign_keys=[logged_by_user_id])


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    item_code = Column(String(100), unique=True, index=True, nullable=False)  # e.g. INV-UNI-001
    item_name = Column(String(200), nullable=False)
    category = Column(String(100), nullable=False)  # UNIFORMS, BOOTS, REFLECTORS, FLASH_LIGHTS, RADIOS, STATIONERY, CLEANING, ACCESSORIES, OTHER
    description = Column(Text, nullable=True)
    unit_of_measure = Column(String(50), default="PIECES", nullable=False)  # PIECES, PAIRS, BOXES, PACKETS, METERS
    unit_cost = Column(Float, default=0.0, nullable=False)
    
    minimum_stock_level = Column(Integer, default=5, nullable=False)
    current_stock = Column(Integer, default=0, nullable=False)
    reorder_quantity = Column(Integer, default=10, nullable=False)
    storage_location = Column(String(150), default="Main Warehouse, Nairobi", nullable=False)
    
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now, nullable=False)

    transactions = relationship("InventoryTransaction", back_populates="item", cascade="all, delete-orphan", order_by="InventoryTransaction.id.desc()")


class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False)
    transaction_type = Column(String(50), nullable=False)  # RECEIVED (Stock-In), ISSUED (Stock-Out), RETURNED, ADJUSTMENT
    quantity = Column(Integer, nullable=False)
    unit_cost = Column(Float, default=0.0, nullable=False)
    total_cost = Column(Float, default=0.0, nullable=False)
    
    reference_no = Column(String(100), nullable=True)  # PO or Issue Voucher #
    issued_to_guard_id = Column(Integer, ForeignKey("guards.id"), nullable=True)
    issued_to_staff_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    issued_to_site_id = Column(Integer, ForeignKey("sites.id"), nullable=True)
    reason_notes = Column(Text, nullable=True)
    
    processed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)

    item = relationship("InventoryItem", back_populates="transactions")
    issued_guard = relationship("Guard", foreign_keys=[issued_to_guard_id])
    issued_staff = relationship("User", foreign_keys=[issued_to_staff_id])
    issued_site = relationship("Site", foreign_keys=[issued_to_site_id])
    processed_by = relationship("User", foreign_keys=[processed_by_user_id])


class AssetDamageDeduction(Base):
    __tablename__ = "asset_damage_deductions"

    id = Column(Integer, primary_key=True, index=True)
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id", ondelete="SET NULL"), nullable=True)
    inventory_item_id = Column(Integer, ForeignKey("inventory_items.id", ondelete="SET NULL"), nullable=True)
    allocation_id = Column(Integer, ForeignKey("asset_allocations.id", ondelete="SET NULL"), nullable=True)

    item_name = Column(String(255), nullable=False)
    item_tag = Column(String(100), nullable=True)
    damage_description = Column(Text, nullable=False)
    deduction_amount = Column(Float, nullable=False, default=0.0)
    incident_date = Column(Date, default=datetime.date.today, nullable=False)

    payroll_period_id = Column(Integer, ForeignKey("payroll_periods.id"), nullable=True, index=True)
    status = Column(String(50), default="PENDING", nullable=False)  # PENDING, DEDUCTED, WAIVED, CANCELLED
    deducted_at = Column(DateTime, nullable=True)

    created_by = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)

    guard = relationship("Guard", foreign_keys=[guard_id])
    asset = relationship("Asset", foreign_keys=[asset_id])
    inventory_item = relationship("InventoryItem", foreign_keys=[inventory_item_id])
    allocation = relationship("AssetAllocation", foreign_keys=[allocation_id])
    payroll_period = relationship("PayrollPeriod", foreign_keys=[payroll_period_id])


