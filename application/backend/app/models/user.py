import datetime
from enum import Enum as PyEnum
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from application.backend.app.core.database import Base


class UserRole(str, PyEnum):
    ADMIN = "ADMIN"
    SUPERVISOR = "SUPERVISOR"
    GUARD = "GUARD"


class UserStatus(str, PyEnum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    SUSPENDED = "SUSPENDED"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    phone = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    
    role = Column(String(255), default=UserRole.GUARD.value, nullable=False)
    status = Column(String(255), default=UserStatus.ACTIVE.value, nullable=False)
    
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=True)
    
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now, nullable=False)

    guard = relationship("Guard", back_populates="user_account", uselist=False)
