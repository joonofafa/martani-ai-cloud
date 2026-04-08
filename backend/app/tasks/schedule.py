"""Celery tasks for schedule task execution."""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from uuid import UUID

from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy import select, update

from app.core.config import get_settings
from app.core.celery_app import celery_app
from app.core.database import create_task_engine

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Run an async coroutine in a new event loop (for Celery sync tasks)."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(
    name="app.tasks.schedule.check_schedule_tasks_task",
    bind=True,
    max_retries=0,
    soft_time_limit=120,
)
def check_schedule_tasks_task(self):
    """Check for due schedule tasks and dispatch execution."""
    _run_async(_check_schedule_tasks_async())


async def _check_schedule_tasks_async():
    """Find and execute due schedule tasks."""
    engine = create_task_engine()
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with async_session() as db:
            from app.models.schedule_task import ScheduleTask

            now = datetime.now(timezone.utc)

            # Recover stuck tasks: running for over 15 minutes → reset to pending
            stuck_cutoff = now - timedelta(minutes=15)
            stuck_result = await db.execute(
                update(ScheduleTask)
                .where(
                    ScheduleTask.is_enabled == True,
                    ScheduleTask.status == "running",
                    ScheduleTask.scheduled_at <= stuck_cutoff,
                )
                .values(status="pending")
                .returning(ScheduleTask.id, ScheduleTask.name)
            )
            stuck_tasks = stuck_result.all()
            if stuck_tasks:
                await db.commit()
                for st in stuck_tasks:
                    logger.warning("Recovered stuck schedule task: %s (%s)", st.name, st.id)

            # Find tasks that are due: scheduled_at <= now, enabled, pending status
            result = await db.execute(
                select(ScheduleTask).where(
                    ScheduleTask.is_enabled == True,
                    ScheduleTask.status == "pending",
                    ScheduleTask.scheduled_at <= now,
                )
            )
            tasks = result.scalars().all()

            for task in tasks:
                try:
                    # Mark as running
                    task.status = "running"
                    await db.flush()
                    await db.commit()

                    # Dispatch execution
                    execute_schedule_task.delay(str(task.id))
                    logger.info("Dispatched schedule task: %s (%s)", task.name, task.id)

                except Exception as e:
                    logger.error("Failed to dispatch schedule task %s: %s", task.id, e)
    finally:
        await engine.dispose()


@celery_app.task(
    name="app.tasks.schedule.execute_schedule_task",
    bind=True,
    max_retries=1,
    soft_time_limit=600,
)
def execute_schedule_task(self, task_id: str):
    """Execute a schedule task by running the agent."""
    _run_async(_execute_schedule_task_async(task_id))


async def _execute_schedule_task_async(task_id: str):
    """Run the agent for a schedule task."""
    engine = create_task_engine()
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with async_session() as db:
            from app.models.schedule_task import ScheduleTask
            from app.models.chat import ChatSession, ChatMessage, MessageRole
            from app.services.ai.agent_executor import run_agent
            from app.core.settings_manager import load_settings_from_db

            result = await db.execute(
                select(ScheduleTask).where(ScheduleTask.id == UUID(task_id))
            )
            task = result.scalar_one_or_none()
            if not task:
                logger.error("Schedule task not found: %s", task_id)
                return

            # Cache ALL ORM attributes upfront — run_agent() uses the same
            # db session and its internal commits expire ORM state, making
            # lazy loads impossible (MissingGreenlet in async context).
            task_name = task.name
            task_user_id = task.user_id
            task_prompt = task.prompt
            task_repeat_type = task.repeat_type
            task_cron_expression = task.cron_expression
            task_scheduled_at = task.scheduled_at
            is_repeating = bool(
                (task_repeat_type or task_cron_expression) and task.is_enabled
            )

            try:
                # Create or reuse chat session
                if task.session_id:
                    session_result = await db.execute(
                        select(ChatSession).where(
                            ChatSession.id == task.session_id,
                            ChatSession.deleted_at.is_(None),
                        )
                    )
                    session = session_result.scalar_one_or_none()
                else:
                    session = None

                if not session:
                    dyn = await load_settings_from_db(db)
                    session = ChatSession(
                        user_id=task_user_id,
                        title=f"[Schedule] {task_name}",
                        model=dyn.openrouter_model if dyn.llm_provider == "openrouter" else dyn.ollama_model,
                        agent_type="file-manager",
                    )
                    db.add(session)
                    await db.flush()
                    task.session_id = session.id

                # Save user message
                user_msg = ChatMessage(
                    session_id=session.id,
                    role=MessageRole.USER,
                    content=task_prompt,
                    source="schedule",
                    source_id=str(task.id),
                )
                db.add(user_msg)
                await db.flush()
                await db.commit()

                # Run agent
                async def on_event(event: dict):
                    pass  # No real-time events for background tasks

                await run_agent(
                    db=db,
                    user_id=task_user_id,
                    prompt=task_prompt,
                    session_id=session.id,
                    source="schedule",
                    source_id=task.id,
                    on_event=on_event,
                    skip_user_message=True,
                )
                final_status = "completed"

            except Exception as e:
                logger.error("Schedule task failed: %s (%s): %s", task_name, task_id, e)
                final_status = "failed"

            # Update task status via raw SQL — ORM attributes are expired
            # after run_agent's internal commits, so avoid ORM access entirely.
            try:
                await db.rollback()  # clear any dirty state
                update_values = {
                    "status": final_status,
                    "last_run_at": datetime.utcnow(),
                }
                if is_repeating:
                    next_at = _compute_next_run(
                        task_cron_expression, task_repeat_type, task_scheduled_at,
                    )
                    update_values["status"] = "pending"
                    update_values["scheduled_at"] = next_at
                await db.execute(
                    update(ScheduleTask)
                    .where(ScheduleTask.id == UUID(task_id))
                    .values(**update_values)
                )
                await db.commit()
                logger.info(
                    "Schedule task %s: %s (%s)", final_status, task_name, task_id,
                )
            except Exception as update_e:
                logger.error("Failed to update task status: %s", update_e)
    finally:
        await engine.dispose()


def _compute_next_run(cron_expression, repeat_type, scheduled_at):
    """Pure function: compute next scheduled_at from cached values."""
    now = datetime.now(timezone.utc)

    if cron_expression:
        try:
            from croniter import croniter
            cron = croniter(cron_expression, now)
            return cron.get_next(datetime)
        except Exception:
            pass

    next_at = scheduled_at
    increments = {"daily": timedelta(days=1), "weekly": timedelta(weeks=1), "monthly": timedelta(days=30)}
    delta = increments.get(repeat_type)
    if not delta:
        return now + timedelta(minutes=10)  # fallback

    next_at = next_at + delta
    while next_at <= now:
        next_at = next_at + delta

    return next_at
