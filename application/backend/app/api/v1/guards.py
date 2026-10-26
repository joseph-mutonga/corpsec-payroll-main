import secrets
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from application.backend.app.api.deps import get_db, require_admin, get_current_user
from application.backend.app.core.security import get_password_hash
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.shift import Shift
from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.audit import AuditLog
from application.backend.app.schemas.guard import (
    GuardCreate, GuardUpdate, GuardDeactivateRequest, GuardResponse, GuardDetailResponse
)

router = APIRouter(prefix="/guards", tags=["Guards Workforce Management"])


def _format_guard(guard: Guard) -> dict:
    return {
        "id": guard.id,
        "employee_number": guard.employee_number,
        "full_name": guard.full_name,
        "national_id": guard.national_id,
        "phone": guard.phone,
        "email": guard.email,
        "site_id": guard.primary_site_id,
        "shift_id": guard.shift_id,
        "hire_date": guard.hire_date,
        "basic_salary": guard.basic_salary,
        "resolved_basic_salary": guard.effective_basic_salary,
        "is_reliever": guard.is_reliever,
        "payment_method": guard.payment_method,
        "bank_name": guard.bank_name,
        "bank_account": guard.bank_account,
        "mpesa_number": guard.mpesa_number,
        "nssf_number": guard.nssf_number,
        "shif_number": guard.shif_number,
        "kra_pin": guard.kra_pin,
        "status": guard.status,
        "deactivation_reason": guard.deactivation_reason,
        "created_at": guard.created_at
    }


def _format_guard_detail(guard: Guard) -> dict:
    res = _format_guard(guard)
    res["site"] = guard.site
    res["shift"] = guard.shift
    return res


@router.post("", response_model=GuardResponse, status_code=status.HTTP_201_CREATED)
def create_guard_profile(
    payload: GuardCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Create a new guard profile."""
    existing_emp = db.query(Guard).filter(Guard.employee_number == payload.employee_number).first()
    if existing_emp:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Guard with Employee Number '{payload.employee_number}' already exists."
        )

    existing_nat = db.query(Guard).filter(Guard.national_id == payload.national_id).first()
    if existing_nat:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Guard with National ID '{payload.national_id}' already exists."
        )

    user_email = payload.email or f"{payload.employee_number.lower()}@corpsec.co.ke"
    existing_user_email = db.query(User).filter(User.email == user_email).first()
    if existing_user_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Portal User account with email '{user_email}' already exists."
        )

    existing_user_phone = db.query(User).filter(User.phone == payload.phone).first()
    if existing_user_phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Portal User account with phone '{payload.phone}' already exists."
        )

    if payload.site_id:
        site = db.query(Site).filter(Site.id == payload.site_id).first()
        if not site:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned site not found")

    if payload.shift_id:
        shift = db.query(Shift).filter(Shift.id == payload.shift_id).first()
        if not shift:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned shift not found")

    guard = Guard(
        employee_number=payload.employee_number,
        full_name=payload.full_name,
        national_id=payload.national_id,
        phone=payload.phone,
        email=payload.email,
        date_of_birth=payload.date_of_birth,
        gender=payload.gender,
        primary_site_id=payload.site_id,
        shift_id=payload.shift_id,
        hire_date=payload.hire_date,
        basic_salary=payload.basic_salary,
        is_reliever=payload.is_reliever,
        payment_method=payload.payment_method,
        bank_name=payload.bank_name,
        bank_account=payload.bank_account,
        mpesa_number=payload.mpesa_number,
        nssf_number=payload.nssf_number,
        shif_number=payload.shif_number,
        kra_pin=payload.kra_pin,
        status="ACTIVE"
    )
    db.add(guard)
    db.flush()

    if payload.initial_password and len(payload.initial_password.strip()) >= 6:
        initial_pwd = payload.initial_password.strip()
    else:
        initial_pwd = f"Guard#{secrets.randbelow(899999)+100000}"

    user_account = User(
        email=user_email,
        phone=payload.phone,
        password_hash=get_password_hash(initial_pwd),
        role=UserRole.GUARD.value,
        status=UserStatus.ACTIVE.value,
        guard_id=guard.id,
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(user_account)

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="CREATE_GUARD",
        target_entity="Guard",
        target_id=str(guard.id),
        new_values=f"Created guard '{guard.full_name}' ({guard.employee_number})",
        reason="Administrative onboarding"
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(guard)

    return _format_guard(guard)


@router.get("", response_model=List[GuardResponse])
def list_guards(
    status_filter: Optional[str] = Query(None, alias="status"),
    site_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    is_reliever: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List and filter guards directory."""
    query = db.query(Guard).options(joinedload(Guard.site))

    if status_filter:
        query = query.filter(Guard.status == status_filter.upper())
    if site_id:
        query = query.filter(Guard.primary_site_id == site_id)
    if is_reliever is not None:
        query = query.filter(Guard.is_reliever == is_reliever)
    if search:
        query = query.filter(
            (Guard.full_name.ilike(f"%{search}%")) |
            (Guard.employee_number.ilike(f"%{search}%")) |
            (Guard.national_id.ilike(f"%{search}%"))
        )

    guards = query.order_by(Guard.id.desc()).all()
    return [_format_guard(g) for g in guards]


@router.get("/{guard_id}", response_model=GuardDetailResponse)
def get_guard_detail(
    guard_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fetch complete guard profile details."""
    guard = db.query(Guard).options(
        joinedload(Guard.site),
        joinedload(Guard.shift)
    ).filter(Guard.id == guard_id).first()

    if not guard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guard not found")

    return _format_guard_detail(guard)


@router.put("/{guard_id}", response_model=GuardResponse)
def update_guard_profile(
    guard_id: int,
    payload: GuardUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Update guard profile information."""
    guard = db.query(Guard).options(joinedload(Guard.site)).filter(Guard.id == guard_id).first()
    if not guard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guard not found")

    update_data = payload.model_dump(exclude_unset=True)
    
    if "site_id" in update_data:
        update_data["primary_site_id"] = update_data.pop("site_id")

    for key, value in update_data.items():
        setattr(guard, key, value)

    guard.updated_at = datetime.now()

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="UPDATE_GUARD",
        target_entity="Guard",
        target_id=str(guard.id),
        new_values=str(update_data),
        reason="Updated guard profile details"
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(guard)

    return _format_guard(guard)


@router.post("/{guard_id}/deactivate", response_model=GuardResponse)
def deactivate_guard(
    guard_id: int,
    payload: GuardDeactivateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Deactivate a guard profile."""
    guard = db.query(Guard).options(joinedload(Guard.site)).filter(Guard.id == guard_id).first()
    if not guard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guard not found")

    if guard.status == "INACTIVE":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Guard is already deactivated.")

    guard.status = "INACTIVE"
    guard.deactivation_reason = payload.reason
    guard.updated_at = datetime.now()

    user_acc = db.query(User).filter(User.guard_id == guard.id).first()
    if user_acc:
        user_acc.status = UserStatus.SUSPENDED.value

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="DEACTIVATE_GUARD",
        target_entity="Guard",
        target_id=str(guard.id),
        reason=payload.reason
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(guard)

    return _format_guard(guard)


@router.post("/{guard_id}/reactivate", response_model=GuardResponse)
def reactivate_guard(
    guard_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Reactivate a previously deactivated guard profile."""
    guard = db.query(Guard).options(joinedload(Guard.site)).filter(Guard.id == guard_id).first()
    if not guard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guard not found")

    if guard.status == "ACTIVE":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Guard is already active.")

    guard.status = "ACTIVE"
    guard.deactivation_reason = None
    guard.updated_at = datetime.now()

    user_acc = db.query(User).filter(User.guard_id == guard.id).first()
    if user_acc:
        user_acc.status = UserStatus.ACTIVE.value

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="REACTIVATE_GUARD",
        target_entity="Guard",
        target_id=str(guard.id),
        reason="Administrative reactivation"
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(guard)

    return _format_guard(guard)
