from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class ShiftCreate(BaseModel):
    name: str = Field(..., min_length=2)
    shift_type: str = Field(..., description="DAY, NIGHT, or SPLIT")
    start_time: str = Field(..., description="e.g. 06:00")
    end_time: str = Field(..., description="e.g. 18:00")
    is_night_shift: bool = False
    duration_hours: float = 12.0


class ShiftResponse(BaseModel):
    id: int
    name: str
    shift_type: str
    start_time: str
    end_time: str
    is_night_shift: bool = False
    duration_hours: float = 12.0
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
