"""Add pipeline, refinery_rules, refinery_results, bridge_configs tables
and pipeline_id to collection_tasks/collection_results."""

revision = "019_add_pipeline_and_refinery"
down_revision = "018_file_shares"

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


def upgrade() -> None:
    # -- Bridge configs (must exist before pipelines FK) --
    op.create_table(
        "bridge_configs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pipeline_id", UUID(as_uuid=True), nullable=True),  # FK added after pipelines table
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("destination_type", sa.String(50), nullable=False),
        sa.Column("destination_config", JSONB, nullable=True),
        sa.Column("auto_trigger", sa.Boolean, default=False),
        sa.Column("status", sa.String(20), default="active"),
        sa.Column("last_run_at", sa.DateTime, nullable=True),
        sa.Column("delivery_count", sa.Integer, default=0),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_bridge_configs_user", "bridge_configs", ["user_id"])

    # -- Refinery rules (must exist before pipelines FK) --
    op.create_table(
        "refinery_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pipeline_id", UUID(as_uuid=True), nullable=True),  # FK added after pipelines table
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("source_task_id", UUID(as_uuid=True), sa.ForeignKey("collection_tasks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("prompt", sa.Text, nullable=False),
        sa.Column("filter_rules", JSONB, nullable=True),
        sa.Column("output_format", sa.String(20), default="json"),
        sa.Column("auto_trigger", sa.Boolean, default=False),
        sa.Column("status", sa.String(20), default="active"),
        sa.Column("last_run_at", sa.DateTime, nullable=True),
        sa.Column("last_run_status", sa.String(20), nullable=True),
        sa.Column("last_run_message", sa.Text, nullable=True),
        sa.Column("run_count", sa.Integer, default=0),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_refinery_rules_user", "refinery_rules", ["user_id"])

    # -- Pipelines --
    op.create_table(
        "pipelines",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("short_code", sa.String(20), nullable=False, unique=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("mining_task_id", UUID(as_uuid=True), sa.ForeignKey("collection_tasks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("refinery_rule_id", UUID(as_uuid=True), sa.ForeignKey("refinery_rules.id", ondelete="SET NULL"), nullable=True),
        sa.Column("bridge_config_id", UUID(as_uuid=True), sa.ForeignKey("bridge_configs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(20), default="active"),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_pipelines_user", "pipelines", ["user_id"])
    op.create_index("ix_pipelines_short_code", "pipelines", ["short_code"], unique=True)

    # -- Add pipeline_id FK to refinery_rules and bridge_configs --
    op.create_foreign_key(
        "fk_refinery_rules_pipeline", "refinery_rules",
        "pipelines", ["pipeline_id"], ["id"], ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_bridge_configs_pipeline", "bridge_configs",
        "pipelines", ["pipeline_id"], ["id"], ondelete="SET NULL",
    )

    # -- Refinery results --
    op.create_table(
        "refinery_results",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("rule_id", UUID(as_uuid=True), sa.ForeignKey("refinery_rules.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("pipeline_id", UUID(as_uuid=True), sa.ForeignKey("pipelines.id", ondelete="SET NULL"), nullable=True),
        sa.Column("source_result_id", UUID(as_uuid=True), sa.ForeignKey("collection_results.id", ondelete="SET NULL"), nullable=True),
        sa.Column("refined_data", JSONB, nullable=True),
        sa.Column("output_text", sa.Text, nullable=True),
        sa.Column("file_id", UUID(as_uuid=True), sa.ForeignKey("files.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_refinery_results_rule_created", "refinery_results", ["rule_id", "created_at"])
    op.create_index("ix_refinery_results_user", "refinery_results", ["user_id"])
    op.create_index("ix_refinery_results_pipeline", "refinery_results", ["pipeline_id"])

    # -- Add pipeline_id to existing tables --
    op.add_column("collection_tasks", sa.Column(
        "pipeline_id", UUID(as_uuid=True),
        sa.ForeignKey("pipelines.id", ondelete="SET NULL"), nullable=True,
    ))
    op.add_column("collection_results", sa.Column(
        "pipeline_id", UUID(as_uuid=True),
        sa.ForeignKey("pipelines.id", ondelete="SET NULL"), nullable=True,
    ))


def downgrade() -> None:
    op.drop_column("collection_results", "pipeline_id")
    op.drop_column("collection_tasks", "pipeline_id")
    op.drop_table("refinery_results")
    op.drop_constraint("fk_bridge_configs_pipeline", "bridge_configs")
    op.drop_constraint("fk_refinery_rules_pipeline", "refinery_rules")
    op.drop_table("pipelines")
    op.drop_table("refinery_rules")
    op.drop_table("bridge_configs")
