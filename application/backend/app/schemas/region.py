from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class RegionCreate(BaseModel):
    name: str = Field(..., min_length=2, description="Region name (e.g. Coast, Rift Valley)")


class RegionResponse(BaseModel):
    id: int
    name: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
