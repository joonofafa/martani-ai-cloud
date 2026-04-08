"""Mining (수집소) API endpoints."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.collection_task import CollectionTask, CollectionResult
from app.models.user import User

router = APIRouter()


# ── Schemas ──

class PostActionsSchema(BaseModel):
    wait_for_selector: str | None = Field(None, max_length=500)
    scroll_to_bottom: bool = False


class MiningTaskCreate(BaseModel):
    name: str = Field(..., max_length=200)
    description: str
    keywords: list[str] | None = None
    target_urls: list[str] | None = None
    schedule_cron: str | None = None
    vault_credential_ids: list[str] | None = None
    vault_api_key_ids: list[str] | None = None
    scraping_engine: str = "crawl4ai"
    post_actions: PostActionsSchema | None = None


class MiningTaskUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    keywords: list[str] | None = None
    target_urls: list[str] | None = None
    schedule_cron: str | None = None
    vault_credential_ids: list[str] | None = None
    vault_api_key_ids: list[str] | None = None
    scraping_engine: str | None = None
    post_actions: PostActionsSchema | None = None
    status: str | None = None


class MiningTaskItem(BaseModel):
    id: str
    name: str
    description: str
    keywords: list[str] | None
    target_urls: list | None
    schedule_cron: str | None
    scraping_engine: str = "crawl4ai"
    status: str
    last_run_at: str | None
    last_run_status: str | None
    last_run_message: str | None = None
    run_count: int
    result_count: int = 0
    created_at: str
    updated_at: str


class MiningTaskDetail(MiningTaskItem):
    scraping_instructions: str | None
    json_schema: dict | None
    post_actions: dict | None
    vault_credential_ids: list[str] | None
    vault_api_key_ids: list[str] | None


class MiningResultItem(BaseModel):
    id: str
    source_url: str | None
    parsed_data: dict | None
    file_id: str | None
    created_at: str


# ── Endpoints ──

@router.get("/tasks", response_model=list[MiningTaskItem])
async def list_mining_tasks(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all mining tasks for the current user."""
    # Get tasks with result counts
    result = await db.execute(
        select(
            CollectionTask,
            func.count(CollectionResult.id).label("result_count"),
        )
        .outerjoin(CollectionResult, CollectionResult.task_id == CollectionTask.id)
        .where(CollectionTask.user_id == user.id)
        .group_by(CollectionTask.id)
        .order_by(CollectionTask.created_at.desc())
    )

    items = []
    for task, result_count in result.all():
        items.append(MiningTaskItem(
            id=str(task.id),
            name=task.name,
            description=task.description,
            keywords=task.keywords,
            target_urls=task.target_urls,
            schedule_cron=task.schedule_cron,
            scraping_engine=task.scraping_engine,
            status=task.status,
            last_run_at=task.last_run_at.isoformat() if task.last_run_at else None,
            last_run_status=task.last_run_status,
            last_run_message=task.last_run_message,
            run_count=task.run_count,
            result_count=result_count,
            created_at=task.created_at.isoformat(),
            updated_at=task.updated_at.isoformat(),
        ))
    return items


@router.post("/tasks", response_model=MiningTaskDetail)
async def create_mining_task(
    data: MiningTaskCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new mining task."""
    task = CollectionTask(
        user_id=user.id,
        name=data.name,
        description=data.description,
        keywords=data.keywords,
        target_urls=data.target_urls,
        schedule_cron=data.schedule_cron,
        vault_credential_ids=data.vault_credential_ids,
        vault_api_key_ids=data.vault_api_key_ids,
        scraping_engine=data.scraping_engine,
        post_actions=data.post_actions.model_dump(exclude_none=True) if data.post_actions else None,
        status="active",
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    return _task_to_detail(task, 0)


@router.get("/tasks/{task_id}", response_model=MiningTaskDetail)
async def get_mining_task(
    task_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get mining task details."""
    task = await _get_user_task(db, task_id, user.id)
    result_count = await db.scalar(
        select(func.count(CollectionResult.id))
        .where(CollectionResult.task_id == task.id)
    )
    return _task_to_detail(task, result_count or 0)


@router.put("/tasks/{task_id}", response_model=MiningTaskDetail)
async def update_mining_task(
    task_id: UUID,
    data: MiningTaskUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update a mining task."""
    task = await _get_user_task(db, task_id, user.id)

    update_data = data.model_dump(exclude_unset=True)
    # Convert PostActionsSchema to dict for JSONB storage
    if "post_actions" in update_data and update_data["post_actions"] is not None:
        update_data["post_actions"] = {k: v for k, v in update_data["post_actions"].items() if v is not None}
    for key, value in update_data.items():
        setattr(task, key, value)
    task.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(task)

    result_count = await db.scalar(
        select(func.count(CollectionResult.id))
        .where(CollectionResult.task_id == task.id)
    )
    return _task_to_detail(task, result_count or 0)


@router.delete("/tasks/{task_id}")
async def delete_mining_task(
    task_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a mining task and all its results."""
    task = await _get_user_task(db, task_id, user.id)
    await db.delete(task)
    await db.commit()
    return {"ok": True}


@router.post("/tasks/{task_id}/run")
async def run_mining_task(
    task_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Trigger immediate execution of a mining task."""
    task = await _get_user_task(db, task_id, user.id)

    if task.last_run_status == "running":
        raise HTTPException(400, "Task is already running")

    # Commit current state before dispatching
    await db.commit()

    from app.tasks.collection import execute_collection_task
    execute_collection_task.delay(str(task.id))

    return {"ok": True, "message": "Task dispatched"}


@router.get("/tasks/{task_id}/results", response_model=list[MiningResultItem])
async def list_mining_results(
    task_id: UUID,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List results for a mining task."""
    await _get_user_task(db, task_id, user.id)

    result = await db.execute(
        select(CollectionResult)
        .where(CollectionResult.task_id == task_id)
        .order_by(CollectionResult.created_at.desc())
        .limit(limit)
        .offset(offset)
    )

    return [
        MiningResultItem(
            id=str(r.id),
            source_url=r.source_url,
            parsed_data=r.parsed_data,
            file_id=str(r.file_id) if r.file_id else None,
            created_at=r.created_at.isoformat(),
        )
        for r in result.scalars().all()
    ]


# ── Dashboard stats ──

@router.get("/stats")
async def get_mining_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get mining dashboard statistics."""
    total_tasks = await db.scalar(
        select(func.count(CollectionTask.id))
        .where(CollectionTask.user_id == user.id)
    ) or 0

    scheduled_tasks = await db.scalar(
        select(func.count(CollectionTask.id))
        .where(
            CollectionTask.user_id == user.id,
            CollectionTask.schedule_cron.isnot(None),
            CollectionTask.status == "active",
        )
    ) or 0

    total_results = await db.scalar(
        select(func.count(CollectionResult.id))
        .where(CollectionResult.user_id == user.id)
    ) or 0

    completed_runs = await db.scalar(
        select(func.coalesce(func.sum(CollectionTask.run_count), 0))
        .where(CollectionTask.user_id == user.id)
    ) or 0

    return {
        "total_tasks": total_tasks,
        "scheduled_tasks": scheduled_tasks,
        "total_results": total_results,
        "completed_runs": completed_runs,
    }


# ── Helpers ──

async def _get_user_task(db: AsyncSession, task_id: UUID, user_id) -> CollectionTask:
    result = await db.execute(
        select(CollectionTask).where(
            CollectionTask.id == task_id,
            CollectionTask.user_id == user_id,
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Task not found")
    return task


def _task_to_detail(task: CollectionTask, result_count: int) -> MiningTaskDetail:
    return MiningTaskDetail(
        id=str(task.id),
        name=task.name,
        description=task.description,
        keywords=task.keywords,
        target_urls=task.target_urls,
        schedule_cron=task.schedule_cron,
        scraping_engine=task.scraping_engine,
        scraping_instructions=task.scraping_instructions,
        json_schema=task.json_schema,
        post_actions=task.post_actions,
        vault_credential_ids=task.vault_credential_ids,
        vault_api_key_ids=task.vault_api_key_ids,
        status=task.status,
        last_run_at=task.last_run_at.isoformat() if task.last_run_at else None,
        last_run_status=task.last_run_status,
        last_run_message=task.last_run_message,
        run_count=task.run_count,
        result_count=result_count,
        created_at=task.created_at.isoformat(),
        updated_at=task.updated_at.isoformat(),
    )
