import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from application.backend.app.core.database import Base


class PhoneNumber(Base):
    """
    Virtual and Direct Inward Dialing (DID) Phone Numbers configured in the Call Centre.
    """
    __tablename__ = "phone_numbers"

    id = Column(Integer, primary_key=True, index=True)
    phone_number = Column(String(50), unique=True, index=True, nullable=False)
    friendly_name = Column(String(100), nullable=False)
    provider = Column(String(50), default="Twilio", nullable=False)  # Twilio, Africa's Talking, SIP
    assigned_queue_id = Column(Integer, ForeignKey("call_queues.id", ondelete="SET NULL"), nullable=True)
    assigned_agent_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    record_calls = Column(Boolean, default=True, nullable=False)
    voicemail_enabled = Column(Boolean, default=True, nullable=False)
    ivr_greeting = Column(Text, nullable=True)
    status = Column(String(20), default="ACTIVE", nullable=False)  # ACTIVE, INACTIVE, SUSPENDED

    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now, nullable=False)

    queue = relationship("CallQueue", back_populates="phone_numbers", foreign_keys=[assigned_queue_id])
    agent = relationship("User", foreign_keys=[assigned_agent_id])


class CallQueue(Base):
    """
    Inbound ACD Call Queues (e.g. Emergency Guard Dispatch, General Inquiries).
    """
    __tablename__ = "call_queues"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)
    strategy = Column(String(50), default="ROUND_ROBIN", nullable=False)  # ROUND_ROBIN, LONGEST_IDLE, RING_ALL
    max_wait_time_seconds = Column(Integer, default=300, nullable=False)
    wrap_up_time_seconds = Column(Integer, default=30, nullable=False)
    hold_music_url = Column(String(255), default="/static/audio/hold_music.mp3", nullable=True)
    welcome_greeting = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now, nullable=False)

    phone_numbers = relationship("PhoneNumber", back_populates="queue")
    members = relationship("QueueMember", back_populates="queue", cascade="all, delete-orphan")
    calls = relationship("CallLog", back_populates="queue")


class QueueMember(Base):
    """
    Agents mapped to specific call queues.
    """
    __tablename__ = "queue_members"

    id = Column(Integer, primary_key=True, index=True)
    queue_id = Column(Integer, ForeignKey("call_queues.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    priority = Column(Integer, default=1, nullable=False)
    calls_handled = Column(Integer, default=0, nullable=False)
    is_paused = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)

    queue = relationship("CallQueue", back_populates="members")
    user = relationship("User")


class AgentStatus(Base):
    """
    Live real-time state of an agent (Available, On Call, Break, Offline).
    """
    __tablename__ = "agent_statuses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    status = Column(String(30), default="OFFLINE", nullable=False)  # AVAILABLE, ON_CALL, BREAK, OFFLINE
    current_call_id = Column(Integer, nullable=True)
    last_status_change = Column(DateTime, default=datetime.datetime.now, nullable=False)
    calls_taken_today = Column(Integer, default=0, nullable=False)
    total_talk_time_seconds = Column(Integer, default=0, nullable=False)
    device_channel = Column(String(50), default="WebRTC", nullable=False)

    user = relationship("User")


class CallLog(Base):
    """
    Complete chronological CDR (Call Detail Record) for every inbound, outbound, and missed call.
    """
    __tablename__ = "call_logs"

    id = Column(Integer, primary_key=True, index=True)
    call_sid = Column(String(100), unique=True, index=True, nullable=False)
    direction = Column(String(20), default="INBOUND", nullable=False)  # INBOUND, OUTBOUND
    caller_number = Column(String(50), index=True, nullable=False)
    caller_name = Column(String(100), nullable=True)
    recipient_number = Column(String(50), index=True, nullable=False)
    queue_id = Column(Integer, ForeignKey("call_queues.id", ondelete="SET NULL"), nullable=True)
    agent_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(30), default="QUEUED", nullable=False)  # QUEUED, RINGING, IN_PROGRESS, COMPLETED, MISSED, VOICEMAIL, REJECTED
    duration_seconds = Column(Integer, default=0, nullable=False)
    wait_time_seconds = Column(Integer, default=0, nullable=False)
    recording_url = Column(String(255), nullable=True)
    voicemail_url = Column(String(255), nullable=True)
    disposition = Column(String(50), nullable=True)  # Resolved, Follow-up Required, Guard Dispatched, Spam, Transferred
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.datetime.now, index=True, nullable=False)
    ended_at = Column(DateTime, nullable=True)

    queue = relationship("CallQueue", back_populates="calls")
    agent = relationship("User")
    call_notes = relationship("CallNote", back_populates="call", cascade="all, delete-orphan")


class CallNote(Base):
    """
    Individual notes logged against a call session by agents.
    """
    __tablename__ = "call_notes"

    id = Column(Integer, primary_key=True, index=True)
    call_id = Column(Integer, ForeignKey("call_logs.id", ondelete="CASCADE"), nullable=False)
    agent_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    note = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)

    call = relationship("CallLog", back_populates="call_notes")
    agent = relationship("User")


class CallerContact(Base):
    """
    Caller CRM profile linking numbers to client names, VIP tier, and history.
    """
    __tablename__ = "caller_contacts"

    id = Column(Integer, primary_key=True, index=True)
    phone_number = Column(String(50), unique=True, index=True, nullable=False)
    full_name = Column(String(100), nullable=False)
    company_or_site = Column(String(100), nullable=True)
    email = Column(String(100), nullable=True)
    vip_level = Column(String(20), default="STANDARD", nullable=False)  # STANDARD, VIP, EMERGENCY
    notes = Column(Text, nullable=True)
    total_calls = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now, nullable=False)

