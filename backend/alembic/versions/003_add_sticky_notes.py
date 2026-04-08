"""Add sticky notes table

Revision ID: 003_add_sticky_notes
Revises: 002_add_system_settings
Create Date: 2026-02-08 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "003_add_sticky_notes"
down_revision = "002_add_system_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sticky_notes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(255), nullable=False, server_default=""),
        sa.Column("content", sa.Text, nullable=False, server_default=""),
        sa.Column("color", sa.String(20), nullable=False, server_default="yellow"),
        sa.Column("position_x", sa.Integer, nullable=False, server_default="0"),
        sa.Column("position_y", sa.Integer, nullable=False, server_default="0"),
        sa.Column("width", sa.Integer, nullable=False, server_default="250"),
        sa.Column("height", sa.Integer, nullable=False, server_default="250"),
        sa.Column("z_index", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_pinned", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.Column("deleted_at", sa.DateTime, nullable=True),
    )
    op.create_index("ix_sticky_notes_user_id", "sticky_notes", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_sticky_notes_user_id")
    op.drop_table("sticky_notes")
