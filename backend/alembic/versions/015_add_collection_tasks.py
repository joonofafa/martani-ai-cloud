"""Add collection_tasks and collection_results tables

Revision ID: 015_add_collection_tasks
Revises: 014_add_terms_agreed_at
Create Date: 2026-02-21 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

# revision identifiers
revision: str = "015_add_collection_tasks"
down_revision: Union[str, None] = "014_add_terms_agreed_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = inspector.get_table_names()
    if "collection_tasks" in existing:
        return  # Already created
    op.create_table(
        "collection_tasks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("target_urls", JSONB, nullable=True),
        sa.Column("json_schema", JSONB, nullable=True),
        sa.Column("scraping_instructions", sa.Text, nullable=True),
        sa.Column("schedule_cron", sa.String(100), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("last_run_at", sa.DateTime, nullable=True),
        sa.Column("last_run_status", sa.String(20), nullable=True),
        sa.Column("run_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_collection_tasks_user_status", "collection_tasks", ["user_id", "status"])

    op.create_table(
        "collection_results",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("task_id", UUID(as_uuid=True), sa.ForeignKey("collection_tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_url", sa.String(2048), nullable=True),
        sa.Column("raw_text", sa.Text, nullable=True),
        sa.Column("parsed_data", JSONB, nullable=True),
        sa.Column("file_id", UUID(as_uuid=True), sa.ForeignKey("files.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_collection_results_task_created", "collection_results", ["task_id", "created_at"])
    op.create_index("ix_collection_results_user", "collection_results", ["user_id"])


def downgrade() -> None:
    op.drop_table("collection_results")
    op.drop_table("collection_tasks")
