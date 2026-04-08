"""Add missing indexes and constraints for query performance.

Revision ID: 022_add_missing_indexes
Revises: ddf7ffb37f33
Create Date: 2026-03-16
"""

revision = "022_add_missing_indexes"
down_revision = "ddf7ffb37f33"

from alembic import op


def upgrade() -> None:
    # ChatSession: composite index for user queries with soft-delete filter
    op.create_index(
        "ix_chat_sessions_user_deleted", "chat_sessions", ["user_id", "deleted_at"]
    )

    # ChatMessage: composite index for session message ordering
    op.create_index(
        "ix_chat_messages_session_created", "chat_messages", ["session_id", "created_at"]
    )

    # ScheduleTask: user lookup with schedule time
    op.create_index(
        "ix_schedule_tasks_user_scheduled", "schedule_tasks", ["user_id", "scheduled_at"]
    )

    # ScheduleTask: status filter for scheduler polling
    op.create_index(
        "ix_schedule_tasks_status_enabled", "schedule_tasks", ["status", "is_enabled"]
    )

    # IndexCategory: user lookup
    op.create_index("ix_index_categories_user", "index_categories", ["user_id"])

    # FileCategory: prevent duplicate file-category mappings
    op.create_unique_constraint("uq_file_category", "file_categories", ["file_id", "category_id"])

    # FileCategory: category lookup for cascade queries
    op.create_index("ix_file_categories_category", "file_categories", ["category_id"])

    # FileShare: widen token column for stronger tokens (10 → 22 chars)
    op.execute("ALTER TABLE file_shares ALTER COLUMN token TYPE varchar(32)")


def downgrade() -> None:
    op.execute("ALTER TABLE file_shares ALTER COLUMN token TYPE varchar(20)")
    op.drop_index("ix_file_categories_category", table_name="file_categories")
    op.drop_constraint("uq_file_category", "file_categories", type_="unique")
    op.drop_index("ix_index_categories_user", table_name="index_categories")
    op.drop_index("ix_schedule_tasks_status_enabled", table_name="schedule_tasks")
    op.drop_index("ix_schedule_tasks_user_scheduled", table_name="schedule_tasks")
    op.drop_index("ix_chat_messages_session_created", table_name="chat_messages")
    op.drop_index("ix_chat_sessions_user_deleted", table_name="chat_sessions")
