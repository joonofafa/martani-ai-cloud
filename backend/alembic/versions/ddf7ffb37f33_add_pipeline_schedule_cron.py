"""add_pipeline_schedule_cron

Revision ID: ddf7ffb37f33
Revises: 021_categories_chat_store
Create Date: 2026-03-14 14:55:58.679225

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'ddf7ffb37f33'
down_revision: Union[str, None] = '021_categories_chat_store'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('pipelines', sa.Column('schedule_cron', sa.String(length=100), nullable=True))
    op.add_column('pipelines', sa.Column('last_scheduled_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('pipelines', 'last_scheduled_at')
    op.drop_column('pipelines', 'schedule_cron')
