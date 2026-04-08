"""Celery beat task for scheduled pipeline execution (Mining → Refinery → Bridge)."""

import asyncio
import logging

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.celery_app import celery_app
from app.core.database import create_task_engine

logger = logging.getLogger(__name__)

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
    name="app.tasks.pipeline_scheduler.check_pipeline_schedules",
    bind=True,
    soft_time_limit=30,
    time_limit=60,
)
def check_pipeline_schedules(self):
    """Check all pipelines with schedule_cron and dispatch if due."""
    return _run_async(_check_pipeline_schedules())


async def _check_pipeline_schedules():
    from datetime import datetime
    from croniter import croniter
    from app.models.pipeline import Pipeline

    engine = _get_scheduler_engine()
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    dispatched = 0
    try:
        async with session_factory() as db:
            result = await db.execute(
                select(Pipeline).where(
                    Pipeline.schedule_cron.isnot(None),
                    Pipeline.status == "active",
                )
            )
            pipelines = result.scalars().all()

            now = datetime.utcnow()

            for pipeline in pipelines:
                try:
                    base_time = pipeline.last_scheduled_at or pipeline.created_at
                    cron = croniter(pipeline.schedule_cron, base_time)
                    next_run = cron.get_next(datetime)

                    if next_run <= now:
                        # Update last_scheduled_at to prevent re-dispatch
                        await db.execute(
                            update(Pipeline)
                            .where(Pipeline.id == pipeline.id)
                            .values(last_scheduled_at=now)
                        )
                        await db.commit()

                        # Dispatch pipeline execution
                        execute_pipeline_chain.delay(str(pipeline.id))
                        dispatched += 1
                        logger.info(
                            "Pipeline scheduler: dispatched pipeline %s (%s), "
                            "next_run=%s, now=%s",
                            pipeline.id, pipeline.name, next_run, now,
                        )
                except (ValueError, KeyError) as e:
                    logger.warning(
                        "Pipeline scheduler: invalid cron '%s' for pipeline %s: %s",
                        pipeline.schedule_cron, pipeline.id, e,
                    )
    finally:
        pass  # Engine is cached at module level

    if dispatched:
        logger.info("Pipeline scheduler: dispatched %d pipelines", dispatched)
    return {"dispatched": dispatched}


@celery_app.task(
    name="app.tasks.pipeline_scheduler.execute_pipeline_chain",
    bind=True,
    soft_time_limit=600,
    time_limit=660,
)
def execute_pipeline_chain(self, pipeline_id: str):
    """Execute full pipeline chain: Mining → Refinery → Bridge."""
    return _run_async(_execute_chain(pipeline_id))


async def _execute_chain(pipeline_id: str):
    """Run all linked stages of a pipeline sequentially."""
    from datetime import datetime
    from app.models.pipeline import Pipeline
    from app.models.collection_task import CollectionTask
    from app.models.pipeline import RefineryRule, BridgeConfig

    engine = _get_scheduler_engine()
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as db:
        pipeline = await db.get(Pipeline, pipeline_id)
        if not pipeline:
            logger.error("Pipeline %s not found", pipeline_id)
            return {"error": "Pipeline not found"}

        results = {"pipeline_id": pipeline_id, "stages": []}

        # Stage 1: Mining
        if pipeline.mining_task_id:
            task = await db.get(CollectionTask, pipeline.mining_task_id)
            if task and task.last_run_status != "running":
                logger.info("Pipeline %s: running mining task %s", pipeline_id, task.id)
                from app.tasks.collection import execute_collection_task
                execute_collection_task.apply(args=[str(task.id)])

                # Poll for completion (max 5 minutes)
                for _ in range(100):
                    await asyncio.sleep(3)
                    await db.refresh(task)
                    if task.last_run_status and task.last_run_status != "running":
                        break

                results["stages"].append({
                    "stage": "mining",
                    "task_id": str(task.id),
                    "status": task.last_run_status,
                })
                logger.info("Pipeline %s: mining completed with status=%s", pipeline_id, task.last_run_status)

        # Stage 2: Refinery
        if pipeline.refinery_rule_id:
            rule = await db.get(RefineryRule, pipeline.refinery_rule_id)
            if rule and rule.last_run_status != "running":
                logger.info("Pipeline %s: running refinery rule %s", pipeline_id, rule.id)
                from app.tasks.refinery import execute_refinery_task
                execute_refinery_task.apply(args=[str(rule.id)])

                for _ in range(100):
                    await asyncio.sleep(3)
                    await db.refresh(rule)
                    if rule.last_run_status and rule.last_run_status != "running":
                        break

                results["stages"].append({
                    "stage": "refinery",
                    "rule_id": str(rule.id),
                    "status": rule.last_run_status,
                })
                logger.info("Pipeline %s: refinery completed with status=%s", pipeline_id, rule.last_run_status)

        # Stage 3: Bridge
        if pipeline.bridge_config_id:
            bridge = await db.get(BridgeConfig, pipeline.bridge_config_id)
            if bridge:
                logger.info("Pipeline %s: running bridge config %s", pipeline_id, bridge.id)
                from app.tasks.bridge import execute_bridge_task
                execute_bridge_task.apply(args=[str(bridge.id)])

                results["stages"].append({
                    "stage": "bridge",
                    "config_id": str(bridge.id),
                    "status": "dispatched",
                })
                logger.info("Pipeline %s: bridge dispatched", pipeline_id)

        return results
