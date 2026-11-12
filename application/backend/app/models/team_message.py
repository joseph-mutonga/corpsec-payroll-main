import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from application.backend.app.core.database import Base


class TeamMessage(Base):
    """
    Internal Team Discussion & Operations Chat.
    Enables System Admin, HR, Staff, and Supervisors to communicate,
    collaborate on operational directives, and discuss chart insights.
    Supports both Group Operations chat and 1-on-1 direct messaging,
    with read/unread status tracking.
    """
    __tablename__ = "team_messages"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    channel = Column(String(255), default="all", nullable=False)
    sender_name = Column(String(255), nullable=False)
    sender_role = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    attachment_url = Column(String(500), nullable=True)
    attachment_name = Column(String(255), nullable=True)
    attachment_type = Column(String(100), nullable=True)
    attachment_size = Column(Integer, nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)

    user = relationship("User", foreign_keys=[user_id])
    receiver = relationship("User", foreign_keys=[receiver_id])


class TeamChatRead(Base):
    """
    Tracks last-read message per user per channel (for group broadcasts & unread calculations).
    """
    __tablename__ = "team_chat_reads"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    channel = Column(String(255), default="group_operations", nullable=False, index=True)
    last_read_message_id = Column(Integer, default=0, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.now, onupdate=datetime.datetime.now, nullable=False)

    user = relationship("User")
