import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Date, Text
from sqlalchemy.orm import relationship
from application.backend.app.core.database import Base


class Benefit(Base):
    __tablename__ = "benefits"

    id = Column(Integer, primary_key=True, index=True)
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False, index=True)
    
    benefit_type = Column(String(255), nullable=False)
    amount = Column(Float, nullable=False)
    effective_date = Column(Date, nullable=False)
    
    previous_value = Column(Float, nullable=True)
    new_value = Column(Float, nullable=False)
    reason = Column(Text, nullable=False)
    updated_by = Column(String(255), nullable=False)
    
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    
    guard = relationship("Guard", backref="benefits")
