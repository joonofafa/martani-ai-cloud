"""Add index_status columns to files table

Revision ID: 007_add_index_status
Revises: 006_add_mail_and_calendar
Create Date: 2026-02-10 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "007_add_index_status"
down_revision: Union[str, None] = "006_add_mail_and_calendar"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create the enum type
    indexstatus_enum = sa.Enum(
        "pending", "processing", "completed", "failed",
        name="indexstatus",
    )
    indexstatus_enum.create(op.get_bind(), checkfirst=True)

    # Add new columns
    op.add_column(
        "files",
        sa.Column(
            "index_status",
            indexstatus_enum,
            nullable=False,
            server_default="pending",
        ),
    )
    op.add_column(
        "files",
        sa.Column("index_progress", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "files",
        sa.Column("indexed_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "files",
        sa.Column("celery_task_id", sa.String(255), nullable=True),
    )

    # Migrate existing data: is_indexed=true → index_status='completed'
    op.execute(
        "UPDATE files SET index_status = 'completed' WHERE is_indexed = true"
    )

    # Create indexes
    op.create_index("ix_files_index_status", "files", ["index_status"])
    op.create_index("ix_files_user_id_index_status", "files", ["user_id", "index_status"])


def downgrade() -> None:
    op.drop_index("ix_files_user_id_index_status", table_name="files")
    op.drop_index("ix_files_index_status", table_name="files")

    op.drop_column("files", "celery_task_id")
    op.drop_column("files", "indexed_at")
    op.drop_column("files", "index_progress")
    op.drop_column("files", "index_status")

    sa.Enum(name="indexstatus").drop(op.get_bind(), checkfirst=True)
