"""Add mails and calendar_events tables

Revision ID: 006_add_mail_and_calendar
Revises: 005_add_agent_type
Create Date: 2026-02-10 18:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "006_add_mail_and_calendar"
down_revision = "005_add_agent_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Mails table
    op.create_table(
        "mails",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_name", sa.String(255), server_default=""),
        sa.Column("from_email", sa.String(255), server_default=""),
        sa.Column("to_email", sa.String(255), server_default=""),
        sa.Column("subject", sa.String(500), server_default=""),
        sa.Column("body", sa.Text(), server_default=""),
        sa.Column("is_read", sa.Boolean(), server_default="false"),
        sa.Column("is_starred", sa.Boolean(), server_default="false"),
        sa.Column("folder", sa.String(20), server_default="inbox"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_mails_user_id", "mails", ["user_id"])
    op.create_index("ix_mails_user_id_folder", "mails", ["user_id", "folder"])

    # Calendar events table
    op.create_table(
        "calendar_events",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(255), server_default=""),
        sa.Column("description", sa.Text(), server_default=""),
        sa.Column("start_time", sa.DateTime(), nullable=False),
        sa.Column("end_time", sa.DateTime(), nullable=False),
        sa.Column("all_day", sa.Boolean(), server_default="false"),
        sa.Column("color", sa.String(20), server_default="blue"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_calendar_events_user_id", "calendar_events", ["user_id"])
    op.create_index("ix_calendar_events_user_time", "calendar_events", ["user_id", "start_time", "end_time"])


def downgrade() -> None:
    op.drop_index("ix_calendar_events_user_time", table_name="calendar_events")
    op.drop_index("ix_calendar_events_user_id", table_name="calendar_events")
    op.drop_table("calendar_events")
    op.drop_index("ix_mails_user_id_folder", table_name="mails")
    op.drop_index("ix_mails_user_id", table_name="mails")
    op.drop_table("mails")
