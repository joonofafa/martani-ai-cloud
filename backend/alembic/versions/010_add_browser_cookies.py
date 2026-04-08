"""Add browser_cookies table for cookie-based session persistence

Revision ID: 010_add_browser_cookies
Revises: 009_add_vault_and_tool_registry
Create Date: 2026-02-14 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = "010_add_browser_cookies"
down_revision: Union[str, None] = "009_add_vault_and_tool_registry"
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
    if not _table_exists("browser_cookies"):
        op.create_table(
            "browser_cookies",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", UUID(as_uuid=True),
                       sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("domain", sa.String(255), nullable=False),
            sa.Column("label", sa.String(255), nullable=True),
            sa.Column("cookies_encrypted", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()")),
            sa.UniqueConstraint("user_id", "domain", name="uq_browser_cookies_user_domain"),
        )
        op.create_index("ix_browser_cookies_user_id", "browser_cookies", ["user_id"])


def downgrade() -> None:
    op.drop_table("browser_cookies")
