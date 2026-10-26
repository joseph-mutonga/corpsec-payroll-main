from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from application.backend.app.api.deps import get_db, get_current_user
from application.backend.app.core.security import verify_password, get_password_hash, create_access_token
from application.backend.app.core.limiter import limiter
from application.backend.app.models.user import User, UserStatus
from application.backend.app.models.guard import Guard
from application.backend.app.models.audit import AuditLog
from application.backend.app.schemas.auth import LoginRequest, GuardLoginRequest, ChangePasswordRequest, TokenResponse, UserResponse

router = APIRouter(prefix="/auth", tags=["Authentication & Access Control"])


@router.post(
    "/login",
    response_model=TokenResponse,
    responses={
        401: {"description": "Incorrect email or password"},
        429: {"description": "Too many login attempts - Rate limit exceeded"}
    }
)
@limiter.limit("5/15minutes")
def login_for_access_token(
    request: Request,
    payload: LoginRequest,
    db: Session = Depends(get_db)
):
    """Sign-in endpoint supporting Admin and Guard logins."""
    login_id = payload.email.strip()
    user = db.query(User).filter(User.email == login_id).first()
    
    if not user:
        # Flexible Guard lookup by email, employee number (e.g. cs00452@corpsec.co.ke or CS-00452), or phone
        emp_num = login_id
        if "@" in login_id:
            emp_num = login_id.split("@")[0].upper()
            if not emp_num.startswith("CS-") and emp_num.startswith("CS"):
                emp_num = "CS-" + emp_num[2:]
        
        guard = db.query(Guard).filter(
            (Guard.employee_number == emp_num) | 
            (Guard.employee_number == login_id.upper()) | 
            (Guard.email == login_id) | 
            (Guard.phone == login_id)
        ).first()
        if guard:
            user = db.query(User).filter(User.guard_id == guard.id).first()

    if not user or not verify_password(payload.password, user.password_hash):
        audit_entry = AuditLog(
            user_id=user.id if user else None,
            user_name=payload.email,
            role="UNKNOWN",
            action="LOGIN_FAILED",
            reason="Invalid credentials"
        )
        db.add(audit_entry)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if user.status != UserStatus.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is {user.status.lower()}. Please contact administrator."
        )

    user.last_login = datetime.now()
    
    audit_entry = AuditLog(
        user_id=user.id,
        user_name=user.email,
        role=user.role,
        action="LOGIN_SUCCESS",
        reason="User authenticated successfully"
    )
    db.add(audit_entry)
    db.commit()

    access_token = create_access_token(
        subject=user.id,
        role=user.role,
        data={"sub": str(user.id), "role": user.role, "email": user.email, "guard_id": user.guard_id}
    )
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        role=user.role,
        user_id=user.id,
        guard_id=user.guard_id,
        email=user.email
    )


@router.post(
    "/login/guard",
    response_model=TokenResponse,
    responses={
        401: {"description": "Incorrect Guard ID / Phone or Password"},
        429: {"description": "Too many login attempts - Rate limit exceeded"}
    }
)
@limiter.limit("5/15minutes")
def guard_login(
    request: Request,
    payload: GuardLoginRequest,
    db: Session = Depends(get_db)
):
    """Guard Mobile Portal Login endpoint matching Screen 19 (supports Employee Number or Phone)."""
    guard = db.query(Guard).filter(
        (Guard.employee_number == payload.guard_id) | (Guard.phone == payload.guard_id)
    ).first()

    user = None
    if guard:
        user = db.query(User).filter(User.guard_id == guard.id).first()

    if not user and "@" in payload.guard_id:
        user = db.query(User).filter(User.email == payload.guard_id).first()

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect Guard ID / Phone or Password"
        )

    if user.status != UserStatus.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Guard account is inactive"
        )

    user.last_login = datetime.now()
    db.commit()

    access_token = create_access_token(
        subject=user.id,
        role=user.role,
        data={"sub": str(user.id), "role": user.role, "email": user.email, "guard_id": user.guard_id}
    )
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        role=user.role,
        user_id=user.id,
        guard_id=user.guard_id,
        email=user.email
    )


@router.get("/me", response_model=UserResponse)
def read_current_user(current_user: User = Depends(get_current_user)):
    """Fetch current logged-in user profile."""
    return current_user


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Change current logged-in user password."""
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password incorrect"
        )
    current_user.password_hash = get_password_hash(payload.new_password)
    
    audit_entry = AuditLog(
        user_id=current_user.id,
        user_name=current_user.email,
        role=current_user.role,
        action="CHANGE_PASSWORD",
        reason="User updated password"
    )
    db.add(audit_entry)
    db.commit()
    return {"status": "SUCCESS", "message": "Password changed successfully"}
