from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel


# Phone Numbers
class PhoneNumberBase(BaseModel):
    phone_number: str
    friendly_name: str
    provider: Optional[str] = "Twilio"
    assigned_queue_id: Optional[int] = None
    assigned_agent_id: Optional[int] = None
    record_calls: bool = True
    voicemail_enabled: bool = True
    ivr_greeting: Optional[str] = None
    status: str = "ACTIVE"

class PhoneNumberCreate(PhoneNumberBase):
    pass

class PhoneNumberUpdate(BaseModel):
    friendly_name: Optional[str] = None
    provider: Optional[str] = None
    assigned_queue_id: Optional[int] = None
    assigned_agent_id: Optional[int] = None
    record_calls: Optional[bool] = None
    voicemail_enabled: Optional[bool] = None
    ivr_greeting: Optional[str] = None
    status: Optional[str] = None

class PhoneNumberResponse(PhoneNumberBase):
    id: int
    queue_name: Optional[str] = None
    agent_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Call Queues
class CallQueueBase(BaseModel):
    name: str
    description: Optional[str] = None
    strategy: str = "ROUND_ROBIN"
    max_wait_time_seconds: int = 300
    wrap_up_time_seconds: int = 30
    hold_music_url: Optional[str] = "/static/audio/hold_music.mp3"
    welcome_greeting: Optional[str] = None
    is_active: bool = True

class CallQueueCreate(CallQueueBase):
    pass

class CallQueueUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    strategy: Optional[str] = None
    max_wait_time_seconds: Optional[int] = None
    wrap_up_time_seconds: Optional[int] = None
    hold_music_url: Optional[str] = None
    welcome_greeting: Optional[str] = None
    is_active: Optional[bool] = None

class QueueMemberResponse(BaseModel):
    id: int
    queue_id: int
    user_id: int
    agent_name: str
    agent_email: str
    agent_role: str
    priority: int
    calls_handled: int
    is_paused: bool
    status: str = "OFFLINE"

    class Config:
        from_attributes = True

class CallQueueResponse(CallQueueBase):
    id: int
    active_callers_count: int = 0
    waiting_callers_count: int = 0
    avg_wait_time_seconds: int = 0
    members: List[QueueMemberResponse] = []
    created_at: datetime

    class Config:
        from_attributes = True


# Agent Status
class AgentStatusUpdate(BaseModel):
    status: str  # AVAILABLE, ON_CALL, BREAK, OFFLINE
    device_channel: Optional[str] = "WebRTC"

class AgentStatusResponse(BaseModel):
    user_id: int
    full_name: str
    email: str
    role: str
    status: str
    current_call_id: Optional[int] = None
    last_status_change: datetime
    calls_taken_today: int
    total_talk_time_seconds: int
    device_channel: str

    class Config:
        from_attributes = True


# Call Notes
class CallNoteCreate(BaseModel):
    note: str

class CallNoteResponse(BaseModel):
    id: int
    call_id: int
    agent_id: int
    agent_name: str
    note: str
    created_at: datetime

    class Config:
        from_attributes = True


# Call Logs
class CallLogResponse(BaseModel):
    id: int
    call_sid: str
    direction: str
    caller_number: str
    caller_name: Optional[str] = None
    recipient_number: str
    queue_id: Optional[int] = None
    queue_name: Optional[str] = None
    agent_id: Optional[int] = None
    agent_name: Optional[str] = None
    status: str
    duration_seconds: int
    wait_time_seconds: int
    recording_url: Optional[str] = None
    voicemail_url: Optional[str] = None
    disposition: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    ended_at: Optional[datetime] = None
    call_notes: List[CallNoteResponse] = []

    class Config:
        from_attributes = True


# Caller Contacts
class CallerContactBase(BaseModel):
    phone_number: str
    full_name: str
    company_or_site: Optional[str] = None
    email: Optional[str] = None
    vip_level: str = "STANDARD"
    notes: Optional[str] = None

class CallerContactCreate(CallerContactBase):
    pass

class CallerContactUpdate(BaseModel):
    full_name: Optional[str] = None
    company_or_site: Optional[str] = None
    email: Optional[str] = None
    vip_level: Optional[str] = None
    notes: Optional[str] = None

class CallerContactResponse(CallerContactBase):
    id: int
    total_calls: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# Actions & Softphone Payloads
class DialRequest(BaseModel):
    destination_number: str
    caller_id_number: Optional[str] = None

class CallActionRequest(BaseModel):
    notes: Optional[str] = None
    disposition: Optional[str] = None

class TransferRequest(BaseModel):
    target_type: str  # "AGENT" or "QUEUE"
    target_id: int
    notes: Optional[str] = None

class SimulateCallRequest(BaseModel):
    caller_number: str = "+254 712 999 888"
    caller_name: Optional[str] = "VIP Client (Simulation)"
    queue_id: Optional[int] = None


# Overview & KPIs
class CallCenterOverviewResponse(BaseModel):
    total_calls_today: int
    inbound_today: int
    outbound_today: int
    missed_today: int
    missed_calls_today: Optional[int] = 0
    active_calls_count: int
    waiting_in_queue_count: int
    avg_wait_time_seconds: int
    average_wait_time_seconds: Optional[int] = 0
    avg_duration_seconds: int
    active_agents_count: int
    available_agents_count: int
    active_agents_available: Optional[int] = 0
    virtual_numbers_count: Optional[int] = 0
    active_queues_count: Optional[int] = 0
    on_call_agents_count: int
    recent_calls: List[CallLogResponse]
    active_queues: List[CallQueueResponse]

