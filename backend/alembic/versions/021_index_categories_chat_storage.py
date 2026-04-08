"""Add index categories, file categories, and chat storage fields."""

revision = "021_categories_chat_store"
down_revision = "020_add_scraping_engine"

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy import inspect


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)
    existing_tables = inspector.get_table_names()

    # Index categories table (may already exist from earlier attempt)
    if "index_categories" not in existing_tables:
        op.create_table(
            "index_categories",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("color", sa.String(20), server_default="blue", nullable=False),
            sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        )

    # File-Category M:N join table
    if "file_categories" not in existing_tables:
        op.create_table(
            "file_categories",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("file_id", UUID(as_uuid=True), sa.ForeignKey("files.id", ondelete="CASCADE"), nullable=False),
            sa.Column("category_id", UUID(as_uuid=True), sa.ForeignKey("index_categories.id", ondelete="CASCADE"), nullable=False),
            sa.UniqueConstraint("file_id", "category_id", name="uq_file_category"),
        )

    # Chat sessions: add category_id, file_path, file_size
    existing_cols = {c["name"] for c in inspector.get_columns("chat_sessions")}

    if "category_id" not in existing_cols:
        op.add_column(
            "chat_sessions",
            sa.Column("category_id", UUID(as_uuid=True), sa.ForeignKey("index_categories.id", ondelete="SET NULL"), nullable=True),
        )
    if "file_path" not in existing_cols:
        op.add_column(
            "chat_sessions",
            sa.Column("file_path", sa.String(500), nullable=True),
        )
    if "file_size" not in existing_cols:
        op.add_column(
            "chat_sessions",
            sa.Column("file_size", sa.Integer, server_default="0", nullable=False),
        )


def downgrade():
    op.drop_column("chat_sessions", "file_size")
    op.drop_column("chat_sessions", "file_path")
    op.drop_column("chat_sessions", "category_id")
    op.drop_table("file_categories")
    op.drop_table("index_categories")
