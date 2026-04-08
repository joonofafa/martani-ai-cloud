"""Add user plan and token tracking fields

Revision ID: 011_add_user_plan_and_tokens
Revises: 010_add_browser_cookies
Create Date: 2026-02-17 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '011_add_user_plan_and_tokens'
down_revision: Union[str, None] = '010_add_browser_cookies'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('plan', sa.String(20), server_default='basic', nullable=False))
    op.add_column('users', sa.Column('token_quota', sa.BigInteger(), server_default='5000000', nullable=False))
    op.add_column('users', sa.Column('tokens_used_month', sa.BigInteger(), server_default='0', nullable=False))
    op.add_column('users', sa.Column('token_reset_date', sa.Date(), server_default='2026-02-01', nullable=False))


def downgrade() -> None:
    op.drop_column('users', 'token_reset_date')
    op.drop_column('users', 'tokens_used_month')
    op.drop_column('users', 'token_quota')
    op.drop_column('users', 'plan')
