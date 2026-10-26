import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from application.backend.app.core.database import Base


class Shift(Base):
    __tablename__ = "shifts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    shift_type = Column(String(255), nullable=False)
    start_time = Column(String(255), nullable=False)
    end_time = Column(String(255), nullable=False)
    is_night_shift = Column(Boolean, default=False, nullable=False)
    
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)

    guards = relationship("Guard", back_populates="shift")

    @property
    def duration_hours(self) -> float:
        """Calculate dynamic shift duration in hours."""
        try:
            start_parts = [int(p) for p in self.start_time.split(":")]
            end_parts = [int(p) for p in self.end_time.split(":")]
            start_mins = start_parts[0] * 60 + start_parts[1]
            end_mins = end_parts[0] * 60 + end_parts[1]
            if end_mins <= start_mins:
                end_mins += 24 * 60
            return round((end_mins - start_mins) / 60.0, 2)
        except Exception:
            return 12.0

    @duration_hours.setter
    def duration_hours(self, value):
        pass
