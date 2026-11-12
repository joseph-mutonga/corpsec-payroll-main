import datetime
from sqlalchemy import Column, Integer, Text, DateTime
from application.backend.app.core.database import Base


class AnonymousMessage(Base):
    """
    Anonymous Guard Reporting Model.

    Compliance & Security Standards:
    - Stores strictly: autoincremented ID, raw text message, and submission timestamp.
    - Identity Decoupling: NEVER store, map, or link user_id, guard_id, username,
      IP address, or session identifier.
    - Zero Foreign Keys: Prevents relational reverse-engineering or joining back to
      users, guards, or session logs.
    """
    __tablename__ = "anonymous_messages"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.now, nullable=False)

