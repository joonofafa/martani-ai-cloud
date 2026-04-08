"""Add terms_agreed_at to users table

Revision ID: 014_add_terms_agreed_at
Revises: 013_add_audit_logs
Create Date: 2026-02-20 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers
revision: str = "014_add_terms_agreed_at"
down_revision: Union[str, None] = "013_add_audit_logs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("terms_agreed_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "terms_agreed_at")
