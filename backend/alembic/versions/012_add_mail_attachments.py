"""Add mail_attachments table

Revision ID: 012_add_mail_attachments
Revises: 011_add_user_plan_and_tokens
Create Date: 2026-02-18 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = '012_add_mail_attachments'
down_revision: Union[str, None] = '011_add_user_plan_and_tokens'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'mail_attachments',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('mail_id', UUID(as_uuid=True), sa.ForeignKey('mails.id', ondelete='CASCADE'), nullable=False),
        sa.Column('file_name', sa.String(500), nullable=False, server_default=''),
        sa.Column('file_size', sa.Integer, nullable=False, server_default='0'),
        sa.Column('mime_type', sa.String(255), nullable=False, server_default='application/octet-stream'),
        sa.Column('storage_path', sa.Text, nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime, nullable=False, server_default=sa.func.now()),
    )
    op.create_index('ix_mail_attachments_mail_id', 'mail_attachments', ['mail_id'])


def downgrade() -> None:
    op.drop_index('ix_mail_attachments_mail_id', table_name='mail_attachments')
    op.drop_table('mail_attachments')
