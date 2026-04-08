"""Celery application configuration."""

from celery import Celery
from celery.schedules import crontab
from app.core.config import get_settings

settings = get_settings()

celery_app = Celery(
    "martani",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.indexing", "app.tasks.chat", "app.tasks.maintenance", "app.tasks.schedule", "app.tasks.collection", "app.tasks.refinery", "app.tasks.bridge", "app.tasks.mining_scheduler", "app.tasks.pipeline_scheduler"],
)

celery_app.conf.update(
    worker_prefetch_multiplier=1,
    task_track_started=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Seoul",
    task_routes={
        # Audio indexing now uses whisper.cpp HTTP server — no GPU queue needed
        "app.tasks.chat.process_chat_message_task": {"queue": "chat"},
    },
    beat_schedule={
        "schedule-pending-indexing": {
            "task": "app.tasks.indexing.schedule_pending_indexing_task",
            "schedule": 300.0,  # every 5 minutes
        },
        "cleanup-old-audit-logs": {
            "task": "app.tasks.maintenance.cleanup_old_audit_logs",
            "schedule": crontab(hour=3, minute=0),  # daily at 03:00
        },
        "check-schedule-tasks": {
            "task": "app.tasks.schedule.check_schedule_tasks_task",
            "schedule": 60.0,  # every 1 minute
        },
        "check-mining-schedules": {
            "task": "app.tasks.mining_scheduler.check_mining_schedules",
            "schedule": 60.0,  # every 1 minute
        },
        "check-pipeline-schedules": {
            "task": "app.tasks.pipeline_scheduler.check_pipeline_schedules",
            "schedule": 60.0,  # every 1 minute
        },
        "check-audio-batch-jobs": {
            "task": "app.tasks.indexing.check_audio_batch_jobs_task",
            "schedule": 300.0,  # every 5 minutes
        },
    },
)
