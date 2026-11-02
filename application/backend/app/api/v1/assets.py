import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from application.backend.app.api.deps import get_db, require_admin_or_hr
from application.backend.app.models.user import User
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.audit import AuditLog
from application.backend.app.models.asset import (
    AssetCategory, Asset, AssetAllocation, AssetMaintenance, InventoryItem, InventoryTransaction
)
from application.backend.app.schemas.asset import (
    AssetCategoryCreate, AssetCategoryResponse,
    AssetCreate, AssetUpdate, AssetResponse,
    AssetAllocationCreate, AssetReturnRequest, AssetAllocationResponse,
    AssetMaintenanceCreate, AssetMaintenanceResponse,
    InventoryItemCreate, InventoryItemUpdate, InventoryItemResponse,
    InventoryTransactionCreate, InventoryTransactionResponse
)

router = APIRouter(prefix="/assets", tags=["Company Assets & Inventory"])


def generate_next_asset_tag(db: Session, category_code: str) -> str:
    """Auto-generate asset tag: AST-{CAT}-{XXXX}."""
    clean_cat = (category_code or "GEN")[:4].upper()
    prefix = f"AST-{clean_cat}-"
    last_ast = db.query(Asset).filter(Asset.asset_tag.like(f"{prefix}%")).order_by(Asset.id.desc()).first()
    if last_ast and last_ast.asset_tag:
        try:
            num = int(last_ast.asset_tag.split("-")[-1]) + 1
        except Exception:
            num = 1
    else:
        num = 1
    return f"{prefix}{num:04d}"


def calculate_current_depreciated_value(asset: Asset) -> float:
    """Calculate real-time book value based on configured depreciation method."""
    cost = float(asset.purchase_cost or 0.0)
    salvage = float(asset.salvage_value or 0.0)
    rate = float(asset.depreciation_rate_annual or 10.0) / 100.0
    
    if cost <= 0 or asset.depreciation_method == "NONE":
        return cost

    purchase_dt = asset.purchase_date or datetime.date.today()
    days_held = max(0, (datetime.date.today() - purchase_dt).days)
    years_held = days_held / 365.25

    if asset.depreciation_method == "STRAIGHT_LINE":
        depreciable_base = max(0.0, cost - salvage)
        annual_deprec = depreciable_base * rate
        total_deprec = annual_deprec * years_held
        return round(max(salvage, cost - total_deprec), 2)
    elif asset.depreciation_method == "REDUCING_BALANCE":
        val = cost * ((1.0 - rate) ** years_held)
        return round(max(salvage, val), 2)
    
    return cost


# ==================== ASSET CATEGORIES ====================
@router.get("/categories", response_model=List[AssetCategoryResponse])
def list_asset_categories(db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    return db.query(AssetCategory).order_by(AssetCategory.name.asc()).all()


@router.post("/categories", response_model=AssetCategoryResponse, status_code=status.HTTP_201_CREATED)
def create_asset_category(payload: AssetCategoryCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    existing = db.query(AssetCategory).filter(
        (AssetCategory.code == payload.code.strip().upper()) |
        (AssetCategory.name == payload.name.strip())
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category name or code already exists")
    
    cat = AssetCategory(
        name=payload.name.strip(),
        code=payload.code.strip().upper(),
        description=payload.description,
        is_system=False
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


# ==================== ASSETS ====================
@router.get("", response_model=List[AssetResponse])
@router.get("/", response_model=List[AssetResponse])
def list_assets(
    category_id: Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    query = db.query(Asset)
    if category_id:
        query = query.filter(Asset.category_id == category_id)
    if status_filter and status_filter.strip() and status_filter.upper() != "ALL":
        query = query.filter(Asset.status == status_filter.strip().upper())
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (Asset.name.ilike(term)) |
            (Asset.asset_tag.ilike(term)) |
            (Asset.serial_number.ilike(term)) |
            (Asset.make_model.ilike(term)) |
            (Asset.location_branch.ilike(term))
        )
    
    assets = query.order_by(Asset.id.desc()).all()
    # Enrich response
    out = []
    for a in assets:
        computed_val = calculate_current_depreciated_value(a)
        res = AssetResponse.model_validate(a)
        res.current_value = computed_val
        res.category_name = a.category.name if a.category else None
        res.assigned_employee_name = a.assigned_employee.full_name if a.assigned_employee else None
        res.assigned_site_name = a.assigned_site.site_name if a.assigned_site else None
        out.append(res)
    return out


@router.post("", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=AssetResponse, status_code=status.HTTP_201_CREATED)
def create_asset(payload: AssetCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    cat = db.query(AssetCategory).filter(AssetCategory.id == payload.category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Asset category not found")

    tag = payload.asset_tag or generate_next_asset_tag(db, cat.code)
    existing = db.query(Asset).filter(Asset.asset_tag == tag).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Asset tag '{tag}' already exists")

    cost = float(payload.purchase_cost)
    asset = Asset(
        asset_tag=tag,
        name=payload.name.strip(),
        category_id=payload.category_id,
        description=payload.description,
        serial_number=payload.serial_number,
        make_model=payload.make_model,
        purchase_date=payload.purchase_date,
        purchase_cost=cost,
        supplier_name=payload.supplier_name,
        current_value=cost,
        salvage_value=float(payload.salvage_value),
        depreciation_method=payload.depreciation_method,
        depreciation_rate_annual=float(payload.depreciation_rate_annual),
        condition=payload.condition.upper(),
        status=payload.status.upper(),
        location_branch=payload.location_branch,
        warranty_expiry=payload.warranty_expiry,
        notes=payload.notes
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)

    try:
        db.add(AuditLog(
            user_id=current_user.id,
            action="CREATE_ASSET",
            details=f"Registered asset {asset.asset_tag} - {asset.name} (Cost: KES {asset.purchase_cost:,.2f})"
        ))
        db.commit()
    except Exception:
        pass

    res = AssetResponse.model_validate(asset)
    res.category_name = cat.name
    return res


@router.get("/summary/kpis")
def get_assets_kpi_summary(db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    assets = db.query(Asset).all()
    total_count = len(assets)
    total_val = sum(calculate_current_depreciated_value(a) for a in assets)
    allocated_count = sum(1 for a in assets if a.status == "ALLOCATED")
    maintenance_count = sum(1 for a in assets if a.status == "UNDER_MAINTENANCE")
    damaged_missing = sum(1 for a in assets if a.status in ["LOST", "DISPOSED"] or a.condition == "DAMAGED")
    
    # Inventory KPI
    inv_items = db.query(InventoryItem).all()
    total_inv_val = sum(it.current_stock * it.unit_cost for it in inv_items)
    low_stock_count = sum(1 for it in inv_items if it.current_stock <= it.minimum_stock_level)

    return {
        "total_assets": total_count,
        "total_asset_value": round(total_val, 2),
        "allocated_assets": allocated_count,
        "under_maintenance": maintenance_count,
        "damaged_or_missing": damaged_missing,
        "total_inventory_items": len(inv_items),
        "total_inventory_value": round(total_inv_val, 2),
        "low_stock_alerts": low_stock_count
    }


# ==================== ASSET ALLOCATIONS ====================

@router.post("/allocations", response_model=AssetAllocationResponse)
def allocate_asset_direct(payload: AssetAllocationCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    return allocate_asset(asset_id=payload.asset_id, payload=payload, db=db, current_user=current_user)

@router.post("/{asset_id}/allocate", response_model=AssetAllocationResponse)
def allocate_asset(asset_id: int, payload: AssetAllocationCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Deactivate existing active allocations for this asset
    existing_actives = db.query(AssetAllocation).filter(
        AssetAllocation.asset_id == asset_id,
        AssetAllocation.status == "ACTIVE"
    ).all()
    for prev in existing_actives:
        prev.status = "TRANSFERRED"
        prev.return_date = datetime.date.today()

    alloc_type = payload.allocation_type.upper()
    is_staff = alloc_type == "STAFF" or (payload.staff_id and not payload.guard_id)
    is_guard = alloc_type in ["EMPLOYEE", "GUARD"] or (payload.guard_id and not payload.staff_id)
    
    alloc = AssetAllocation(
        asset_id=asset_id,
        allocation_type="STAFF" if is_staff else ("EMPLOYEE" if is_guard else alloc_type),
        guard_id=payload.guard_id if is_guard else None,
        staff_id=payload.staff_id if is_staff else None,
        site_id=payload.site_id if alloc_type == "SITE" else None,
        branch_name=payload.branch_name if alloc_type == "BRANCH" else None,
        allocated_date=payload.allocated_date,
        expected_return_date=payload.expected_return_date,
        condition_on_allocation=payload.condition_on_allocation,
        status="ACTIVE",
        notes=payload.notes,
        allocated_by_user_id=current_user.id
    )
    db.add(alloc)

    # Update asset snapshot
    asset.status = "ALLOCATED"
    asset.assigned_to_employee_id = alloc.guard_id
    asset.assigned_to_staff_id = alloc.staff_id
    asset.assigned_to_site_id = alloc.site_id
    if is_staff and alloc.staff_id:
        u = db.query(User).filter(User.id == alloc.staff_id).first()
        if u: asset.location_branch = f"Staff: {u.full_name or u.email}"
    elif is_guard and alloc.guard_id:
        g = db.query(Guard).filter(Guard.id == alloc.guard_id).first()
        if g: asset.location_branch = f"Guard: {g.full_name}"
    elif alloc.branch_name:
        asset.location_branch = alloc.branch_name
    elif alloc.site_id:
        st = db.query(Site).filter(Site.id == alloc.site_id).first()
        if st: asset.location_branch = f"Site: {st.site_name}"

    asset.updated_at = datetime.datetime.now()
    db.commit()
    db.refresh(alloc)

    res = AssetAllocationResponse.model_validate(alloc)
    res.asset_tag = asset.asset_tag
    res.asset_name = asset.name
    res.asset_serial = asset.serial_number
    res.asset_category = asset.category.name if asset.category else None
    res.guard_name = alloc.guard.full_name if alloc.guard else None
    res.staff_name = alloc.staff.full_name if alloc.staff else None
    res.staff_email = alloc.staff.email if alloc.staff else None
    res.site_name = alloc.site.site_name if alloc.site else None
    return res


@router.post("/{asset_id}/return", response_model=AssetAllocationResponse)
def return_asset(asset_id: int, payload: AssetReturnRequest, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    active_alloc = db.query(AssetAllocation).filter(
        AssetAllocation.asset_id == asset_id,
        AssetAllocation.status == "ACTIVE"
    ).order_by(AssetAllocation.id.desc()).first()

    if not active_alloc:
        raise HTTPException(status_code=400, detail="Asset does not have an active allocation to return")

    active_alloc.status = "RETURNED"
    active_alloc.return_date = payload.return_date
    active_alloc.condition_on_return = payload.condition_on_return
    if payload.notes:
        active_alloc.notes = f"{active_alloc.notes or ''}\nReturn notes: {payload.notes}".strip()

    # Reset asset
    asset.status = "AVAILABLE"
    asset.condition = payload.condition_on_return
    asset.assigned_to_employee_id = None
    asset.assigned_to_staff_id = None
    asset.assigned_to_site_id = None
    asset.location_branch = "Head Office Logistics"
    asset.updated_at = datetime.datetime.now()

    db.commit()
    db.refresh(active_alloc)

    res = AssetAllocationResponse.model_validate(active_alloc)
    res.asset_tag = asset.asset_tag
    res.asset_name = asset.name
    res.asset_serial = asset.serial_number
    res.asset_category = asset.category.name if asset.category else None
    res.guard_name = active_alloc.guard.full_name if active_alloc.guard else None
    res.staff_name = active_alloc.staff.full_name if active_alloc.staff else None
    res.staff_email = active_alloc.staff.email if active_alloc.staff else None
    return res


@router.get("/allocations", response_model=List[AssetAllocationResponse])
def list_allocations(
    guard_id: Optional[int] = Query(None),
    staff_id: Optional[int] = Query(None),
    asset_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    q = db.query(AssetAllocation)
    if guard_id is not None:
        q = q.filter(AssetAllocation.guard_id == guard_id)
    if staff_id is not None:
        q = q.filter(AssetAllocation.staff_id == staff_id)
    if asset_id is not None:
        q = q.filter(AssetAllocation.asset_id == asset_id)
    if status and status != "ALL":
        q = q.filter(AssetAllocation.status == status.upper())

    allocs = q.order_by(AssetAllocation.id.desc()).all()
    out = []
    for al in allocs:
        res = AssetAllocationResponse.model_validate(al)
        res.asset_tag = al.asset.asset_tag if al.asset else None
        res.asset_name = al.asset.name if al.asset else None
        res.asset_serial = al.asset.serial_number if al.asset else None
        res.asset_category = al.asset.category.name if al.asset and al.asset.category else None
        res.guard_name = al.guard.full_name if al.guard else None
        res.staff_name = al.staff.full_name if al.staff else None
        res.staff_email = al.staff.email if al.staff else None
        res.site_name = al.site.site_name if al.site else None
        out.append(res)
    return out


@router.post("/allocations/{allocation_id}/return", response_model=AssetAllocationResponse)
def return_allocation_by_id(
    allocation_id: int,
    payload: AssetReturnRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    alloc = db.query(AssetAllocation).filter(AssetAllocation.id == allocation_id).first()
    if not alloc:
        raise HTTPException(status_code=404, detail="Allocation record not found")
    if alloc.status == "RETURNED":
        raise HTTPException(status_code=400, detail="This item has already been marked as returned")

    alloc.status = "RETURNED"
    alloc.return_date = payload.return_date
    alloc.condition_on_return = payload.condition_on_return
    if payload.notes:
        alloc.notes = f"{alloc.notes or ''}\nReturn notes: {payload.notes}".strip()

    if alloc.asset:
        alloc.asset.status = "AVAILABLE"
        alloc.asset.condition = payload.condition_on_return
        alloc.asset.assigned_to_employee_id = None
        alloc.asset.assigned_to_staff_id = None
        alloc.asset.assigned_to_site_id = None
        alloc.asset.location_branch = "Head Office Logistics"
        alloc.asset.updated_at = datetime.datetime.now()

    db.commit()
    db.refresh(alloc)

    res = AssetAllocationResponse.model_validate(alloc)
    res.asset_tag = alloc.asset.asset_tag if alloc.asset else None
    res.asset_name = alloc.asset.name if alloc.asset else None
    res.asset_serial = alloc.asset.serial_number if alloc.asset else None
    res.asset_category = alloc.asset.category.name if alloc.asset and alloc.asset.category else None
    res.guard_name = alloc.guard.full_name if alloc.guard else None
    res.staff_name = alloc.staff.full_name if alloc.staff else None
    res.staff_email = alloc.staff.email if alloc.staff else None
    res.site_name = alloc.site.site_name if alloc.site else None
    return res


@router.get("/{asset_id}/history", response_model=List[AssetAllocationResponse])
def get_asset_allocation_history(asset_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    allocs = db.query(AssetAllocation).filter(AssetAllocation.asset_id == asset_id).order_by(AssetAllocation.id.desc()).all()
    out = []
    for al in allocs:
        res = AssetAllocationResponse.model_validate(al)
        res.asset_tag = al.asset.asset_tag if al.asset else None
        res.asset_name = al.asset.name if al.asset else None
        res.guard_name = al.guard.full_name if al.guard else None
        res.site_name = al.site.site_name if al.site else None
        out.append(res)
    return out


# ==================== ASSET MAINTENANCE ====================
@router.post("/maintenance", response_model=AssetMaintenanceResponse)
def log_asset_maintenance_direct(payload: AssetMaintenanceCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    return log_asset_maintenance(asset_id=payload.asset_id, payload=payload, db=db, current_user=current_user)

@router.get("/maintenance", response_model=List[AssetMaintenanceResponse])
def list_all_maintenance(db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    recs = db.query(AssetMaintenance).order_by(AssetMaintenance.id.desc()).all()
    out = []
    for r in recs:
        res = AssetMaintenanceResponse.model_validate(r)
        res.asset_tag = r.asset.asset_tag if r.asset else None
        res.asset_name = r.asset.name if r.asset else None
        out.append(res)
    return out

@router.post("/{asset_id}/maintenance", response_model=AssetMaintenanceResponse)
def log_asset_maintenance(asset_id: int, payload: AssetMaintenanceCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    asset = db.query(Asset).filter(Asset.id == asset_id).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    maint = AssetMaintenance(
        asset_id=asset_id,
        maintenance_type=payload.maintenance_type,
        description=payload.description,
        service_provider=payload.service_provider,
        cost=float(payload.cost),
        maintenance_date=payload.maintenance_date,
        next_due_date=payload.next_due_date,
        status=payload.status,
        invoice_receipt_no=payload.invoice_receipt_no,
        notes=payload.notes,
        logged_by_user_id=current_user.id
    )
    db.add(maint)

    if payload.status == "IN_PROGRESS":
        asset.status = "UNDER_MAINTENANCE"
    elif payload.status == "COMPLETED" and asset.status == "UNDER_MAINTENANCE":
        asset.status = "AVAILABLE"

    asset.updated_at = datetime.datetime.now()
    db.commit()
    db.refresh(maint)

    res = AssetMaintenanceResponse.model_validate(maint)
    res.asset_tag = asset.asset_tag
    res.asset_name = asset.name
    return res


@router.get("/{asset_id}/maintenance", response_model=List[AssetMaintenanceResponse])
def get_asset_maintenance_records(asset_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    recs = db.query(AssetMaintenance).filter(AssetMaintenance.asset_id == asset_id).order_by(AssetMaintenance.id.desc()).all()
    out = []
    for r in recs:
        res = AssetMaintenanceResponse.model_validate(r)
        res.asset_tag = r.asset.asset_tag if r.asset else None
        res.asset_name = r.asset.name if r.asset else None
        out.append(res)
    return out


# ==================== INVENTORY MANAGEMENT ====================
@router.get("/inventory", response_model=List[InventoryItemResponse])
@router.get("/inventory/items", response_model=List[InventoryItemResponse])
def list_inventory_items(
    category: Optional[str] = Query(None),
    low_stock_only: bool = Query(False),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    query = db.query(InventoryItem)
    if category and category.strip() and category != "ALL":
        query = query.filter(InventoryItem.category == category.strip())
    if low_stock_only:
        query = query.filter(InventoryItem.current_stock <= InventoryItem.minimum_stock_level)
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (InventoryItem.item_name.ilike(term)) |
            (InventoryItem.item_code.ilike(term)) |
            (InventoryItem.description.ilike(term)) |
            (InventoryItem.storage_location.ilike(term))
        )
    return query.order_by(InventoryItem.item_name.asc()).all()


@router.post("/inventory", response_model=InventoryItemResponse, status_code=status.HTTP_201_CREATED)
@router.post("/inventory/items", response_model=InventoryItemResponse, status_code=status.HTTP_201_CREATED)
def create_inventory_item(payload: InventoryItemCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    code = payload.item_code
    if not code:
        cat_pfx = (payload.category or "GEN")[:3].upper()
        cnt = db.query(InventoryItem).filter(InventoryItem.category == payload.category).count() + 1
        code = f"INV-{cat_pfx}-{cnt:03d}"

    existing = db.query(InventoryItem).filter(InventoryItem.item_code == code).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Item code '{code}' already exists")

    item = InventoryItem(
        item_code=code,
        item_name=payload.item_name.strip(),
        category=payload.category,
        description=payload.description,
        unit_of_measure=payload.unit_of_measure,
        unit_cost=float(payload.unit_cost),
        minimum_stock_level=payload.minimum_stock_level,
        current_stock=payload.initial_stock,
        reorder_quantity=payload.reorder_quantity,
        storage_location=payload.storage_location
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    # If initial stock > 0, create an audit transaction
    if payload.initial_stock > 0:
        tx = InventoryTransaction(
            item_id=item.id,
            transaction_type="RECEIVED",
            quantity=payload.initial_stock,
            unit_cost=item.unit_cost,
            total_cost=payload.initial_stock * item.unit_cost,
            reason_notes="Initial stock intake on registration",
            processed_by_user_id=current_user.id
        )
        db.add(tx)
        db.commit()

    return item


@router.put("/inventory/items/{item_id}", response_model=InventoryItemResponse)
def update_inventory_item(item_id: int, payload: InventoryItemUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(item, k, v)

    item.updated_at = datetime.datetime.now()
    db.commit()
    db.refresh(item)
    return item

@router.delete("/inventory/items/{item_id}")
def delete_inventory_item(item_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    name = item.item_name
    db.delete(item)
    db.commit()
    return {"message": f"Inventory item {name} deleted successfully"}


@router.post("/inventory/transactions", response_model=InventoryTransactionResponse)
@router.post("/inventory/transact", response_model=InventoryTransactionResponse)
def transact_inventory_stock(payload: InventoryTransactionCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    item = db.query(InventoryItem).filter(InventoryItem.id == payload.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")

    qty = int(payload.quantity)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="Transaction quantity must be greater than 0")

    tt = payload.transaction_type.upper()
    if tt in ["ISSUED", "DISPATCH"]:
        if item.current_stock < qty:
            raise HTTPException(status_code=400, detail=f"Insufficient stock! Available: {item.current_stock}, Requested: {qty}")
        item.current_stock -= qty
    elif tt in ["RECEIVED", "STOCK_IN", "RETURNED"]:
        item.current_stock += qty
    elif tt == "ADJUSTMENT":
        item.current_stock = qty  # for direct physical stock reconciliation
    else:
        raise HTTPException(status_code=400, detail=f"Unknown transaction type: {tt}")

    unit_cost = float(payload.unit_cost if payload.unit_cost is not None else item.unit_cost)
    total_cost = round(qty * unit_cost, 2)

    tx = InventoryTransaction(
        item_id=item.id,
        transaction_type=tt,
        quantity=qty,
        unit_cost=unit_cost,
        total_cost=total_cost,
        reference_no=payload.reference_no,
        issued_to_guard_id=payload.issued_to_guard_id,
        issued_to_staff_id=payload.issued_to_staff_id,
        issued_to_site_id=payload.issued_to_site_id,
        reason_notes=payload.reason_notes,
        processed_by_user_id=current_user.id
    )
    db.add(tx)
    item.updated_at = datetime.datetime.now()
    db.commit()
    db.refresh(tx)

    res = InventoryTransactionResponse.model_validate(tx)
    res.item_code = item.item_code
    res.item_name = item.item_name
    res.issued_guard_name = tx.issued_guard.full_name if tx.issued_guard else None
    res.issued_staff_name = tx.issued_staff.full_name if tx.issued_staff else None
    res.issued_site_name = tx.issued_site.site_name if tx.issued_site else None
    res.current_stock = item.current_stock
    return res


@router.get("/inventory/transactions", response_model=List[InventoryTransactionResponse])
def list_inventory_transactions(
    item_id: Optional[int] = Query(None),
    guard_id: Optional[int] = Query(None),
    staff_id: Optional[int] = Query(None),
    transaction_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_hr)
):
    query = db.query(InventoryTransaction)
    if item_id:
        query = query.filter(InventoryTransaction.item_id == item_id)
    if guard_id is not None:
        query = query.filter(InventoryTransaction.issued_to_guard_id == guard_id)
    if staff_id is not None:
        query = query.filter(InventoryTransaction.issued_to_staff_id == staff_id)
    if transaction_type and transaction_type != "ALL":
        query = query.filter(InventoryTransaction.transaction_type == transaction_type.upper())

    txs = query.order_by(InventoryTransaction.id.desc()).limit(200).all()
    out = []
    for t in txs:
        res = InventoryTransactionResponse.model_validate(t)
        res.item_code = t.item.item_code if t.item else None
        res.item_name = t.item.item_name if t.item else None
        res.issued_guard_name = t.issued_guard.full_name if t.issued_guard else None
        res.issued_staff_name = t.issued_staff.full_name if t.issued_staff else None
        res.issued_site_name = t.issued_site.site_name if t.issued_site else None
        out.append(res)
    return out


# ==================== INDIVIDUAL ASSET BY ID ====================
@router.get("/{asset_id}", response_model=AssetResponse)
def get_asset_details(asset_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    a = db.query(Asset).filter(Asset.id == asset_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Asset not found")
    res = AssetResponse.model_validate(a)
    res.current_value = calculate_current_depreciated_value(a)
    res.category_name = a.category.name if a.category else None
    res.assigned_employee_name = a.assigned_employee.full_name if a.assigned_employee else None
    res.assigned_site_name = a.assigned_site.site_name if a.assigned_site else None
    return res


@router.put("/{asset_id}", response_model=AssetResponse)
def update_asset(asset_id: int, payload: AssetUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    a = db.query(Asset).filter(Asset.id == asset_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Asset not found")

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(a, k, v)

    a.updated_at = datetime.datetime.now()
    db.commit()
    db.refresh(a)

    res = AssetResponse.model_validate(a)
    res.current_value = calculate_current_depreciated_value(a)
    res.category_name = a.category.name if a.category else None
    res.assigned_employee_name = a.assigned_employee.full_name if a.assigned_employee else None
    res.assigned_site_name = a.assigned_site.site_name if a.assigned_site else None
    return res


@router.delete("/{asset_id}")
def delete_asset(asset_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin_or_hr)):
    a = db.query(Asset).filter(Asset.id == asset_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Asset not found")
    tag = a.asset_tag
    db.delete(a)
    db.commit()
    return {"message": f"Asset {tag} deleted successfully"}
