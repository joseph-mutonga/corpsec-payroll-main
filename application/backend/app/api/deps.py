from typing import Generator, Optional
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from application.backend.app.core.database import SessionLocal
from application.backend.app.core.security import decode_access_token
from application.backend.app.models.user import User, UserRole, UserStatus

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    db: Session = Depends(get_db),
    token: Optional[str] = Depends(oauth2_scheme),
    token_query: Optional[str] = Query(None, alias="token")
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    effective_token = token or token_query
    if not effective_token:
        raise credentials_exception

    payload = decode_access_token(effective_token)
    if payload is None:
        raise credentials_exception

    user_id: str = payload.get("sub")
    if user_id is None:
        raise credentials_exception

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception

    if user.status != UserStatus.ACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive or locked account"
        )

    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative privileges required"
        )
    return current_user


def require_guard(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.GUARD.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Guard role required. Administrators must use the Admin Web App."
        )
    return current_user


def require_supervisor(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in [UserRole.SUPERVISOR.value, UserRole.ADMIN.value]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Supervisor or Admin role required."
        )
    return current_user


def require_admin_or_supervisor(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in [UserRole.ADMIN.value, UserRole.HR.value, UserRole.SUPERVISOR.value]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin, HR or Supervisor privileges required."
        )
    return current_user


def require_admin_or_hr(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in [UserRole.ADMIN.value, UserRole.HR.value]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrative privileges required (Admin or HR)."
        )
    return current_user


def authorizeRoles(*allowed_roles: str):
    """
    Role-Based Access Control (RBAC) dependency factory.
    Explicitly checks user role against permitted roles.
    Throws strict HTTP 403 Forbidden with clean JSON response if unauthorized.

    Supported Roles:
    - "System Admin" (ADMIN)
    - "HR" (HR)
    - "Supervisor" (SUPERVISOR)
    - "Staff" (STAFF)
    - "Guard" (GUARD)
    """
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        role_map = {
            "System Admin": "ADMIN",
            "ADMIN": "ADMIN",
            "HR": "HR",
            "Supervisor": "SUPERVISOR",
            "SUPERVISOR": "SUPERVISOR",
            "Staff": "STAFF",
            "STAFF": "STAFF",
            "Guard": "GUARD",
            "GUARD": "GUARD",
        }
        user_role_raw = (current_user.role or "").strip()
        normalized_user_role = role_map.get(user_role_raw, user_role_raw.upper())
        normalized_allowed = [role_map.get(r, r.upper()) for r in allowed_roles]

        if normalized_user_role not in normalized_allowed:
            if normalized_user_role == "GUARD":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: Guard role is not authorized to access chart analytics or administrative tools."
                )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Required role ({', '.join(allowed_roles)}) not possessed."
            )
        return current_user
    return role_checker


# Explicit RBAC dependencies for compliance & static analysis scanners:
authorize_chart_analytics = authorizeRoles("System Admin", "HR", "Supervisor", "Staff")
require_system_admin = authorizeRoles("System Admin")
require_guard_role = authorizeRoles("Guard")

