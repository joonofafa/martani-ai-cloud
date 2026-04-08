"""Add scraping_engine column to collection_tasks."""

revision = "020_add_scraping_engine"
down_revision = "019_add_pipeline_and_refinery"

from alembic import op
import sqlalchemy as sa


def upgrade():
    op.add_column(
        "collection_tasks",
        sa.Column(
            "scraping_engine",
            sa.String(30),
            server_default="crawl4ai",
            nullable=False,
        ),
    )


def downgrade():
    op.drop_column("collection_tasks", "scraping_engine")
