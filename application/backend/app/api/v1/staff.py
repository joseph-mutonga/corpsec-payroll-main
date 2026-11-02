from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, EmailStr
from sqlalchemy.orm import Session

from application.backend.app.api.deps import get_db, require_admin
from application.backend.app.core.security import get_password_hash
from application.backend.app.models.user import User, UserRole, UserStatus
from application.backend.app.models.audit import AuditLog

router = APIRouter(prefix="/staff", tags=["Staff & HR Management"])


class StaffCreateRequest(BaseModel):
    full_name: str
    email: EmailStr
    phone: str
    role: str  # HR, SUPERVISOR, ADMIN
    password: Optional[str] = None


class StaffStatusUpdateRequest(BaseModel):
    status: str  # ACTIVE, SUSPENDED


class StaffResponse(BaseModel):
    id: int
    full_name: Optional[str] = None
    email: str
    phone: str
    role: str
    status: str
    last_login: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


@router.get("", response_model=List[StaffResponse])
def list_staff_members(
    role_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """List all corporate staff members (HR, Supervisors, Administrators)."""
    staff_roles = [UserRole.ADMIN.value, UserRole.HR.value, UserRole.SUPERVISOR.value]
    query = db.query(User).filter(User.role.in_(staff_roles))

    if role_filter:
        rf = role_filter.upper().strip()
        if rf in staff_roles:
            query = query.filter(User.role == rf)

    return query.order_by(User.id.desc()).all()


@router.post("", response_model=StaffResponse, status_code=status.HTTP_201_CREATED)
def create_staff_member(
    payload: StaffCreateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """System Admin creates a new corporate staff member, including HR Officers and Supervisors."""
    allowed_roles = [UserRole.ADMIN.value, UserRole.HR.value, UserRole.SUPERVISOR.value]
    target_role = payload.role.upper().strip()
    if target_role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid staff role '{payload.role}'. Must be one of: {', '.join(allowed_roles)}."
        )

    clean_email = payload.email.strip().lower()
    clean_phone = payload.phone.strip()

    if db.query(User).filter(User.email == clean_email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A user account with email '{clean_email}' already exists."
        )

    if db.query(User).filter(User.phone == clean_phone).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A user account with phone number '{clean_phone}' already exists."
        )

    raw_password = payload.password.strip() if payload.password and payload.password.strip() else "password123"

    new_staff = User(
        full_name=payload.full_name.strip(),
        email=clean_email,
        phone=clean_phone,
        password_hash=get_password_hash(raw_password),
        role=target_role,
        status=UserStatus.ACTIVE.value,
        guard_id=None,
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(new_staff)

    audit = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="CREATE_STAFF_MEMBER",
        target_entity="User",
        target_id=clean_email,
        reason=f"Created {target_role} staff account for {payload.full_name} ({clean_email})"
    )
    db.add(audit)
    db.commit()
    db.refresh(new_staff)

    return new_staff


@router.patch("/{user_id}/status", response_model=StaffResponse)
def update_staff_status(
    user_id: int,
    payload: StaffStatusUpdateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Suspend or reactivate a staff member account."""
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot change your own account status."
        )

    staff_user = db.query(User).filter(User.id == user_id).first()
    if not staff_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff account not found.")

    new_st = payload.status.upper().strip()
    if new_st not in [UserStatus.ACTIVE.value, UserStatus.SUSPENDED.value, UserStatus.INACTIVE.value]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status value.")

    staff_user.status = new_st
    staff_user.updated_at = datetime.now()

    audit = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="UPDATE_STAFF_STATUS",
        target_entity="User",
        target_id=staff_user.email,
        reason=f"Changed status of staff {staff_user.email} to {new_st}"
    )
    db.add(audit)
    db.commit()
    db.refresh(staff_user)
    return staff_user


@router.delete("/{user_id}", status_code=status.HTTP_200_OK)
def delete_staff_member(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Permanently delete a corporate staff account."""
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account."
        )

    staff_user = db.query(User).filter(User.id == user_id).first()
    if not staff_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff account not found.")

    target_email = staff_user.email
    target_role = staff_user.role

    db.delete(staff_user)

    audit = AuditLog(
        user_id=admin.id,
        user_name=admin.email,
        role=admin.role,
        action="DELETE_STAFF_MEMBER",
        target_entity="User",
        target_id=target_email,
        reason=f"Deleted {target_role} staff account {target_email}"
    )
    db.add(audit)
    db.commit()

    return {"message": f"Staff account {target_email} ({target_role}) successfully removed."}

