"""Add system settings table

Revision ID: 002
Revises: 001
Create Date: 2024-01-15 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '002_add_system_settings'
down_revision = '001_initial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create system_settings table
    op.create_table(
        'system_settings',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('key', sa.String(255), unique=True, nullable=False, index=True),
        sa.Column('value', sa.Text(), nullable=True),
        sa.Column('description', sa.String(500), nullable=True),
        sa.Column('is_secret', sa.Boolean(), default=False, nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )

    # Insert default settings
    op.execute("""
        INSERT INTO system_settings (id, key, value, description, is_secret, created_at, updated_at)
        VALUES
        (gen_random_uuid(), 'llm_provider', 'novita', 'LLM Provider (ollama, novita)', false, NOW(), NOW()),
        (gen_random_uuid(), 'llm_endpoint', 'http://ollama:11434', 'LLM API Endpoint URL (for Ollama)', false, NOW(), NOW()),
        (gen_random_uuid(), 'llm_api_key', '', 'LLM API Key (for cloud providers like Novita)', true, NOW(), NOW()),
        (gen_random_uuid(), 'llm_model', 'zai-org-glm-4.6v', 'Default LLM Model (Novita: GLM-4.6v)', false, NOW(), NOW()),
        (gen_random_uuid(), 'embedding_provider', 'novita', 'Embedding Provider (ollama, novita)', false, NOW(), NOW()),
        (gen_random_uuid(), 'embedding_endpoint', 'http://ollama:11434', 'Embedding API Endpoint URL (for Ollama)', false, NOW(), NOW()),
        (gen_random_uuid(), 'embedding_api_key', '', 'Embedding API Key', true, NOW(), NOW()),
        (gen_random_uuid(), 'embedding_model', 'qwen-qwen3-embedding-8b', 'Embedding Model (Novita: qwen3-embedding-8b)', false, NOW(), NOW()),
        (gen_random_uuid(), 'embedding_dimension', '1024', 'Embedding Dimension for Novita Qwen3 (1024 for Novita)', false, NOW(), NOW()),
        (gen_random_uuid(), 'default_user_quota', '5368709120', 'Default user storage quota in bytes (5GB)', false, NOW(), NOW()),
        (gen_random_uuid(), 'max_upload_size', '104857600', 'Max upload file size in bytes (100MB)', false, NOW(), NOW()),
        (gen_random_uuid(), 'allow_registration', 'true', 'Allow new user registration', false, NOW(), NOW())
    """)


def downgrade() -> None:
    op.drop_table('system_settings')
