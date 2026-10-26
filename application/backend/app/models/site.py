import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from application.backend.app.core.database import Base


class Site(Base):
    __tablename__ = "sites"

    id = Column(Integer, primary_key=True, index=True)
    site_name = Column(String(255), unique=True, index=True, nullable=False)
    location = Column(String(255), nullable=False)
    client_name = Column(String(255), nullable=False)
    
    region_id = Column(Integer, ForeignKey("regions.id"), nullable=True)
    basic_salary = Column(Float, nullable=False, default=15000.0)
    daily_rate = Column(Float, nullable=False, default=1200.0)
    night_allowance = Column(Float, default=200.0, nullable=False)
    transport_allowance = Column(Float, default=100.0, nullable=False)
    housing_allowance = Column(Float, default=150.0, nullable=False)
    
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now, nullable=False)

    region = relationship("Region", back_populates="sites")
    guards = relationship("Guard", back_populates="site")

    @property
    def guard_count(self) -> int:
        return len([g for g in self.guards if getattr(g, "status", None) == "ACTIVE"]) if self.guards else 0
