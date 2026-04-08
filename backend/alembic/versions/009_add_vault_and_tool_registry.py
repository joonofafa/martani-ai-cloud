"""Add credential_vault, file_vault, tool_groups, tool_functions tables

Revision ID: 009_add_vault_and_tool_registry
Revises: 008_add_agent_schedules_triggers
Create Date: 2026-02-14 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = "009_add_vault_and_tool_registry"
down_revision: Union[str, None] = "008_add_agent_schedules_triggers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    """Check if a table already exists (for idempotent migrations)."""
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :name)"
    ), {"name": table_name})
    return result.scalar()


def upgrade() -> None:
    # --- credential_vault ---
    if not _table_exists("credential_vault"):
        op.create_table(
            "credential_vault",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", UUID(as_uuid=True),
                       sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("site_name", sa.String(500), nullable=False),
            sa.Column("username", sa.Text(), nullable=False),     # AES256 encrypted
            sa.Column("password", sa.Text(), nullable=False),     # AES256 encrypted
            sa.Column("notes", sa.Text(), nullable=True),         # AES256 encrypted
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()")),
        )
        op.create_index("ix_credential_vault_user_id", "credential_vault", ["user_id"])

    # --- file_vault ---
    if not _table_exists("file_vault"):
        op.create_table(
            "file_vault",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", UUID(as_uuid=True),
                       sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("original_filename", sa.String(255), nullable=False),
            sa.Column("original_mime_type", sa.String(100), nullable=True),
            sa.Column("original_size", sa.BigInteger(), nullable=False),
            sa.Column("original_folder", sa.String(500), nullable=False),
            sa.Column("encrypted_storage_path", sa.String(500), nullable=False),
            sa.Column("encrypted_size", sa.BigInteger(), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()")),
        )
        op.create_index("ix_file_vault_user_id", "file_vault", ["user_id"])

    # --- tool_groups ---
    if not _table_exists("tool_groups"):
        op.create_table(
            "tool_groups",
            sa.Column("key", sa.String(100), primary_key=True),
            sa.Column("category", sa.String(100), nullable=False),
            sa.Column("display_name", sa.String(200), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()")),
        )

    # --- tool_functions ---
    if not _table_exists("tool_functions"):
        op.create_table(
            "tool_functions",
            sa.Column("name", sa.String(100), primary_key=True),
            sa.Column("group_key", sa.String(100),
                       sa.ForeignKey("tool_groups.key"), nullable=False),
            sa.Column("display_name", sa.String(200), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()")),
        )
        op.create_index("ix_tool_functions_group_key", "tool_functions", ["group_key"])


def downgrade() -> None:
    op.drop_table("tool_functions")
    op.drop_table("tool_groups")
    op.drop_table("file_vault")
    op.drop_table("credential_vault")
