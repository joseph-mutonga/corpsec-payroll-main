from datetime import date, datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, ConfigDict


class RosterPatternCreate(BaseModel):
    guard_id: int
    site_id: int
    shift_id: int
    days_of_week: List[int]  # [0, 1, 2, 3, 4] for Mon-Fri
    start_date: date
    end_date: Optional[date] = None


class RosterPatternResponse(BaseModel):
    id: int
    guard_id: int
    site_id: int
    shift_id: int
    days_of_week: str
    start_date: date
    end_date: Optional[date] = None
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RosterOverrideCreate(BaseModel):
    guard_id: int
    site_id: Optional[int] = None  # None indicates Day Off
    shift_id: Optional[int] = None # None indicates Day Off
    shift_date: date
    notes: Optional[str] = None


class RosterAssignmentResponse(BaseModel):
    id: int
    guard_id: int
    employee_number: str
    guard_name: str
    site_id: Optional[int] = None
    site_name: Optional[str] = None
    shift_id: Optional[int] = None
    shift_name: Optional[str] = None
    shift_date: date
    is_override: bool
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class RosterGridCell(BaseModel):
    date: str  # YYYY-MM-DD
    assignment_id: Optional[int] = None
    site_id: Optional[int] = None
    site_name: Optional[str] = None
    shift_id: Optional[int] = None
    shift_name: Optional[str] = None
    is_night_shift: bool = False
    is_override: bool = False
    is_off: bool = True
    is_leave: bool = False
    duration_hours: Optional[float] = None


class RosterGridRow(BaseModel):
    guard_id: int
    employee_number: str
    full_name: str
    cells: Dict[str, RosterGridCell]  # date_str -> RosterGridCell


class RosterGridResponse(BaseModel):
    year: int
    month: int
    days_in_month: int
    start_date: str
    end_date: str
    rows: List[RosterGridRow]
