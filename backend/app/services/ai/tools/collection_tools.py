"""Collection task tool implementations."""

import json
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


async def _create_collection_task(
    user_id: uuid.UUID, arguments: dict, db: AsyncSession
) -> str:
    from sqlalchemy import func as sa_func
    from app.models.collection_task import CollectionTask

    name = arguments.get("name", "")
    description = arguments.get("description", "")
    target_urls = arguments.get("target_urls")
    schedule_cron = arguments.get("schedule_cron")
    post_actions = arguments.get("post_actions")

    if not name or not description:
        return json.dumps({"error": "name and description are required."})

    # Validate cron if provided
    if schedule_cron:
        try:
            from croniter import croniter
            croniter(schedule_cron)
        except (ValueError, KeyError):
            return json.dumps({"error": f"Invalid cron expression: {schedule_cron}"})

    # Limit per user
    count_result = await db.execute(
        select(sa_func.count()).select_from(CollectionTask).where(
            CollectionTask.user_id == user_id,
            CollectionTask.status != "deleted",
        )
    )
    if count_result.scalar() >= 20:
        return json.dumps({"error": "Maximum 20 collection tasks allowed per user."})

    task = CollectionTask(
        user_id=user_id,
        name=name[:200],
        description=description,
        target_urls=target_urls,
        schedule_cron=schedule_cron,
        post_actions=post_actions,
    )
    db.add(task)
    await db.flush()
    await db.commit()

    result = {
        "status": "created",
        "task_id": str(task.id),
        "name": task.name,
        "message": f"Collection task '{task.name}' created successfully.",
    }
    if schedule_cron:
        result["schedule"] = schedule_cron
    if post_actions:
        result["post_actions"] = post_actions

    return json.dumps(result, ensure_ascii=False)


async def _list_collection_tasks(user_id: uuid.UUID, db: AsyncSession) -> str:
    from app.models.collection_task import CollectionTask

    result = await db.execute(
        select(CollectionTask).where(
            CollectionTask.user_id == user_id,
            CollectionTask.status != "deleted",
        ).order_by(CollectionTask.created_at.desc())
    )
    tasks = result.scalars().all()

    items = []
    for t in tasks:
        item = {
            "id": str(t.id),
            "name": t.name,
            "status": t.status,
            "schedule_cron": t.schedule_cron,
            "run_count": t.run_count,
            "last_run_at": t.last_run_at.isoformat() if t.last_run_at else None,
            "last_run_status": t.last_run_status,
            "target_urls_count": len(t.target_urls) if t.target_urls else 0,
        }
        items.append(item)

    return json.dumps({
        "tasks": items,
        "total": len(items),
    }, ensure_ascii=False)


async def _run_collection_task(
    user_id: uuid.UUID, task_id: str, db: AsyncSession
) -> str:
    from app.models.collection_task import CollectionTask

    result = await db.execute(
        select(CollectionTask).where(
            CollectionTask.id == uuid.UUID(task_id),
            CollectionTask.user_id == user_id,
            CollectionTask.status != "deleted",
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        return json.dumps({"error": "Collection task not found."})

    from app.tasks.collection import execute_collection_task
    celery_task = execute_collection_task.delay(str(task.id))

    return json.dumps({
        "status": "dispatched",
        "task_id": str(task.id),
        "celery_task_id": celery_task.id,
        "message": f"Collection task '{task.name}' has been dispatched for execution.",
    }, ensure_ascii=False)


async def _get_collection_results(
    user_id: uuid.UUID, task_id: str, limit: int, db: AsyncSession
) -> str:
    from app.models.collection_task import CollectionTask, CollectionResult

    # Verify ownership
    task_result = await db.execute(
        select(CollectionTask).where(
            CollectionTask.id == uuid.UUID(task_id),
            CollectionTask.user_id == user_id,
        )
    )
    task = task_result.scalar_one_or_none()
    if not task:
        return json.dumps({"error": "Collection task not found."})

    # Fetch results
    limit = min(limit, 50)
    result = await db.execute(
        select(CollectionResult).where(
            CollectionResult.task_id == uuid.UUID(task_id),
        ).order_by(CollectionResult.created_at.desc()).limit(limit)
    )
    results = result.scalars().all()

    items = []
    for r in results:
        items.append({
            "id": str(r.id),
            "source_url": r.source_url,
            "parsed_data": r.parsed_data,
            "created_at": r.created_at.isoformat(),
        })

    return json.dumps({
        "task_name": task.name,
        "results": items,
        "total_returned": len(items),
    }, ensure_ascii=False)
