from typing import Optional
from pydantic import BaseModel, EmailStr, Field, ConfigDict


class LoginRequest(BaseModel):
    email: str = Field(..., description="Email address, Guard Employee ID (e.g. CS-00452), or Phone Number")
    password: str = Field(..., min_length=1)
    remember_me: Optional[bool] = False


class GuardLoginRequest(BaseModel):
    guard_id: str = Field(..., description="Guard ID (e.g. CS-00452) or Phone Number")
    password: str = Field(..., min_length=1)
    remember_me: Optional[bool] = False


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: Optional[str] = "ADMIN"
    user_id: Optional[int] = None
    guard_id: Optional[int] = None
    email: Optional[str] = None


TokenResponse = Token


class TokenData(BaseModel):
    user_id: Optional[int] = None
    role: Optional[str] = None


class UserResponse(BaseModel):
    id: int
    email: str
    phone: Optional[str] = None
    role: str
    status: str
    guard_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6)
