"""Add agent_type and last_read_at to chat_sessions

Revision ID: 005_add_agent_type
Revises: 004_tools_email_verify
Create Date: 2026-02-10 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "005_add_agent_type"
down_revision = "004_tools_email_verify"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('chat_sessions', sa.Column('agent_type', sa.String(50), nullable=True))
    op.add_column('chat_sessions', sa.Column('last_read_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('chat_sessions', 'last_read_at')
    op.drop_column('chat_sessions', 'agent_type')
