import re
import secrets
from datetime import datetime
from typing import List, Optional, Tuple
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
    GuardCreate, GuardUpdate, GuardDeactivateRequest, GuardResponse, GuardDetailResponse, NextEmployeeNumberResponse
)

router = APIRouter(prefix="/guards", tags=["Guards Workforce Management"])


def compute_next_candidate(emp_no: str) -> Tuple[str, int, int]:
    """
    Extracts prefix, next integer value, and padding width.
    E.g.:
      '001' -> ('', 2, 3) -> '002'
      '002' -> ('', 3, 3) -> '003'
      '010' -> ('', 11, 3) -> '011'
      '099' -> ('', 100, 3) -> '100'
      'CS-00461' -> ('CS-', 462, 5) -> 'CS-00462'
      'CS-001' -> ('CS-', 2, 3) -> 'CS-002'
      '1' -> ('', 2, 3) -> '002'
    """
    match = re.search(r"^(.*?)(\d+)$", str(emp_no).strip())
    if not match:
        return ("", 1, 3)
    prefix = match.group(1)
    num_str = match.group(2)
    next_val = int(num_str) + 1
    # Maintain original padding width, or at least 3 digits if no prefix or short padding
    pad_width = max(len(num_str), 3 if not prefix else len(num_str))
    return prefix, next_val, pad_width


def get_last_registered_guard(db: Session) -> Optional[Guard]:
    """
    Finds the most recently registered guard with a valid employee number.
    Filters out accidental national ID entries (pure 7-9 digits without letters matching national ID).
    """
    guards = db.query(Guard).order_by(Guard.id.desc()).all()
    for g in guards:
        emp = (g.employee_number or "").strip()
        if not emp:
            continue
        if emp.isdigit() and int(emp) >= 1000000:
            nat = (g.national_id or "").strip()
            if emp in nat or nat in emp or len(emp) >= 7:
                continue
        if re.search(r"\d+$", emp):
            return g
    return None


def generate_next_employee_number(db: Session, base_emp_no: Optional[str] = None) -> str:
    """
    Calculates the next incremental unique employee number.
    Ensures strict uniqueness by advancing if a collision already exists in the database.
    """
    if base_emp_no:
        prefix, next_val, pad_width = compute_next_candidate(base_emp_no)
    else:
        last_guard = get_last_registered_guard(db)
        if not last_guard:
            prefix, next_val, pad_width = ("", 1, 3)
        else:
            prefix, next_val, pad_width = compute_next_candidate(last_guard.employee_number)

    candidate = f"{prefix}{next_val:0{pad_width}d}"

    while db.query(Guard).filter(Guard.employee_number == candidate).first() is not None:
        next_val += 1
        candidate = f"{prefix}{next_val:0{pad_width}d}"

    return candidate


def calculate_next_pure_number(db: Session) -> str:
    """Calculates the next pure numeric employee number (e.g. '001', '002'...)."""
    pure_guards = [
        g for g in db.query(Guard).all()
        if (g.employee_number or "").strip().isdigit() and int((g.employee_number or "").strip()) < 1000000
    ]
    if not pure_guards:
        candidate = "001"
    else:
        highest = max(int(g.employee_number.strip()) for g in pure_guards)
        candidate = f"{highest + 1:03d}"

    while db.query(Guard).filter(Guard.employee_number == candidate).first() is not None:
        num = int(candidate) + 1
        candidate = f"{num:03d}"
    return candidate


def _format_guard(guard: Guard) -> dict:
    return {
        "id": guard.id,
        "employee_number": guard.employee_number,
        "full_name": guard.full_name,
        "national_id": guard.national_id,
        "phone": guard.phone,
        "email": guard.email,
        "gender": guard.gender or "Male",
        "date_of_birth": guard.date_of_birth,
        "site_id": guard.primary_site_id,
        "shift_id": guard.shift_id,
        "supervisor_id": guard.supervisor_id,
        "supervisor_email": guard.supervisor.email if guard.supervisor else None,
        "hire_date": guard.hire_date,
        "basic_salary": guard.basic_salary,
        "resolved_basic_salary": guard.effective_basic_salary,
        "is_reliever": guard.is_reliever,
        "is_super_guard": bool(getattr(guard, "is_super_guard", False)),
        "payment_method": guard.payment_method,
        "bank_name": guard.bank_name,
        "bank_account": guard.bank_account,
        "mpesa_number": guard.mpesa_number,
        "nssf_number": guard.nssf_number,
        "shif_number": guard.shif_number,
        "kra_pin": guard.kra_pin,
        "status": guard.status,
        "deactivation_reason": guard.deactivation_reason,
        "education_level": guard.education_level,
        "emergency_contact_name": guard.emergency_contact_name,
        "emergency_contact_phone": guard.emergency_contact_phone,
        "blood_group": guard.blood_group,
        "next_of_kin": guard.next_of_kin,
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
    """Create a new guard profile with automatic incremental employee number."""
    emp_no = (payload.employee_number or "").strip()
    if not emp_no:
        emp_no = generate_next_employee_number(db)
    else:
        existing_emp = db.query(Guard).filter(Guard.employee_number == emp_no).first()
        if existing_emp:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Guard with Employee Number '{emp_no}' already exists."
            )

    existing_nat = db.query(Guard).filter(Guard.national_id == payload.national_id).first()
    if existing_nat:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Guard with National ID '{payload.national_id}' already exists."
        )

    user_email = payload.email or f"{emp_no.lower()}@corpsec.co.ke"
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
        employee_number=emp_no,
        full_name=payload.full_name,
        national_id=payload.national_id,
        phone=payload.phone,
        email=payload.email,
        date_of_birth=payload.date_of_birth,
        gender=payload.gender,
        primary_site_id=payload.site_id,
        shift_id=payload.shift_id,
        supervisor_id=payload.supervisor_id,
        hire_date=payload.hire_date,
        basic_salary=payload.basic_salary,
        is_reliever=payload.is_reliever,
        is_super_guard=payload.is_super_guard,
        payment_method=payload.payment_method,
        bank_name=payload.bank_name,
        bank_account=payload.bank_account,
        mpesa_number=payload.mpesa_number,
        nssf_number=payload.nssf_number,
        shif_number=payload.shif_number,
        kra_pin=payload.kra_pin,
        education_level=payload.education_level,
        emergency_contact_name=payload.emergency_contact_name,
        emergency_contact_phone=payload.emergency_contact_phone,
        blood_group=payload.blood_group,
        next_of_kin=payload.next_of_kin,
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

    if current_user.role == UserRole.GUARD.value:
        query = query.filter(Guard.id == current_user.guard_id)
    elif current_user.role == UserRole.SUPERVISOR.value:
        query = query.filter(Guard.supervisor_id == current_user.id)

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


@router.get("/next-employee-number", response_model=NextEmployeeNumberResponse)
def get_next_guard_employee_number(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns the next auto-incremental Employee Number based on the most recently registered guard.
    If previous was '001', returns '002'.
    If previous was 'CS-00461', returns 'CS-00462'.
    Guarantees strict uniqueness in the database.
    """
    last_guard = get_last_registered_guard(db)
    next_emp = generate_next_employee_number(db)
    prev_emp = last_guard.employee_number if last_guard else None
    suggested_pure = calculate_next_pure_number(db)
    return {
        "next_employee_number": next_emp,
        "previous_employee_number": prev_emp,
        "suggested_pure_number": suggested_pure
    }


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

    if current_user.role == UserRole.GUARD.value and current_user.guard_id != guard_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized to view other guard profiles")
    if current_user.role == UserRole.SUPERVISOR.value and guard.supervisor_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized to view profiles of guards not assigned to you")

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
    
    if "employee_number" in update_data and update_data["employee_number"]:
        new_emp = update_data["employee_number"].strip()
        existing = db.query(Guard).filter(Guard.employee_number == new_emp, Guard.id != guard_id).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Guard with Employee Number '{new_emp}' already exists."
            )
        update_data["employee_number"] = new_emp

    if "site_id" in update_data:
        update_data["primary_site_id"] = update_data.pop("site_id")
        if ("supervisor_id" not in update_data or not update_data["supervisor_id"]) and update_data["primary_site_id"]:
            target_site = db.query(Site).filter(Site.id == update_data["primary_site_id"]).first()
            if target_site and target_site.supervisor_id:
                update_data["supervisor_id"] = target_site.supervisor_id

    if "is_super_guard" in update_data:
        new_is_sg = bool(update_data["is_super_guard"])
        guard.is_super_guard = new_is_sg
        if not new_is_sg:
            # Clear super_guard_id on any site that assigned this guard as super guard
            db.query(Site).filter(Site.super_guard_id == guard.id).update(
                {Site.super_guard_id: None},
                synchronize_session=False
            )
        else:
            # If set to True and guard has a primary site that doesn't have a super guard, assign them
            if guard.primary_site_id:
                target_site = db.query(Site).filter(Site.id == guard.primary_site_id).first()
                if target_site and (target_site.super_guard_id is None or target_site.super_guard_id == guard.id):
                    target_site.super_guard_id = guard.id

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
    guard.is_super_guard = False
    guard.updated_at = datetime.now()
    db.query(Site).filter(Site.super_guard_id == guard.id).update(
        {Site.super_guard_id: None},
        synchronize_session=False
    )

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



@router.post("/{guard_id}/remove-super-guard", response_model=GuardResponse)
def remove_super_guard_mandate(
    guard_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Explicitly remove Super Guard designation from a guard and unassign from any sites."""
    guard = db.query(Guard).options(joinedload(Guard.site)).filter(Guard.id == guard_id).first()
    if not guard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guard not found")

    guard.is_super_guard = False
    guard.updated_at = datetime.now()
    db.query(Site).filter(Site.super_guard_id == guard.id).update(
        {Site.super_guard_id: None},
        synchronize_session=False
    )

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="REMOVE_SUPER_GUARD",
        target_entity="Guard",
        target_id=str(guard.id),
        new_values=f"Revoked Super Guard mandate from {guard.full_name}",
        reason="Super Guard revocation"
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(guard)
    return _format_guard(guard)


@router.post("/{guard_id}/assign-super-guard", response_model=GuardResponse)
def assign_super_guard_mandate(
    guard_id: int,
    site_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Explicitly assign Super Guard designation to a guard and attach to site."""
    guard = db.query(Guard).options(joinedload(Guard.site)).filter(Guard.id == guard_id).first()
    if not guard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guard not found")

    target_site_id = site_id or guard.primary_site_id
    if not target_site_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Guard must have an assigned primary site to be designated as Super Guard.")

    target_site = db.query(Site).filter(Site.id == target_site_id).first()
    if not target_site:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target site not found")

    # If the site had an existing super guard, demote them
    if target_site.super_guard_id and target_site.super_guard_id != guard.id:
        prev_sg = db.query(Guard).filter(Guard.id == target_site.super_guard_id).first()
        if prev_sg:
            prev_sg.is_super_guard = False

    guard.is_super_guard = True
    guard.primary_site_id = target_site.id
    guard.updated_at = datetime.now()
    target_site.super_guard_id = guard.id
    target_site.updated_at = datetime.now()

    audit_entry = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="ASSIGN_SUPER_GUARD",
        target_entity="Guard",
        target_id=str(guard.id),
        new_values=f"Designated {guard.full_name} as Super Guard for site {target_site.site_name}",
        reason="Super Guard designation"
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(guard)
    return _format_guard(guard)
