from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class OffDayAllowanceCreate(BaseModel):
    guard_id: int
    year: int
    month: int = Field(..., ge=1, le=12)
    days_allowed: int = Field(..., ge=0)


class OffDayAllowanceResponse(BaseModel):
    id: int
    guard_id: int
    year: int
    month: int
    days_allowed: int
    set_by_user_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OffDayRequestCreate(BaseModel):
    start_date: date
    end_date: date


class RelieverAssignmentItem(BaseModel):
    reliever_guard_id: int
    shift_date: date
    shift_id: int
    site_id: int


class OffDayRequestApprovePayload(BaseModel):
    reliever_assignments: List[RelieverAssignmentItem] = Field(..., min_length=1)


class OffDayRequestRejectPayload(BaseModel):
    reason: str = Field(..., min_length=3)


class RelieverAssignmentResponse(BaseModel):
    id: int
    off_day_request_id: int
    reliever_guard_id: int
    reliever_guard_name: Optional[str] = None
    covering_for_guard_id: int
    covering_for_guard_name: Optional[str] = None
    site_id: int
    site_name: Optional[str] = None
    shift_id: int
    shift_name: Optional[str] = None
    shift_date: date

    model_config = ConfigDict(from_attributes=True)


class OffDayRequestResponse(BaseModel):
    id: int
    guard_id: int
    guard_name: Optional[str] = None
    start_date: date
    end_date: date
    days_count: int
    status: str
    rejection_reason: Optional[str] = None
    requested_at: datetime
    reviewed_at: Optional[datetime] = None
    reliever_assignments: List[RelieverAssignmentResponse] = []

    model_config = ConfigDict(from_attributes=True)
