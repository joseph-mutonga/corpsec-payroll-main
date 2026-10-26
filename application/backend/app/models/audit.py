import datetime
from sqlalchemy import Column, Integer, String, DateTime, Text
from application.backend.app.core.database import Base


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.now, nullable=False, index=True)
    
    user_id = Column(Integer, nullable=True)
    user_name = Column(String(255), nullable=False)
    role = Column(String(255), nullable=False)
    
    action = Column(String(255), nullable=False, index=True)
    target_entity = Column(String(255), nullable=True)
    target_id = Column(String(255), nullable=True)
    
    old_values = Column(Text, nullable=True)
    new_values = Column(Text, nullable=True)
    reason = Column(Text, nullable=True)
    ip_address = Column(String(255), nullable=True)
