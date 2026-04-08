"""Add post_actions column to collection_tasks

Revision ID: 016_add_collection_post_actions
Revises: 015_add_collection_tasks
Create Date: 2026-02-21 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers
revision: str = "016_add_collection_post_actions"
down_revision: Union[str, None] = "015_add_collection_tasks"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from sqlalchemy import inspect
    bind = op.get_bind()
    inspector = inspect(bind)
    cols = [c["name"] for c in inspector.get_columns("collection_tasks")]
    if "post_actions" in cols:
        return  # Already added
    op.add_column(
        "collection_tasks",
        sa.Column("post_actions", JSONB, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("collection_tasks", "post_actions")
