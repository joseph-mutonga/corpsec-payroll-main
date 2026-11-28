import re
import secrets
from datetime import datetime
from typing import List, Optional, Tuple
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from application.backend.app.api.deps import get_db, require_admin, require_admin_or_hr, get_current_user
from application.backend.app.core.phone import validate_kenyan_phone, kenyan_phone_variants, normalize_kenyan_phone
from application.backend.app.core.security import get_password_hash
from application.backend.app.services.guard_auth_migration import initialize_guard_phone_credentials
from application.backend.app.models.guard import Guard
from application.backend.app.models.site import Site
from application.backend.app.models.shift import Shift
from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.audit import AuditLog
from application.backend.app.schemas.guard import (
    GuardCreate, GuardUpdate, GuardDeactivateRequest, GuardResponse, GuardDetailResponse, NextEmployeeNumberResponse
)

router = APIRouter(prefix="/guards", tags=["Guards Workforce Management"])


def _validate_supervisor_user(db: Session, supervisor_id: Optional[int]) -> Optional[User]:
    """Validate that supervisor_id refers to a Supervisor, HR Manager, or Admin user."""
    if supervisor_id is None:
        return None
    sup = db.query(User).filter(
        User.id == supervisor_id,
        func.upper(User.role).in_([UserRole.SUPERVISOR.value, UserRole.HR.value, UserRole.ADMIN.value])
    ).first()
    if not sup:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assigned Supervisor / HR personnel not found."
        )
    return sup


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
    admin: User = Depends(require_admin_or_hr)
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

    valid_phone, norm_phone, phone_err = validate_kenyan_phone(payload.phone)
    if not valid_phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=phone_err or "Invalid Kenyan phone number."
        )
    phone_variants = kenyan_phone_variants(norm_phone)

    existing_guard_phone = db.query(Guard).filter(Guard.phone.in_(phone_variants)).first()
    if existing_guard_phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A guard profile with phone number '{norm_phone}' already exists."
        )

    existing_user_phone = db.query(User).filter(User.phone.in_(phone_variants)).first()
    if existing_user_phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Portal User account with phone '{norm_phone}' already exists."
        )

    if payload.site_id:
        site = db.query(Site).filter(Site.id == payload.site_id).first()
        if not site:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned site not found")

    if payload.shift_id:
        shift = db.query(Shift).filter(Shift.id == payload.shift_id).first()
        if not shift:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned shift not found")

    if payload.supervisor_id:
        _validate_supervisor_user(db, payload.supervisor_id)

    guard = Guard(
        employee_number=emp_no,
        full_name=payload.full_name,
        national_id=payload.national_id,
        phone=norm_phone,
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

    explicit_pw = payload.initial_password.strip() if (payload.initial_password and len(payload.initial_password.strip()) >= 6) else None
    initial_pwd = explicit_pw if explicit_pw else norm_phone
    must_change = (explicit_pw is None) or (normalize_kenyan_phone(initial_pwd) == norm_phone)

    user_account = User(
        full_name=guard.full_name,
        email=user_email,
        phone=norm_phone,
        password_hash=get_password_hash(initial_pwd),
        role=UserRole.GUARD.value,
        status=UserStatus.ACTIVE.value,
        must_change_password=must_change,
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
    supervisor_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    is_reliever: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List and filter guards directory."""
    query = db.query(Guard).options(
        joinedload(Guard.site),
        joinedload(Guard.shift),
        joinedload(Guard.supervisor)
    )

    if current_user.role == UserRole.GUARD.value:
        query = query.filter(Guard.id == current_user.guard_id)
    elif current_user.role == UserRole.SUPERVISOR.value:
        sup_site_ids = [s[0] for s in db.query(Site.id).filter(Site.supervisor_id == current_user.id).all()]
        if sup_site_ids:
            query = query.filter((Guard.supervisor_id == current_user.id) | (Guard.primary_site_id.in_(sup_site_ids)))
        else:
            query = query.filter(Guard.supervisor_id == current_user.id)

    if status_filter:
        query = query.filter(Guard.status == status_filter.upper())
    if site_id:
        query = query.filter(Guard.primary_site_id == site_id)
    if supervisor_id:
        sup_site_ids_f = [s[0] for s in db.query(Site.id).filter(Site.supervisor_id == supervisor_id).all()]
        if sup_site_ids_f:
            query = query.filter((Guard.supervisor_id == supervisor_id) | (Guard.primary_site_id.in_(sup_site_ids_f)))
        else:
            query = query.filter(Guard.supervisor_id == supervisor_id)
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
    if current_user.role == UserRole.SUPERVISOR.value:
        sup_site_ids = [s[0] for s in db.query(Site.id).filter(Site.supervisor_id == current_user.id).all()]
        is_assigned = (guard.supervisor_id == current_user.id) or (guard.primary_site_id in sup_site_ids if sup_site_ids else False)
        if not is_assigned:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized to view profiles of guards not assigned to you")

    return _format_guard_detail(guard)


@router.put("/{guard_id}", response_model=GuardDetailResponse)
def update_guard_profile(
    guard_id: int,
    payload: GuardUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
):
    """Update guard profile information and persist all changes to database."""
    guard = db.query(Guard).options(
        joinedload(Guard.site),
        joinedload(Guard.shift),
        joinedload(Guard.supervisor)
    ).filter(Guard.id == guard_id).first()
    if not guard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guard not found")

    update_data = payload.model_dump(exclude_unset=True)

    # Guard against accidental null writes on non-nullable columns
    non_nullable_fields = {
        "employee_number", "full_name", "national_id", "phone",
        "hire_date", "gender", "payment_method", "is_reliever", "is_super_guard"
    }
    for req_field in list(non_nullable_fields):
        if req_field in update_data and update_data[req_field] is None:
            update_data.pop(req_field)

    if "employee_number" in update_data and update_data["employee_number"]:
        new_emp = update_data["employee_number"].strip()
        existing = db.query(Guard).filter(Guard.employee_number == new_emp, Guard.id != guard_id).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Guard with Employee Number '{new_emp}' already exists."
            )
        update_data["employee_number"] = new_emp

    if "national_id" in update_data and update_data["national_id"]:
        new_nat = update_data["national_id"].strip()
        existing_nat = db.query(Guard).filter(Guard.national_id == new_nat, Guard.id != guard_id).first()
        if existing_nat:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Guard with National ID '{new_nat}' already exists."
            )
        update_data["national_id"] = new_nat

    if "full_name" in update_data and update_data["full_name"]:
        update_data["full_name"] = update_data["full_name"].strip()

    if "phone" in update_data and update_data["phone"]:
        valid_phone, norm_phone, phone_err = validate_kenyan_phone(update_data["phone"])
        if not valid_phone:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=phone_err or "Invalid Kenyan phone number."
            )
        phone_variants = kenyan_phone_variants(norm_phone)
        dup_guard_phone = db.query(Guard).filter(Guard.phone.in_(phone_variants), Guard.id != guard_id).first()
        if dup_guard_phone:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Another guard already uses phone number '{norm_phone}'."
            )
        update_data["phone"] = norm_phone

    if "site_id" in update_data:
        new_site_id = update_data.pop("site_id")
        if new_site_id is not None:
            target_site = db.query(Site).filter(Site.id == new_site_id).first()
            if not target_site:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned site not found")
            if "supervisor_id" not in update_data and not guard.supervisor_id and target_site.supervisor_id:
                update_data["supervisor_id"] = target_site.supervisor_id
        update_data["primary_site_id"] = new_site_id

    if "shift_id" in update_data and update_data["shift_id"] is not None:
        shift = db.query(Shift).filter(Shift.id == update_data["shift_id"]).first()
        if not shift:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned shift not found")

    if "supervisor_id" in update_data and update_data["supervisor_id"] is not None:
        _validate_supervisor_user(db, update_data["supervisor_id"])

    # Sync linked User account if email, phone, or full_name changed
    user_acc = db.query(User).filter(User.guard_id == guard.id).first()
    if user_acc:
        if "email" in update_data and update_data["email"]:
            new_email = update_data["email"].strip().lower()
            update_data["email"] = new_email
            dup_email = db.query(User).filter(func.lower(User.email) == new_email, User.id != user_acc.id).first()
            if dup_email:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Another user account already uses email '{new_email}'."
                )
            user_acc.email = new_email
        if "phone" in update_data and update_data["phone"]:
            new_phone = update_data["phone"]
            phone_variants = kenyan_phone_variants(new_phone)
            dup_phone = db.query(User).filter(User.phone.in_(phone_variants), User.id != user_acc.id).first()
            if dup_phone:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Another user account already uses phone '{new_phone}'."
                )
            user_acc.phone = new_phone
        if "full_name" in update_data and update_data["full_name"]:
            user_acc.full_name = update_data["full_name"]
        user_acc.updated_at = datetime.now()

    for key, value in update_data.items():
        setattr(guard, key, value)

    if "is_super_guard" in update_data:
        new_is_sg = bool(update_data["is_super_guard"])
        guard.is_super_guard = new_is_sg
        if not new_is_sg:
            db.query(Site).filter(Site.super_guard_id == guard.id).update(
                {Site.super_guard_id: None},
                synchronize_session=False
            )
        else:
            if guard.primary_site_id:
                target_site = db.query(Site).filter(Site.id == guard.primary_site_id).first()
                if target_site and (target_site.super_guard_id is None or target_site.super_guard_id == guard.id):
                    target_site.super_guard_id = guard.id

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

    guard = db.query(Guard).options(
        joinedload(Guard.site),
        joinedload(Guard.shift),
        joinedload(Guard.supervisor)
    ).filter(Guard.id == guard_id).first()

    return _format_guard_detail(guard)


@router.post("/{guard_id}/deactivate", response_model=GuardResponse)
def deactivate_guard(
    guard_id: int,
    payload: GuardDeactivateRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin_or_hr)
):
    """Deactivate a guard profile (Admin or HR)."""
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
        user_id=actor.id,
        user_name=actor.email,
        role=actor.role,
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
@router.post("/{guard_id}/activate", response_model=GuardResponse)
def reactivate_guard(
    guard_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin_or_hr)
):
    """Reactivate a previously deactivated guard profile (Admin or HR)."""
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
        user_id=actor.id,
        user_name=actor.email,
        role=actor.role,
        action="REACTIVATE_GUARD",
        target_entity="Guard",
        target_id=str(guard.id),
        reason=f"Administrative reactivation ({actor.role})"
    )
    db.add(audit_entry)
    db.commit()
    db.refresh(guard)

    return _format_guard(guard)



@router.post("/{guard_id}/remove-super-guard", response_model=GuardResponse)
def remove_super_guard_mandate(
    guard_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin_or_hr)
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
    admin: User = Depends(require_admin_or_hr)
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


@router.post("/{guard_id}/reset-password")
def reset_guard_password_to_phone(
    guard_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin_or_hr)
):
    """
    Admin or HR action: Reset a guard's password back to their registered normalized
    Kenyan phone number and require an immediate password change on next login.
    Never resets non-Guard accounts and never returns or logs plaintext passwords.
    """
    guard = db.query(Guard).filter(Guard.id == guard_id).first()
    if not guard:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Guard not found")

    valid_phone, norm_phone, phone_err = validate_kenyan_phone(guard.phone)
    if not valid_phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=phone_err or "Guard does not have a valid registered Kenyan phone number."
        )

    guard.phone = norm_phone
    guard.updated_at = datetime.now()

    user_acc = db.query(User).filter(User.guard_id == guard.id).first()
    if user_acc:
        if (user_acc.role or "").upper() != UserRole.GUARD.value:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot reset non-guard user credentials via guard password reset."
            )
        user_acc.phone = norm_phone
        user_acc.password_hash = get_password_hash(norm_phone)
        user_acc.must_change_password = True
        user_acc.updated_at = datetime.now()
    else:
        user_email = (guard.email or f"{guard.employee_number.lower()}@corpsec.co.ke").strip().lower()
        user_acc = User(
            full_name=guard.full_name,
            email=user_email,
            phone=norm_phone,
            password_hash=get_password_hash(norm_phone),
            role=UserRole.GUARD.value,
            status=UserStatus.ACTIVE.value if guard.status == "ACTIVE" else UserStatus.SUSPENDED.value,
            must_change_password=True,
            guard_id=guard.id,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        db.add(user_acc)

    audit_entry = AuditLog(
        user_id=actor.id,
        user_name=actor.email,
        role=actor.role,
        action="RESET_GUARD_PASSWORD",
        target_entity="Guard",
        target_id=str(guard.id),
        reason=f"Guard password reset to registered phone number by {actor.role} (password change required on next login)"
    )
    db.add(audit_entry)
    db.commit()

    return {
        "status": "SUCCESS",
        "guard_id": guard.id,
        "employee_number": guard.employee_number,
        "must_change_password": True,
        "message": "Guard password has been reset to their registered phone number. Guard must set a new password on next login."
    }


@router.post("/sync-phone-credentials")
def sync_guard_phone_credentials_endpoint(
    dry_run: bool = Query(False),
    db: Session = Depends(get_db),
    actor: User = Depends(require_admin)
):
    """Admin-only safe batch initialization/normalization of guard phone-number login credentials."""
    summary = initialize_guard_phone_credentials(db, dry_run=dry_run, overwrite_custom_passwords=False)
    return {"status": "SUCCESS", "dry_run": dry_run, "summary": summary}
