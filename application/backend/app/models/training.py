import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Date
from sqlalchemy.orm import relationship
from application.backend.app.core.database import Base


class TrainingRecord(Base):
    __tablename__ = "training_records"

    id = Column(Integer, primary_key=True, index=True)
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False, index=True)
    
    course_name = Column(String(255), nullable=False)
    completion_date = Column(Date, nullable=False)
    expiry_date = Column(Date, nullable=True)
    certificate_path = Column(String(255), nullable=True)
    
    status = Column(String(255), default="VALID", nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    
    guard = relationship("Guard", backref="training_records")
