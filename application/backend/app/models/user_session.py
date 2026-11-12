import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float, ForeignKey, Text
from sqlalchemy.orm import relationship
from application.backend.app.core.database import Base


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    session_token = Column(String(255), nullable=True, index=True)
    
    # Login & Geolocation info
    login_time = Column(DateTime, default=datetime.datetime.now, nullable=False, index=True)
    last_activity = Column(DateTime, default=datetime.datetime.now, nullable=False, index=True)
    logout_time = Column(DateTime, nullable=True)
    
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    accuracy = Column(Float, nullable=True)
    location_name = Column(String(255), nullable=True)
    ip_address = Column(String(255), nullable=True)
    user_agent = Column(String(500), nullable=True)
    
    # Active duration tracking (in seconds)
    duration_seconds = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    user = relationship("User", backref="user_sessions")

