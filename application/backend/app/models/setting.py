import datetime
from sqlalchemy import Column, String, Text, DateTime
from application.backend.app.core.database import Base


class Setting(Base):
    __tablename__ = "settings"

    key = Column(String(255), primary_key=True, index=True)
    value = Column(Text, nullable=False)
    description = Column(String(255), nullable=True)
    updated_by = Column(String(255), nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now, nullable=False)
