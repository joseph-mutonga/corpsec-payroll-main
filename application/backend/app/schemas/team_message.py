from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class TeamMessageCreate(BaseModel):
    message: Optional[str] = Field("", max_length=5000, description="Chat message text or optional caption")
    receiver_id: Optional[int] = Field(None, description="Optional target user ID for 1-on-1 direct message")
    channel: Optional[str] = Field("all", description="Channel / thread identifier")
    attachment_url: Optional[str] = Field(None, max_length=500, description="Uploaded file URL")
    attachment_name: Optional[str] = Field(None, max_length=255, description="Original attachment file name")
    attachment_type: Optional[str] = Field(None, max_length=100, description="MIME type or file category")
    attachment_size: Optional[int] = Field(None, description="Attachment file size in bytes")


class TeamMessageResponse(BaseModel):
    id: int
    user_id: int
    receiver_id: Optional[int] = None
    channel: str = "all"
    sender_name: str
    sender_role: str
    message: str
    attachment_url: Optional[str] = None
    attachment_name: Optional[str] = None
    attachment_type: Optional[str] = None
    attachment_size: Optional[int] = None
    is_read: bool = False
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ChatAttachmentUploadResponse(BaseModel):
    status: str = "success"
    file_url: str
    file_name: str
    file_type: str
    file_size: int


class ChatContactResponse(BaseModel):
    user_id: int
    full_name: str
    email: str
    role: str
    last_message: Optional[str] = None
    last_message_time: Optional[datetime] = None
    unread_count: int = 0


class MarkReadRequest(BaseModel):
    contact_id: str = Field(..., description="'group_operations' or 'dm_<user_id>'")
    user_id: Optional[int] = Field(None, description="Optional target user ID if direct message")
