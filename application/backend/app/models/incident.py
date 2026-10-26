import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Date, Text
from sqlalchemy.orm import relationship
from application.backend.app.core.database import Base


class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, index=True)
    reference_number = Column(String(255), unique=True, index=True, nullable=False)
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False, index=True)
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=False)
    
    incident_type = Column(String(255), nullable=False)
    incident_date = Column(Date, nullable=False)
    incident_time = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    photo_path = Column(String(255), nullable=True)
    
    status = Column(String(255), default="OPEN", nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    
    guard = relationship("Guard", backref="incidents")
    site = relationship("Site")
