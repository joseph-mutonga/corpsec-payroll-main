from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class SupervisorReportReviewRequest(BaseModel):
    status: str = Field(..., description="Review status: REVIEWED, UNDER_REVIEW, ACTION_REQUIRED")
    admin_notes: Optional[str] = Field(None, description="System Admin feedback, action notes, or acknowledgment")


class SupervisorReportResponse(BaseModel):
    id: int
    reference_number: str
    supervisor_id: int
    supervisor_name: Optional[str] = None
    supervisor_email: Optional[str] = None
    supervisor_phone: Optional[str] = None
    site_id: Optional[int] = None
    site_name: Optional[str] = None
    title: str
    report_type: str
    report_date: date
    summary: Optional[str] = None
    recommendations: Optional[str] = None
    file_name: str
    file_size_bytes: Optional[int] = None
    mime_type: str
    status: str
    admin_notes: Optional[str] = None
    reviewed_by_id: Optional[int] = None
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
