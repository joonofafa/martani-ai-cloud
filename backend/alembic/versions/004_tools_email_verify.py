"""Add LLM tools config settings and email verification fields

Revision ID: 004_tools_email_verify
Revises: 003_add_sticky_notes
Create Date: 2026-02-08 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "004_tools_email_verify"
down_revision = "003_add_sticky_notes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Insert new system settings (use sa.text with bindparams to avoid
    # SQLAlchemy interpreting :true/:false in JSON as bind parameters)
    op.execute(
        sa.text("""
            INSERT INTO system_settings (id, key, value, description, is_secret, created_at, updated_at)
            VALUES
            (gen_random_uuid(), 'llm_system_prompt', :prompt_val, 'LLM system prompt', false, NOW(), NOW()),
            (gen_random_uuid(), 'llm_tools_config', :tools_val, 'LLM tools config (JSON)', false, NOW(), NOW()),
            (gen_random_uuid(), 'resend_api_key', '', 'Resend email API key', true, NOW(), NOW()),
            (gen_random_uuid(), 'email_from_address', 'noreply@martani.cloud', 'Sender email address', false, NOW(), NOW())
        """).bindparams(
            prompt_val='당신은 Martani 클라우드 AI 어시스턴트입니다. 사용자의 질문에 친절하고 정확하게 답변합니다. 도구를 사용할 수 있는 경우, 적절히 활용하여 사용자를 도와주세요.',
            tools_val='{"file_read":true,"file_create":false,"file_delete":false,"file_search_name":true,"file_search_content":true,"note_read":true,"note_create":false,"note_delete":false,"gallery_read":false,"gallery_create":false,"gallery_delete":false}',
        )
    )

    # Add email verification columns to users table
    op.add_column('users', sa.Column('email_verified', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('users', sa.Column('verification_token', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('verification_token_expires', sa.DateTime(), nullable=True))

    # Mark existing users as verified so they can still log in
    op.execute(sa.text("UPDATE users SET email_verified = true"))


def downgrade() -> None:
    op.drop_column('users', 'verification_token_expires')
    op.drop_column('users', 'verification_token')
    op.drop_column('users', 'email_verified')

    op.execute(sa.text("""
        DELETE FROM system_settings WHERE key IN (
            'llm_system_prompt', 'llm_tools_config', 'resend_api_key', 'email_from_address'
        )
    """))
