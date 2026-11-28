"""
Safe guard credential initialization & phone normalization service.

Strictly scoped to GUARD role accounts (via Guard <-> User.guard_id):
- Normalizes Kenyan guard phone numbers (07XXXXXXXX / 01XXXXXXXX).
- Creates missing User accounts for Guard records.
- Sets initial password hash to the registered normalized phone number and sets
  must_change_password=True only when initializing a new account, upgrading a
  legacy factory default password, or when explicitly requested.
- Never modifies ADMIN, HR, SUPERVISOR, or STAFF credentials.
- Never overwrites a custom password already set by a guard during normal sync.
"""

from datetime import datetime
from typing import Any, Dict, List
from sqlalchemy.orm import Session

from application.backend.app.core.phone import kenyan_phone_variants, normalize_kenyan_phone
from application.backend.app.core.security import get_password_hash, verify_password
from application.backend.app.models.guard import Guard
from application.backend.app.models.user import User, UserRole, UserStatus

_LEGACY_FACTORY_PASSWORDS = ("Guard@123456", "password123", "guard", "guard123", "123456")


def _build_guard_email(guard: Guard, db: Session) -> str:
    candidate = (guard.email or "").strip().lower()
    if candidate and "@" in candidate:
        conflict = db.query(User).filter(User.email == candidate, User.guard_id != guard.id).first()
        if not conflict:
            return candidate
    base = f"{(guard.employee_number or f'guard{guard.id}').strip().lower()}@corpsec.co.ke"
    return base


def _uses_legacy_default(password_hash: str) -> bool:
    if not password_hash:
        return True
    for legacy_pw in _LEGACY_FACTORY_PASSWORDS:
        try:
            if verify_password(legacy_pw, password_hash):
                return True
        except Exception:
            continue
    return False


def initialize_guard_phone_credentials(
    db: Session,
    *,
    dry_run: bool = False,
    overwrite_custom_passwords: bool = False,
) -> Dict[str, Any]:
    """
    Safely initialize or normalize Guard Portal phone credentials for existing guards.
    Returns summary statistics without exposing any password values.
    """
    summary: Dict[str, Any] = {
        "total_guards_inspected": 0,
        "phones_normalized": 0,
        "users_created": 0,
        "passwords_initialized": 0,
        "skipped_custom_password": 0,
        "skipped_invalid_phone": [],
        "skipped_phone_conflicts": [],
    }

    guards: List[Guard] = db.query(Guard).order_by(Guard.id.asc()).all()
    for guard in guards:
        summary["total_guards_inspected"] += 1
        norm_phone = normalize_kenyan_phone(guard.phone)
        if not norm_phone:
            summary["skipped_invalid_phone"].append({
                "guard_id": guard.id,
                "employee_number": guard.employee_number,
            })
            continue

        # Check whether another guard already claims this normalized phone
        variants = kenyan_phone_variants(norm_phone)
        other_guard = (
            db.query(Guard)
            .filter(Guard.id != guard.id, Guard.phone.in_(variants))
            .first()
        )
        if other_guard:
            summary["skipped_phone_conflicts"].append({
                "guard_id": guard.id,
                "conflict_guard_id": other_guard.id,
            })
            continue

        if guard.phone != norm_phone:
            guard.phone = norm_phone
            guard.updated_at = datetime.now()
            summary["phones_normalized"] += 1

        user_acc = db.query(User).filter(User.guard_id == guard.id).first()

        if not user_acc:
            # Ensure no non-guard user holds this phone before creating account
            conflict_user = db.query(User).filter(User.phone.in_(variants)).first()
            if conflict_user and conflict_user.role != UserRole.GUARD.value:
                summary["skipped_phone_conflicts"].append({
                    "guard_id": guard.id,
                    "conflict_user_id": conflict_user.id,
                })
                continue

            if conflict_user and conflict_user.guard_id is None and conflict_user.role == UserRole.GUARD.value:
                user_acc = conflict_user
                user_acc.guard_id = guard.id
            else:
                new_user = User(
                    full_name=guard.full_name,
                    email=_build_guard_email(guard, db),
                    phone=norm_phone,
                    password_hash=get_password_hash(norm_phone),
                    role=UserRole.GUARD.value,
                    status=UserStatus.ACTIVE.value if guard.status == "ACTIVE" else UserStatus.SUSPENDED.value,
                    must_change_password=True,
                    guard_id=guard.id,
                    created_at=datetime.now(),
                    updated_at=datetime.now(),
                )
                db.add(new_user)
                summary["users_created"] += 1
                summary["passwords_initialized"] += 1
                continue

        # Safety boundary: never alter non-GUARD users
        if (user_acc.role or "").upper() != UserRole.GUARD.value:
            continue

        # Sync user phone if owned by this guard and not colliding
        conflict_phone_user = (
            db.query(User)
            .filter(User.id != user_acc.id, User.phone.in_(variants))
            .first()
        )
        if not conflict_phone_user and user_acc.phone != norm_phone:
            user_acc.phone = norm_phone

        already_phone_pw = False
        try:
            already_phone_pw = verify_password(norm_phone, user_acc.password_hash or "")
        except Exception:
            already_phone_pw = False

        if already_phone_pw:
            # Initial phone password already set; keep as-is without overwriting hash
            continue

        if overwrite_custom_passwords or _uses_legacy_default(user_acc.password_hash or ""):
            user_acc.password_hash = get_password_hash(norm_phone)
            user_acc.must_change_password = True
            user_acc.updated_at = datetime.now()
            summary["passwords_initialized"] += 1
        else:
            summary["skipped_custom_password"] += 1

    if dry_run:
        db.rollback()
    else:
        db.commit()
    return summary
