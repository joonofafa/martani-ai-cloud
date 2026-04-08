"""Add schedule_tasks table and drop deprecated tables

Revision ID: 017_schedule_tasks_and_cleanup
Revises: 016_add_collection_post_actions
Create Date: 2026-02-21 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

# revision identifiers
revision: str = "017_schedule_tasks_and_cleanup"
down_revision: Union[str, None] = "016_add_collection_post_actions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = inspector.get_table_names()

    # Create schedule_tasks table if not exists
    if "schedule_tasks" not in existing:
        op.create_table(
            "schedule_tasks",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(200), nullable=False, server_default=""),
            sa.Column("prompt", sa.Text, nullable=False, server_default=""),
            sa.Column("summary", sa.Text, nullable=True),
            sa.Column("tools_predicted", JSONB, nullable=True),
            sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("repeat_type", sa.String(20), nullable=True),
            sa.Column("cron_expression", sa.String(100), nullable=True),
            sa.Column("is_enabled", sa.Boolean, server_default=sa.text("true"), nullable=False),
            sa.Column("status", sa.String(20), server_default="pending", nullable=False),
            sa.Column("last_run_at", sa.DateTime, nullable=True),
            sa.Column("session_id", UUID(as_uuid=True), sa.ForeignKey("chat_sessions.id"), nullable=True),
            sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_schedule_tasks_user_id", "schedule_tasks", ["user_id"])
        op.create_index("ix_schedule_tasks_scheduled_at", "schedule_tasks", ["scheduled_at"])

    # Drop deprecated tables (if they exist)
    for table in ["agent_triggers", "agent_schedules", "mail_attachments", "mails"]:
        if table in existing:
            op.drop_table(table)


def downgrade() -> None:
    # Recreate mails table
    op.create_table(
        "mails",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("from_name", sa.String(255)),
        sa.Column("from_email", sa.String(255)),
        sa.Column("to_email", sa.String(255)),
        sa.Column("subject", sa.String(500)),
        sa.Column("body", sa.Text),
        sa.Column("folder", sa.String(20)),
        sa.Column("is_read", sa.Boolean),
        sa.Column("is_starred", sa.Boolean),
        sa.Column("created_at", sa.DateTime),
        sa.Column("updated_at", sa.DateTime),
        sa.Column("deleted_at", sa.DateTime, nullable=True),
    )

    # Recreate mail_attachments table
    op.create_table(
        "mail_attachments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("mail_id", UUID(as_uuid=True), sa.ForeignKey("mails.id", ondelete="CASCADE")),
        sa.Column("file_name", sa.String(255)),
        sa.Column("file_size", sa.BigInteger),
        sa.Column("mime_type", sa.String(100)),
        sa.Column("storage_path", sa.String(500)),
        sa.Column("created_at", sa.DateTime),
    )

    # Recreate agent_schedules table
    op.create_table(
        "agent_schedules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("name", sa.String(200)),
        sa.Column("prompt", sa.Text),
        sa.Column("agent_type", sa.String(50)),
        sa.Column("cron_expression", sa.String(100)),
        sa.Column("timezone", sa.String(50)),
        sa.Column("status", sa.String(20)),
        sa.Column("last_run_at", sa.DateTime, nullable=True),
        sa.Column("last_run_status", sa.String(20), nullable=True),
        sa.Column("next_run_at", sa.DateTime, nullable=True),
        sa.Column("run_count", sa.Integer),
        sa.Column("session_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime),
        sa.Column("updated_at", sa.DateTime),
    )

    # Recreate agent_triggers table
    op.create_table(
        "agent_triggers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("trigger_type", sa.String(50)),
        sa.Column("name", sa.String(200)),
        sa.Column("prompt", sa.Text),
        sa.Column("agent_type", sa.String(50)),
        sa.Column("config", JSONB, nullable=True),
        sa.Column("status", sa.String(20)),
        sa.Column("last_triggered_at", sa.DateTime, nullable=True),
        sa.Column("trigger_count", sa.Integer),
        sa.Column("session_id", UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime),
        sa.Column("updated_at", sa.DateTime),
    )

    # Drop schedule_tasks
    op.drop_index("ix_schedule_tasks_scheduled_at", "schedule_tasks")
    op.drop_index("ix_schedule_tasks_user_id", "schedule_tasks")
    op.drop_table("schedule_tasks")
