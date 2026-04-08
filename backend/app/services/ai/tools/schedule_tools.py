"""Schedule task tool implementations."""

import json
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


async def _list_schedule_tasks(user_id: uuid.UUID, days_ahead: int, db: AsyncSession) -> str:
    from app.models.schedule_task import ScheduleTask

    days_ahead = min(max(days_ahead, 1), 30)
    now = datetime.utcnow()
    end = now + timedelta(days=days_ahead)

    result = await db.execute(
        select(ScheduleTask).where(
            ScheduleTask.user_id == user_id,
            ScheduleTask.scheduled_at <= end,
        ).order_by(ScheduleTask.scheduled_at.asc()).limit(50)
    )
    tasks = result.scalars().all()

    if not tasks:
        return json.dumps({"message": "No scheduled tasks found.", "tasks": []}, ensure_ascii=False)

    items = []
    for t in tasks:
        item = {
            "id": str(t.id),
            "name": t.name,
            "prompt": t.prompt[:200],
            "scheduled_at": t.scheduled_at.isoformat() if t.scheduled_at else None,
            "status": t.status,
            "is_enabled": t.is_enabled,
        }
        if t.repeat_type:
            item["repeat_type"] = t.repeat_type
        if t.cron_expression:
            item["cron_expression"] = t.cron_expression
        if t.last_run_at:
            item["last_run_at"] = t.last_run_at.isoformat()
        items.append(item)

    return json.dumps({
        "message": f"{len(items)} scheduled task(s) found.",
        "tasks": items,
    }, ensure_ascii=False)


def _interval_to_cron(interval_minutes: int) -> str:
    """Convert interval_minutes to a cron expression."""
    if interval_minutes <= 0:
        return ""
    if interval_minutes < 60:
        return f"*/{interval_minutes} * * * *"
    hours = interval_minutes // 60
    if hours < 24:
        return f"0 */{hours} * * *"
    return f"0 0 */{hours // 24} * *"


async def _create_schedule_task(user_id: uuid.UUID, args: dict, db: AsyncSession) -> str:
    from app.models.schedule_task import ScheduleTask

    try:
        scheduled_at = datetime.fromisoformat(args["scheduled_at"])
    except (ValueError, KeyError):
        scheduled_at = datetime.now()

    # If scheduled_at is in the past, use current time
    if scheduled_at < datetime.now() - timedelta(hours=1):
        scheduled_at = datetime.now()

    # Convert interval_minutes -> cron_expression internally
    interval_minutes = args.get("interval_minutes")
    cron_expression = None
    repeat_type = args.get("repeat_type")

    if interval_minutes and int(interval_minutes) > 0:
        cron_expression = _interval_to_cron(int(interval_minutes))
        repeat_type = None  # cron takes priority
    elif repeat_type == "hourly":
        cron_expression = f"0 * * * *"
        repeat_type = None

    task = ScheduleTask(
        user_id=user_id,
        name=args.get("name", "Untitled Task"),
        prompt=args["prompt"],
        scheduled_at=scheduled_at,
        repeat_type=repeat_type,
        cron_expression=cron_expression,
    )
    db.add(task)
    await db.flush()

    result = {
        "id": str(task.id),
        "name": task.name,
        "scheduled_at": task.scheduled_at.isoformat(),
        "message": f"Schedule task '{task.name}' has been created.",
    }
    if task.repeat_type:
        result["repeat_type"] = task.repeat_type
    if task.cron_expression:
        result["repeat_interval"] = task.cron_expression

    return json.dumps(result, ensure_ascii=False)


async def _update_schedule_task(user_id: uuid.UUID, task_id: str, args: dict, db: AsyncSession) -> str:
    from app.models.schedule_task import ScheduleTask

    result = await db.execute(
        select(ScheduleTask).where(
            ScheduleTask.id == uuid.UUID(task_id),
            ScheduleTask.user_id == user_id,
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        return json.dumps({"error": "Schedule task not found."})

    if "name" in args and args["name"] is not None:
        task.name = args["name"]
    if "prompt" in args and args["prompt"] is not None:
        task.prompt = args["prompt"]
    if "scheduled_at" in args and args["scheduled_at"] is not None:
        try:
            task.scheduled_at = datetime.fromisoformat(args["scheduled_at"])
        except ValueError:
            return json.dumps({"error": "Invalid scheduled_at format."})
    if "interval_minutes" in args:
        mins = int(args["interval_minutes"]) if args["interval_minutes"] else 0
        if mins > 0:
            task.cron_expression = _interval_to_cron(mins)
            task.repeat_type = None
        else:
            task.cron_expression = None
    if "repeat_type" in args:
        rt = args["repeat_type"]
        if rt == "hourly":
            task.cron_expression = "0 * * * *"
            task.repeat_type = None
        elif rt:
            task.repeat_type = rt
            if "interval_minutes" not in args:
                task.cron_expression = None
        else:
            task.repeat_type = None
    if "is_enabled" in args and args["is_enabled"] is not None:
        task.is_enabled = args["is_enabled"]

    task.updated_at = datetime.utcnow()
    await db.flush()

    return json.dumps({
        "id": str(task.id),
        "name": task.name,
        "message": f"Schedule task '{task.name}' has been updated.",
    }, ensure_ascii=False)


async def _delete_schedule_task(user_id: uuid.UUID, task_id: str, db: AsyncSession) -> str:
    from app.models.schedule_task import ScheduleTask

    result = await db.execute(
        select(ScheduleTask).where(
            ScheduleTask.id == uuid.UUID(task_id),
            ScheduleTask.user_id == user_id,
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        return json.dumps({"error": "Schedule task not found."})

    name = task.name
    await db.delete(task)
    await db.flush()

    return json.dumps({"message": f"Schedule task '{name}' has been deleted."}, ensure_ascii=False)
