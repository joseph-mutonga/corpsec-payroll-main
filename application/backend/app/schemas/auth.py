from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, ConfigDict, model_validator


class LoginRequest(BaseModel):
    email: str = Field(..., description="Email address, Guard Employee ID (e.g. CS-00452), or Phone Number")
    password: str = Field(..., min_length=1)
    remember_me: Optional[bool] = False
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[float] = None
    location_name: Optional[str] = None


class GuardLoginRequest(BaseModel):
    guard_id: str = Field(..., description="Guard ID (e.g. CS-00452) or Phone Number")
    password: str = Field(..., min_length=1)
    remember_me: Optional[bool] = False
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[float] = None
    location_name: Optional[str] = None


class HeartbeatRequest(BaseModel):
    session_id: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[float] = None
    location_name: Optional[str] = None
    active_seconds: Optional[int] = None
    location_name: Optional[str] = None


class SessionLocationUpdateRequest(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    location_name: Optional[str] = None


class Token(BaseModel):
    access_token: Optional[str] = None
    token_type: str = "bearer"
    role: Optional[str] = "ADMIN"
    user_id: Optional[int] = None
    guard_id: Optional[int] = None
    email: Optional[str] = None
    full_name: Optional[str] = None
    session_id: Optional[int] = None
    otp_required: bool = False
    must_change_password: bool = False
    message: Optional[str] = None


TokenResponse = Token


class OTPVerifyRequest(BaseModel):
    email: str = Field(..., description="Email address or user identifier")
    otp_code: str = Field(..., min_length=6, max_length=6, description="6-digit numeric OTP verification code")
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[float] = None
    location_name: Optional[str] = None


class OTPResendRequest(BaseModel):
    email: str = Field(..., description="User's registered email address")


class TokenData(BaseModel):
    user_id: Optional[int] = None
    role: Optional[str] = None


class UserResponse(BaseModel):
    id: int
    full_name: Optional[str] = None
    email: str
    phone: Optional[str] = None
    role: str
    status: str
    must_change_password: bool = False
    guard_id: Optional[int] = None
    last_login: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6)


class SetNewPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=6)
    confirm_password: str = Field(..., min_length=6)

    @model_validator(mode="after")
    def validate_passwords_match(self):
        if self.new_password != self.confirm_password:
            raise ValueError("Passwords do not match. Please enter the same password in both fields.")
        return self


class ForgotPasswordRequest(BaseModel):
    username: Optional[str] = Field(
        None,
        description="Username, email address, Guard Employee ID (e.g. CS-00452), phone number, or full name"
    )
    email: Optional[str] = Field(
        None,
        description="Optional alias for username/email lookup"
    )

    @model_validator(mode="after")
    def validate_identifier(self):
        ident = (self.username or self.email or "").strip()
        if not ident:
            raise ValueError("Please enter your username, email address, phone number, or Guard ID.")
        self.username = ident
        return self


class ForgotPasswordResponse(BaseModel):
    status: str
    message: str
    masked_email: Optional[str] = None
    role: Optional[str] = None
