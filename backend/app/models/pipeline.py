"""Pipeline model — ties together Mining → Refinery → Bridge stages."""

import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Text, Integer, Boolean, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB

from ..core.database import Base


class Pipeline(Base):
    __tablename__ = "pipelines"
    __table_args__ = (
        Index("ix_pipelines_user", "user_id"),
        Index("ix_pipelines_short_code", "short_code", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )

    name: Mapped[str] = mapped_column(String(200))
    short_code: Mapped[str] = mapped_column(String(20), unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Stage links (nullable — stages can be added incrementally)
    mining_task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collection_tasks.id", ondelete="SET NULL"),
        nullable=True,
    )
    refinery_rule_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("refinery_rules.id", ondelete="SET NULL"),
        nullable=True,
    )
    bridge_config_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bridge_configs.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Workflow editor state (nodes + edges JSON)
    workflow_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Schedule
    schedule_cron: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_scheduled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    status: Mapped[str] = mapped_column(String(20), default="active")  # active | inactive
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    user: Mapped["User"] = relationship("User")
    mining_task: Mapped["CollectionTask"] = relationship("CollectionTask", foreign_keys=[mining_task_id])
    refinery_rule: Mapped["RefineryRule"] = relationship("RefineryRule", foreign_keys=[refinery_rule_id])
    bridge_config: Mapped["BridgeConfig"] = relationship("BridgeConfig", foreign_keys=[bridge_config_id])

    def __repr__(self) -> str:
        return f"<Pipeline {self.short_code} [{self.status}]>"


class RefineryRule(Base):
    __tablename__ = "refinery_rules"
    __table_args__ = (
        Index("ix_refinery_rules_user", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    pipeline_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pipelines.id", ondelete="SET NULL"),
        nullable=True,
    )

    name: Mapped[str] = mapped_column(String(200))
    source_task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collection_tasks.id", ondelete="SET NULL"),
        nullable=True,
    )
    prompt: Mapped[str] = mapped_column(Text)  # AI 정제 지시
    filter_rules: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # e.g. {"include_keywords": [...], "exclude_keywords": [...], "dedup": true}
    output_format: Mapped[str] = mapped_column(String(20), default="json")  # json | csv | summary
    auto_trigger: Mapped[bool] = mapped_column(Boolean, default=False)

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
    source_task: Mapped["CollectionTask"] = relationship("CollectionTask")
    results: Mapped[list["RefineryResult"]] = relationship(
        "RefineryResult", back_populates="rule", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<RefineryRule {self.name} [{self.status}]>"


class RefineryResult(Base):
    __tablename__ = "refinery_results"
    __table_args__ = (
        Index("ix_refinery_results_rule_created", "rule_id", "created_at"),
        Index("ix_refinery_results_user", "user_id"),
        Index("ix_refinery_results_pipeline", "pipeline_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    rule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("refinery_rules.id", ondelete="CASCADE")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    pipeline_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pipelines.id", ondelete="SET NULL"),
        nullable=True,
    )
    source_result_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collection_results.id", ondelete="SET NULL"),
        nullable=True,
    )

    refined_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    output_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("files.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    rule: Mapped["RefineryRule"] = relationship("RefineryRule", back_populates="results")
    user: Mapped["User"] = relationship("User")
    file: Mapped["File"] = relationship("File")

    def __repr__(self) -> str:
        return f"<RefineryResult {self.id} rule={self.rule_id}>"


class BridgeConfig(Base):
    __tablename__ = "bridge_configs"
    __table_args__ = (
        Index("ix_bridge_configs_user", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    pipeline_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pipelines.id", ondelete="SET NULL"),
        nullable=True,
    )

    name: Mapped[str] = mapped_column(String(200))
    destination_type: Mapped[str] = mapped_column(String(50))
    # "webhook" | "email" | "cloud_folder" | "api"
    destination_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # e.g. {"url": "...", "headers": {...}} or {"folder": "/pipeline/PL-xxx/"}
    auto_trigger: Mapped[bool] = mapped_column(Boolean, default=False)

    status: Mapped[str] = mapped_column(String(20), default="active")
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    delivery_count: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<BridgeConfig {self.name} [{self.destination_type}]>"


from .user import User
from .collection_task import CollectionTask, CollectionResult
from .file import File
