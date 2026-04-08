"""Add agent_memories, agent_schedules, agent_triggers tables and chat_messages source columns

Revision ID: 008_add_agent_schedules_triggers
Revises: 007_add_index_status
Create Date: 2026-02-12 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

# revision identifiers, used by Alembic.
revision: str = "008_add_agent_schedules_triggers"
down_revision: Union[str, None] = "007_add_index_status"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- agent_memories (may already exist from Phase 1 manual creation) ---
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_memories')"
    ))
    if not result.scalar():
        op.create_table(
            "agent_memories",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("category", sa.String(50), server_default="general"),
            sa.Column("key", sa.String(255), nullable=False),
            sa.Column("content", sa.Text(), server_default=""),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()")),
        )
        op.create_index("ix_agent_memories_user_id", "agent_memories", ["user_id"])
        op.create_index("ix_agent_memories_user_category", "agent_memories", ["user_id", "category"])

    # --- agent_schedules ---
    op.create_table(
        "agent_schedules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("agent_type", sa.String(50), server_default="file-manager"),
        sa.Column("cron_expression", sa.String(100), nullable=False),
        sa.Column("timezone", sa.String(50), server_default="Asia/Seoul"),
        sa.Column("status", sa.String(20), server_default="active"),
        sa.Column("last_run_at", sa.DateTime(), nullable=True),
        sa.Column("last_run_status", sa.String(20), nullable=True),
        sa.Column("next_run_at", sa.DateTime(), nullable=True),
        sa.Column("run_count", sa.Integer(), server_default="0"),
        sa.Column("daily_run_count", sa.Integer(), server_default="0"),
        sa.Column("daily_run_date", sa.String(10), nullable=True),
        sa.Column("session_id", UUID(as_uuid=True), sa.ForeignKey("chat_sessions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()")),
    )
    op.create_index("ix_agent_schedules_user_status", "agent_schedules", ["user_id", "status"])
    op.create_index("ix_agent_schedules_next_run", "agent_schedules", ["status", "next_run_at"])

    # --- agent_triggers ---
    op.create_table(
        "agent_triggers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("trigger_type", sa.String(50), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("agent_type", sa.String(50), server_default="file-manager"),
        sa.Column("config", JSONB(), nullable=True),
        sa.Column("status", sa.String(20), server_default="active"),
        sa.Column("last_triggered_at", sa.DateTime(), nullable=True),
        sa.Column("trigger_count", sa.Integer(), server_default="0"),
        sa.Column("session_id", UUID(as_uuid=True), sa.ForeignKey("chat_sessions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()")),
    )
    op.create_index("ix_agent_triggers_user_status", "agent_triggers", ["user_id", "status"])
    op.create_index("ix_agent_triggers_type_status", "agent_triggers", ["trigger_type", "status"])

    # --- chat_messages: add source columns ---
    op.add_column("chat_messages", sa.Column("source", sa.String(20), nullable=True))
    op.add_column("chat_messages", sa.Column("source_id", UUID(as_uuid=True), nullable=True))


def downgrade() -> None:
    op.drop_column("chat_messages", "source_id")
    op.drop_column("chat_messages", "source")
    op.drop_table("agent_triggers")
    op.drop_table("agent_schedules")
    op.drop_table("agent_memories")
