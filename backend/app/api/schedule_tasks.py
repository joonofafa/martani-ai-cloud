"""Schedule Tasks CRUD endpoints."""

import uuid
import json
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.schedule_task import ScheduleTask

logger = logging.getLogger(__name__)

router = APIRouter()


class ScheduleTaskCreate(BaseModel):
    name: str | None = None
    prompt: str
    scheduled_at: str  # ISO 8601
    repeat_type: str | None = None
    cron_expression: str | None = None
    summary: str | None = None
    tools_predicted: list[str] | None = None


class ScheduleTaskUpdate(BaseModel):
    name: str | None = None
    prompt: str | None = None
    scheduled_at: str | None = None
    repeat_type: str | None = None
    cron_expression: str | None = None
    is_enabled: bool | None = None


class AnalyzeRequest(BaseModel):
    prompt: str


@router.get("/tasks")
async def list_tasks(
    week_start: str | None = Query(None, description="ISO date for week start (Monday), defaults to this week"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List schedule tasks for the current user within a week window."""
    from datetime import timezone

    if week_start:
        start = datetime.fromisoformat(week_start)
    else:
        now = datetime.now(timezone.utc)
        # Calculate start of current week (Monday)
        start = now - timedelta(days=now.weekday())
        start = start.replace(hour=0, minute=0, second=0, microsecond=0)

    end = start + timedelta(days=7)

    from sqlalchemy import or_, and_

    result = await db.execute(
        select(ScheduleTask).where(
            ScheduleTask.user_id == current_user.id,
            or_(
                # One-time tasks: filter by week window
                and_(
                    ScheduleTask.repeat_type.is_(None),
                    ScheduleTask.cron_expression.is_(None),
                    ScheduleTask.scheduled_at >= start,
                    ScheduleTask.scheduled_at < end,
                ),
                # Recurring tasks: always show
                ScheduleTask.repeat_type.isnot(None),
                ScheduleTask.cron_expression.isnot(None),
            ),
        ).order_by(ScheduleTask.scheduled_at.asc())
    )
    tasks = result.scalars().all()

    return [
        {
            "id": str(t.id),
            "name": t.name,
            "prompt": t.prompt,
            "summary": t.summary,
            "tools_predicted": t.tools_predicted or [],
            "scheduled_at": t.scheduled_at.isoformat() if t.scheduled_at else None,
            "repeat_type": t.repeat_type,
            "cron_expression": t.cron_expression,
            "is_enabled": t.is_enabled,
            "status": t.status,
            "last_run_at": t.last_run_at.isoformat() if t.last_run_at else None,
            "session_id": str(t.session_id) if t.session_id else None,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in tasks
    ]


@router.post("/tasks", status_code=status.HTTP_201_CREATED)
async def create_task(
    data: ScheduleTaskCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new schedule task."""
    scheduled_at = datetime.fromisoformat(data.scheduled_at)

    task = ScheduleTask(
        user_id=current_user.id,
        name=data.name or "Untitled Task",
        prompt=data.prompt,
        summary=data.summary,
        tools_predicted=data.tools_predicted,
        scheduled_at=scheduled_at,
        repeat_type=data.repeat_type,
        cron_expression=data.cron_expression,
    )
    db.add(task)
    await db.flush()
    await db.commit()

    return {
        "id": str(task.id),
        "name": task.name,
        "prompt": task.prompt,
        "summary": task.summary,
        "tools_predicted": task.tools_predicted or [],
        "scheduled_at": task.scheduled_at.isoformat(),
        "repeat_type": task.repeat_type,
        "cron_expression": task.cron_expression,
        "is_enabled": task.is_enabled,
        "status": task.status,
        "last_run_at": None,
        "session_id": None,
        "created_at": task.created_at.isoformat() if task.created_at else None,
    }


@router.get("/tasks/{task_id}")
async def get_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single schedule task."""
    result = await db.execute(
        select(ScheduleTask).where(
            ScheduleTask.id == task_id,
            ScheduleTask.user_id == current_user.id,
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    return {
        "id": str(task.id),
        "name": task.name,
        "prompt": task.prompt,
        "summary": task.summary,
        "tools_predicted": task.tools_predicted or [],
        "scheduled_at": task.scheduled_at.isoformat() if task.scheduled_at else None,
        "repeat_type": task.repeat_type,
        "cron_expression": task.cron_expression,
        "is_enabled": task.is_enabled,
        "status": task.status,
        "last_run_at": task.last_run_at.isoformat() if task.last_run_at else None,
        "session_id": str(task.session_id) if task.session_id else None,
        "created_at": task.created_at.isoformat() if task.created_at else None,
    }


@router.patch("/tasks/{task_id}")
async def update_task(
    task_id: uuid.UUID,
    data: ScheduleTaskUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a schedule task."""
    result = await db.execute(
        select(ScheduleTask).where(
            ScheduleTask.id == task_id,
            ScheduleTask.user_id == current_user.id,
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if data.name is not None:
        task.name = data.name
    if data.prompt is not None:
        task.prompt = data.prompt
    if data.scheduled_at is not None:
        task.scheduled_at = datetime.fromisoformat(data.scheduled_at)
    if data.repeat_type is not None:
        task.repeat_type = data.repeat_type if data.repeat_type else None
    if data.cron_expression is not None:
        task.cron_expression = data.cron_expression if data.cron_expression else None
    if data.is_enabled is not None:
        task.is_enabled = data.is_enabled

    await db.flush()
    await db.commit()

    return {
        "id": str(task.id),
        "name": task.name,
        "prompt": task.prompt,
        "summary": task.summary,
        "tools_predicted": task.tools_predicted or [],
        "scheduled_at": task.scheduled_at.isoformat() if task.scheduled_at else None,
        "repeat_type": task.repeat_type,
        "cron_expression": task.cron_expression,
        "is_enabled": task.is_enabled,
        "status": task.status,
        "last_run_at": task.last_run_at.isoformat() if task.last_run_at else None,
        "session_id": str(task.session_id) if task.session_id else None,
        "created_at": task.created_at.isoformat() if task.created_at else None,
    }


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a schedule task."""
    result = await db.execute(
        select(ScheduleTask).where(
            ScheduleTask.id == task_id,
            ScheduleTask.user_id == current_user.id,
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    await db.delete(task)
    await db.commit()


@router.post("/analyze")
async def analyze_prompt(
    data: AnalyzeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Analyze a prompt to predict required tools and generate a summary."""
    from app.services.ai.llm_service import get_llm_service

    llm = await get_llm_service(db)

    analysis_prompt = (
        "You are a task analysis assistant. Given a user's task description, determine:\n"
        "1. Whether this is an actionable task that an AI agent can execute using tools\n"
        "2. A short name for the task (max 50 chars, in Korean)\n"
        "3. A brief summary of what will be done (1-2 sentences, in Korean)\n"
        "4. Which tools would be needed from this list:\n"
        "   - web_search, web_fetch, web_screenshot\n"
        "   - browser_navigate, browser_read_page, browser_click, browser_fill, browser_screenshot\n"
        "   - send_mail, list_files, read_file_content, create_text_file\n"
        "   - search_files_by_content, search_files_by_name\n"
        "   - list_notes, create_note, search_notes\n"
        "   - execute_python\n"
        "   - create_collection_task, run_collection_task\n"
        "   - list_schedule_tasks, create_schedule_task\n\n"
        "Respond ONLY with valid JSON in this exact format:\n"
        '{"actionable": true/false, "name": "...", "summary": "...", "tools": ["tool1", "tool2"], "reason": "..."}\n'
        "If not actionable, set actionable=false and explain in reason.\n"
    )

    try:
        response = await llm.chat(
            messages=[{"role": "user", "content": data.prompt}],
            system_prompt=analysis_prompt,
            temperature=0.3,
            max_tokens=500,
        )

        # Parse JSON from response
        # Strip markdown code fences if present
        text = response.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()

        result = json.loads(text)
        return {
            "actionable": result.get("actionable", True),
            "name": result.get("name", ""),
            "summary": result.get("summary", ""),
            "tools": result.get("tools", []),
            "reason": result.get("reason"),
        }
    except (json.JSONDecodeError, Exception) as e:
        logger.warning("Failed to parse analyze response: %s", e)
        return {
            "actionable": True,
            "name": data.prompt[:50],
            "summary": data.prompt,
            "tools": [],
            "reason": None,
        }
