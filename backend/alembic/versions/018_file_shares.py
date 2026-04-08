"""Add file_shares table

Revision ID: 018_file_shares
Revises: 017_schedule_tasks_and_cleanup
Create Date: 2026-02-23 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers
revision: str = "018_file_shares"
down_revision: Union[str, None] = "017_schedule_tasks_and_cleanup"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    existing = inspector.get_table_names()

    if "file_shares" not in existing:
        op.create_table(
            "file_shares",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("file_id", UUID(as_uuid=True), sa.ForeignKey("files.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("token", sa.String(20), unique=True, nullable=False),
            sa.Column("password_hash", sa.String(255), nullable=True),
            sa.Column("expires_at", sa.DateTime, nullable=True),
            sa.Column("download_count", sa.Integer, server_default="0", nullable=False),
            sa.Column("is_revoked", sa.Boolean, server_default=sa.text("false"), nullable=False),
            sa.Column("created_at", sa.DateTime, server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_file_shares_token", "file_shares", ["token"], unique=True)
        op.create_index("ix_file_shares_file_id", "file_shares", ["file_id"])
        op.create_index("ix_file_shares_user_id", "file_shares", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_file_shares_user_id", "file_shares")
    op.drop_index("ix_file_shares_file_id", "file_shares")
    op.drop_index("ix_file_shares_token", "file_shares")
    op.drop_table("file_shares")
