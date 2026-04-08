"""Celery beat task for scheduled mining (collection) tasks."""

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.celery_app import celery_app
from app.core.database import create_task_engine

logger = logging.getLogger(__name__)

# Module-level cached engine to avoid create/dispose every 60s beat cycle
_scheduler_engine = None


def _get_scheduler_engine():
    global _scheduler_engine
    if _scheduler_engine is None:
        _scheduler_engine = create_task_engine()
    return _scheduler_engine


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(
    name="app.tasks.mining_scheduler.check_mining_schedules",
    bind=True,
    soft_time_limit=30,
    time_limit=60,
)
def check_mining_schedules(self):
    """Check all collection tasks with schedule_cron and dispatch if due."""
    return _run_async(_check_schedules())


async def _check_schedules():
    from datetime import datetime
    from croniter import croniter
    from sqlalchemy import update
    from app.models.collection_task import CollectionTask

    engine = _get_scheduler_engine()
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    dispatched = 0
    try:
        async with session_factory() as db:
            result = await db.execute(
                select(CollectionTask).where(
                    CollectionTask.schedule_cron.isnot(None),
                    CollectionTask.status == "active",
                    CollectionTask.last_run_status.notin_(["running"]),
                )
            )
            tasks = result.scalars().all()

            now = datetime.utcnow()

            for task in tasks:
                try:
                    base_time = task.last_run_at or task.created_at
                    cron = croniter(task.schedule_cron, base_time)
                    next_run = cron.get_next(datetime)

                    if next_run <= now:
                        # Mark as running BEFORE dispatching to prevent race condition
                        await db.execute(
                            update(CollectionTask)
                            .where(CollectionTask.id == task.id)
                            .values(last_run_status="running")
                        )
                        await db.commit()

                        from app.tasks.collection import execute_collection_task
                        execute_collection_task.delay(str(task.id))
                        dispatched += 1
                        logger.info(
                            "Mining scheduler: dispatched task %s (%s), "
                            "next_run=%s, now=%s",
                            task.id, task.name, next_run, now,
                        )
                except (ValueError, KeyError) as e:
                    logger.warning(
                        "Mining scheduler: invalid cron '%s' for task %s: %s",
                        task.schedule_cron, task.id, e,
                    )
    finally:
        pass  # Engine is cached at module level, no dispose needed

    if dispatched:
        logger.info("Mining scheduler: dispatched %d tasks", dispatched)
    return {"dispatched": dispatched}
