"""Pipeline API endpoints — manages the 3-stage data pipeline."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.pipeline import Pipeline, RefineryRule, BridgeConfig
from app.models.collection_task import CollectionTask
from app.models.user import User

router = APIRouter()


# ── Schemas ──

class PipelineCreate(BaseModel):
    name: str = Field(..., max_length=200)
    description: str | None = None
    mining_task_id: str | None = None
    schedule_cron: str | None = None
    workflow_data: dict | None = None


class PipelineUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    mining_task_id: str | None = None
    refinery_rule_id: str | None = None
    bridge_config_id: str | None = None
    schedule_cron: str | None = None
    status: str | None = None
    workflow_data: dict | None = None


class PipelineItem(BaseModel):
    id: str
    name: str
    short_code: str
    description: str | None
    mining_task_id: str | None
    refinery_rule_id: str | None
    bridge_config_id: str | None
    workflow_data: dict | None = None
    schedule_cron: str | None = None
    last_scheduled_at: str | None = None
    status: str
    mining_task_name: str | None = None
    refinery_rule_name: str | None = None
    bridge_config_name: str | None = None
    created_at: str
    updated_at: str


# ── Helpers ──

async def _generate_short_code(db: AsyncSession, user_id) -> str:
    """Generate next PL-YYYY-NNNN short code for this user."""
    year = datetime.utcnow().year
    prefix = f"PL-{year}-"

    result = await db.scalar(
        select(func.count(Pipeline.id))
        .where(Pipeline.user_id == user_id)
    )
    seq = (result or 0) + 1
    return f"{prefix}{seq:04d}"


async def _get_user_pipeline(db: AsyncSession, pipeline_id: UUID, user_id) -> Pipeline:
    result = await db.execute(
        select(Pipeline).where(
            Pipeline.id == pipeline_id,
            Pipeline.user_id == user_id,
        )
    )
    pipeline = result.scalar_one_or_none()
    if not pipeline:
        raise HTTPException(404, "Pipeline not found")
    return pipeline


# ── Endpoints ──

@router.get("/", response_model=list[PipelineItem])
async def list_pipelines(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all pipelines for the current user."""
    result = await db.execute(
        select(Pipeline)
        .where(Pipeline.user_id == user.id)
        .order_by(Pipeline.created_at.desc())
    )
    pipelines = result.scalars().all()

    items = []
    for p in pipelines:
        # Resolve stage names
        mining_name = None
        refinery_name = None
        bridge_name = None

        if p.mining_task_id:
            mt = await db.get(CollectionTask, p.mining_task_id)
            mining_name = mt.name if mt else None
        if p.refinery_rule_id:
            rr = await db.get(RefineryRule, p.refinery_rule_id)
            refinery_name = rr.name if rr else None
        if p.bridge_config_id:
            bc = await db.get(BridgeConfig, p.bridge_config_id)
            bridge_name = bc.name if bc else None

        items.append(PipelineItem(
            id=str(p.id),
            name=p.name,
            short_code=p.short_code,
            description=p.description,
            mining_task_id=str(p.mining_task_id) if p.mining_task_id else None,
            refinery_rule_id=str(p.refinery_rule_id) if p.refinery_rule_id else None,
            bridge_config_id=str(p.bridge_config_id) if p.bridge_config_id else None,
            workflow_data=p.workflow_data,
            status=p.status,
            mining_task_name=mining_name,
            refinery_rule_name=refinery_name,
            bridge_config_name=bridge_name,
            schedule_cron=p.schedule_cron,
            last_scheduled_at=p.last_scheduled_at.isoformat() if p.last_scheduled_at else None,
            created_at=p.created_at.isoformat(),
            updated_at=p.updated_at.isoformat(),
        ))
    return items


@router.post("/", response_model=PipelineItem)
async def create_pipeline(
    data: PipelineCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new pipeline."""
    short_code = await _generate_short_code(db, user.id)

    pipeline = Pipeline(
        user_id=user.id,
        name=data.name,
        short_code=short_code,
        description=data.description,
        mining_task_id=data.mining_task_id if data.mining_task_id else None,
        workflow_data=data.workflow_data,
        status="active",
    )
    db.add(pipeline)
    await db.commit()
    await db.refresh(pipeline)

    # Link mining task to pipeline
    if pipeline.mining_task_id:
        mt = await db.get(CollectionTask, pipeline.mining_task_id)
        if mt and mt.user_id == user.id:
            mt.pipeline_id = pipeline.id
            await db.commit()

    return PipelineItem(
        id=str(pipeline.id),
        name=pipeline.name,
        short_code=pipeline.short_code,
        description=pipeline.description,
        mining_task_id=str(pipeline.mining_task_id) if pipeline.mining_task_id else None,
        refinery_rule_id=None,
        bridge_config_id=None,
        workflow_data=pipeline.workflow_data,
        schedule_cron=pipeline.schedule_cron,
        last_scheduled_at=None,
        status=pipeline.status,
        created_at=pipeline.created_at.isoformat(),
        updated_at=pipeline.updated_at.isoformat(),
    )


@router.put("/{pipeline_id}", response_model=PipelineItem)
async def update_pipeline(
    pipeline_id: UUID,
    data: PipelineUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update a pipeline."""
    pipeline = await _get_user_pipeline(db, pipeline_id, user.id)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(pipeline, key, value)
    pipeline.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(pipeline)

    return PipelineItem(
        id=str(pipeline.id),
        name=pipeline.name,
        short_code=pipeline.short_code,
        description=pipeline.description,
        mining_task_id=str(pipeline.mining_task_id) if pipeline.mining_task_id else None,
        refinery_rule_id=str(pipeline.refinery_rule_id) if pipeline.refinery_rule_id else None,
        bridge_config_id=str(pipeline.bridge_config_id) if pipeline.bridge_config_id else None,
        workflow_data=pipeline.workflow_data,
        schedule_cron=pipeline.schedule_cron,
        last_scheduled_at=pipeline.last_scheduled_at.isoformat() if pipeline.last_scheduled_at else None,
        status=pipeline.status,
        created_at=pipeline.created_at.isoformat(),
        updated_at=pipeline.updated_at.isoformat(),
    )


@router.delete("/{pipeline_id}")
async def delete_pipeline(
    pipeline_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a pipeline (does not delete linked stages)."""
    pipeline = await _get_user_pipeline(db, pipeline_id, user.id)
    await db.delete(pipeline)
    await db.commit()
    return {"ok": True}
