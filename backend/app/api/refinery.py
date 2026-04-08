"""Refinery (정제소) API endpoints."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.pipeline import RefineryRule, RefineryResult
from app.models.collection_task import CollectionTask, CollectionResult
from app.models.user import User

router = APIRouter()


# ── Schemas ──

class RefineryRuleCreate(BaseModel):
    name: str = Field(..., max_length=200)
    source_task_id: str | None = None
    pipeline_id: str | None = None
    prompt: str
    filter_rules: dict | None = None
    output_format: str = "json"
    auto_trigger: bool = False


class RefineryRuleUpdate(BaseModel):
    name: str | None = None
    source_task_id: str | None = None
    prompt: str | None = None
    filter_rules: dict | None = None
    output_format: str | None = None
    auto_trigger: bool | None = None
    status: str | None = None


class RefineryRuleItem(BaseModel):
    id: str
    name: str
    source_task_id: str | None
    source_task_name: str | None = None
    pipeline_id: str | None
    prompt: str
    filter_rules: dict | None
    output_format: str
    auto_trigger: bool
    status: str
    last_run_at: str | None
    last_run_status: str | None
    last_run_message: str | None
    run_count: int
    result_count: int = 0
    created_at: str
    updated_at: str


class RefineryResultItem(BaseModel):
    id: str
    source_result_id: str | None
    refined_data: dict | None
    output_text: str | None
    file_id: str | None
    created_at: str


# ── Helpers ──

async def _get_user_rule(db: AsyncSession, rule_id: UUID, user_id) -> RefineryRule:
    result = await db.execute(
        select(RefineryRule).where(
            RefineryRule.id == rule_id,
            RefineryRule.user_id == user_id,
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Rule not found")
    return rule


async def _rule_to_item(db: AsyncSession, rule: RefineryRule) -> RefineryRuleItem:
    result_count = await db.scalar(
        select(func.count(RefineryResult.id))
        .where(RefineryResult.rule_id == rule.id)
    ) or 0

    source_name = None
    if rule.source_task_id:
        st = await db.get(CollectionTask, rule.source_task_id)
        source_name = st.name if st else None

    return RefineryRuleItem(
        id=str(rule.id),
        name=rule.name,
        source_task_id=str(rule.source_task_id) if rule.source_task_id else None,
        source_task_name=source_name,
        pipeline_id=str(rule.pipeline_id) if rule.pipeline_id else None,
        prompt=rule.prompt,
        filter_rules=rule.filter_rules,
        output_format=rule.output_format,
        auto_trigger=rule.auto_trigger,
        status=rule.status,
        last_run_at=rule.last_run_at.isoformat() if rule.last_run_at else None,
        last_run_status=rule.last_run_status,
        last_run_message=rule.last_run_message,
        run_count=rule.run_count,
        result_count=result_count,
        created_at=rule.created_at.isoformat(),
        updated_at=rule.updated_at.isoformat(),
    )


# ── Endpoints ──

@router.get("/rules", response_model=list[RefineryRuleItem])
async def list_refinery_rules(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all refinery rules for the current user."""
    result = await db.execute(
        select(RefineryRule)
        .where(RefineryRule.user_id == user.id)
        .order_by(RefineryRule.created_at.desc())
    )
    rules = result.scalars().all()
    return [await _rule_to_item(db, r) for r in rules]


@router.post("/rules", response_model=RefineryRuleItem)
async def create_refinery_rule(
    data: RefineryRuleCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new refinery rule."""
    rule = RefineryRule(
        user_id=user.id,
        name=data.name,
        source_task_id=data.source_task_id if data.source_task_id else None,
        pipeline_id=data.pipeline_id if data.pipeline_id else None,
        prompt=data.prompt,
        filter_rules=data.filter_rules,
        output_format=data.output_format,
        auto_trigger=data.auto_trigger,
        status="active",
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return await _rule_to_item(db, rule)


@router.get("/rules/{rule_id}", response_model=RefineryRuleItem)
async def get_refinery_rule(
    rule_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get refinery rule details."""
    rule = await _get_user_rule(db, rule_id, user.id)
    return await _rule_to_item(db, rule)


@router.put("/rules/{rule_id}", response_model=RefineryRuleItem)
async def update_refinery_rule(
    rule_id: UUID,
    data: RefineryRuleUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update a refinery rule."""
    rule = await _get_user_rule(db, rule_id, user.id)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(rule, key, value)
    rule.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(rule)
    return await _rule_to_item(db, rule)


@router.delete("/rules/{rule_id}")
async def delete_refinery_rule(
    rule_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a refinery rule and all its results."""
    rule = await _get_user_rule(db, rule_id, user.id)
    await db.delete(rule)
    await db.commit()
    return {"ok": True}


@router.post("/rules/{rule_id}/run")
async def run_refinery_rule(
    rule_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Trigger manual execution of a refinery rule."""
    rule = await _get_user_rule(db, rule_id, user.id)

    if rule.last_run_status == "running":
        raise HTTPException(400, "Rule is already running")

    await db.commit()

    from app.tasks.refinery import execute_refinery_task
    execute_refinery_task.delay(str(rule.id))

    return {"ok": True, "message": "Refinery task dispatched"}


@router.get("/rules/{rule_id}/results", response_model=list[RefineryResultItem])
async def list_refinery_results(
    rule_id: UUID,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List results for a refinery rule."""
    await _get_user_rule(db, rule_id, user.id)

    result = await db.execute(
        select(RefineryResult)
        .where(RefineryResult.rule_id == rule_id)
        .order_by(RefineryResult.created_at.desc())
        .limit(limit)
        .offset(offset)
    )

    return [
        RefineryResultItem(
            id=str(r.id),
            source_result_id=str(r.source_result_id) if r.source_result_id else None,
            refined_data=r.refined_data,
            output_text=r.output_text,
            file_id=str(r.file_id) if r.file_id else None,
            created_at=r.created_at.isoformat(),
        )
        for r in result.scalars().all()
    ]


# ── Stats ──

@router.get("/stats")
async def get_refinery_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get refinery dashboard statistics."""
    total_rules = await db.scalar(
        select(func.count(RefineryRule.id))
        .where(RefineryRule.user_id == user.id)
    ) or 0

    auto_rules = await db.scalar(
        select(func.count(RefineryRule.id))
        .where(
            RefineryRule.user_id == user.id,
            RefineryRule.auto_trigger.is_(True),
            RefineryRule.status == "active",
        )
    ) or 0

    total_results = await db.scalar(
        select(func.count(RefineryResult.id))
        .where(RefineryResult.user_id == user.id)
    ) or 0

    completed_runs = await db.scalar(
        select(func.coalesce(func.sum(RefineryRule.run_count), 0))
        .where(RefineryRule.user_id == user.id)
    ) or 0

    return {
        "total_rules": total_rules,
        "auto_rules": auto_rules,
        "total_results": total_results,
        "completed_runs": completed_runs,
    }


# ── Available sources (for UI dropdown) ──

@router.get("/sources")
async def list_available_sources(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List collection tasks that can be used as refinery sources."""
    result = await db.execute(
        select(CollectionTask)
        .where(CollectionTask.user_id == user.id)
        .order_by(CollectionTask.name)
    )
    tasks = result.scalars().all()
    items = []
    for t in tasks:
        # Count results for this task
        rc = await db.scalar(
            select(func.count(CollectionResult.id))
            .where(CollectionResult.task_id == t.id)
        ) or 0
        items.append({
            "id": str(t.id),
            "name": t.name,
            "result_count": rc,
            "last_run_status": t.last_run_status,
            "last_run_at": t.last_run_at.isoformat() if t.last_run_at else None,
        })
    return items


@router.get("/sources/{task_id}/preview")
async def preview_source_data(
    task_id: UUID,
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Preview collection results from a source task (for refinery UI)."""
    # Verify ownership
    task = await db.execute(
        select(CollectionTask).where(
            CollectionTask.id == task_id,
            CollectionTask.user_id == user.id,
        )
    )
    if not task.scalar_one_or_none():
        raise HTTPException(404, "Source task not found")

    result = await db.execute(
        select(CollectionResult)
        .where(CollectionResult.task_id == task_id)
        .order_by(CollectionResult.created_at.desc())
        .limit(limit)
    )
    return [
        {
            "id": str(r.id),
            "source_url": r.source_url,
            "parsed_data": r.parsed_data,
            "raw_text": (r.raw_text[:500] if r.raw_text else None),
            "created_at": r.created_at.isoformat(),
        }
        for r in result.scalars().all()
    ]
