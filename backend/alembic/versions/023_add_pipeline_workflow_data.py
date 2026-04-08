"""Add workflow_data JSONB column to pipelines table.

Revision ID: 023_pipeline_workflow_data
Revises: 022_add_missing_indexes
Create Date: 2026-03-18
"""

revision = "023_pipeline_workflow_data"
down_revision = "022_add_missing_indexes"

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


def upgrade() -> None:
    op.add_column('pipelines', sa.Column('workflow_data', JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column('pipelines', 'workflow_data')
