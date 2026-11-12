from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class AnonymousMessageCreate(BaseModel):
    """
    Schema for inbound anonymous tip submissions.
    Strictly accepts only message content - no sender identity or metadata allowed.
    """
    message: str = Field(..., min_length=5, max_length=5000, description="Raw anonymous message text")


class AnonymousMessageResponse(BaseModel):
    """
    Schema for System Admin reading anonymous submissions.
    Contains strictly the ID, raw message text, and submission timestamp.
    """
    id: int
    message: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
