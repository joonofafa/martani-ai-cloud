"""Agent Trigger model for event-driven autonomous tasks."""

import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Text, Integer, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB

from ..core.database import Base


class AgentTrigger(Base):
    __tablename__ = "agent_triggers"
    __table_args__ = (
        Index("ix_agent_triggers_user_status", "user_id", "status"),
        Index("ix_agent_triggers_type_status", "trigger_type", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )

    # file_upload / mail_received / calendar_reminder
    trigger_type: Mapped[str] = mapped_column(String(50))
    name: Mapped[str] = mapped_column(String(200))
    prompt: Mapped[str] = mapped_column(Text)
    agent_type: Mapped[str] = mapped_column(String(50), default="file-manager")

    # JSON config for filtering (e.g. file extension, sender email)
    config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # active / paused / deleted
    status: Mapped[str] = mapped_column(String(20), default="active")

    last_triggered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    trigger_count: Mapped[int] = mapped_column(Integer, default=0)

    session_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    user: Mapped["User"] = relationship("User")
    session: Mapped["ChatSession"] = relationship("ChatSession")

    def __repr__(self) -> str:
        return f"<AgentTrigger {self.name} [{self.trigger_type}]>"


from .user import User
from .chat import ChatSession
