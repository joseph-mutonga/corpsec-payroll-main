import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship, foreign
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
    supervisor_id = Column(Integer, ForeignKey("users.id", use_alter=True, name="fk_sites_supervisor_id"), nullable=True)
    super_guard_id = Column(Integer, nullable=True)
    latitude = Column(Float, nullable=True, default=-1.286389)
    longitude = Column(Float, nullable=True, default=36.817223)
    geofence_radius = Column(Float, default=200.0, nullable=False)
    
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now, nullable=False)

    region = relationship("Region", back_populates="sites")
    guards = relationship("Guard", back_populates="site")
    supervisor = relationship("User", foreign_keys=[supervisor_id], backref="assigned_sites")

    @property
    def super_guard(self):
        if not self.super_guard_id:
            return None
        from application.backend.app.models.guard import Guard
        from sqlalchemy.orm import object_session
        s = object_session(self)
        if s:
            return s.query(Guard).filter(Guard.id == self.super_guard_id).first()
        return None

    @property
    def guard_count(self) -> int:
        return len([g for g in self.guards if getattr(g, "status", None) == "ACTIVE"]) if self.guards else 0
