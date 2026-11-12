import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from application.backend.app.core.database import Base


class EmailOTP(Base):
    """
    Model for storing temporary Role-Based One-Time Passwords (OTP).
    Strictly generated via CSPRNG with 5-minute lifespan and one-time use flags.
    """
    __tablename__ = "email_otps"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)
    otp_code = Column(String(6), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Boolean, default=False, nullable=False)
    attempts = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)

    user = relationship("User", backref="email_otps")

    def is_expired(self) -> bool:
        """Check if OTP has expired."""
        return datetime.datetime.now() > self.expires_at

    def is_valid(self) -> bool:
        """Check if OTP is valid for use."""
        return not self.is_used and not self.is_expired() and self.attempts < 5

