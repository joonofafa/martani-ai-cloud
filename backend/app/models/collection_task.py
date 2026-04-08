"""Collection Task and Result models for multi-model data collection pipeline."""

import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Text, Integer, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB

from ..core.database import Base


class CollectionTask(Base):
    __tablename__ = "collection_tasks"
    __table_args__ = (
        Index("ix_collection_tasks_user_status", "user_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )

    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    target_urls: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    json_schema: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    scraping_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    schedule_cron: Mapped[str | None] = mapped_column(String(100), nullable=True)
    post_actions: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Pipeline link
    pipeline_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pipelines.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Mining-specific fields
    keywords: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    vault_credential_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    vault_api_key_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Scraping engine: crawl4ai (default) | scrapling | scrapling_stealth
    scraping_engine: Mapped[str] = mapped_column(
        String(30), default="crawl4ai", server_default="crawl4ai",
    )

    status: Mapped[str] = mapped_column(String(20), default="active")
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_run_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    last_run_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    run_count: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    user: Mapped["User"] = relationship("User")
    results: Mapped[list["CollectionResult"]] = relationship(
        "CollectionResult", back_populates="task", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<CollectionTask {self.name} [{self.status}]>"


class CollectionResult(Base):
    __tablename__ = "collection_results"
    __table_args__ = (
        Index("ix_collection_results_task_created", "task_id", "created_at"),
        Index("ix_collection_results_user", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collection_tasks.id", ondelete="CASCADE")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )

    pipeline_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pipelines.id", ondelete="SET NULL"),
        nullable=True,
    )

    source_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    parsed_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    file_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("files.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    task: Mapped["CollectionTask"] = relationship("CollectionTask", back_populates="results")
    user: Mapped["User"] = relationship("User")
    file: Mapped["File"] = relationship("File")

    def __repr__(self) -> str:
        return f"<CollectionResult {self.id} task={self.task_id}>"


from .user import User
from .file import File
