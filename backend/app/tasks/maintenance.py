"""Maintenance tasks — periodic cleanup jobs."""

import logging
from datetime import datetime, timedelta

from sqlalchemy import delete

from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.maintenance.cleanup_old_audit_logs")
def cleanup_old_audit_logs(retention_days: int = 90):
    """Delete audit log entries older than retention_days."""
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from app.core.config import get_settings
    from app.models.audit_log import AuditLog

    settings = get_settings()
    # Use sync engine with NullPool for Celery worker
    from sqlalchemy.pool import NullPool
    sync_url = settings.database_url.replace("+asyncpg", "")
    engine = create_engine(sync_url, poolclass=NullPool)

    cutoff = datetime.utcnow() - timedelta(days=retention_days)

    with Session(engine) as session:
        result = session.execute(
            delete(AuditLog).where(AuditLog.created_at < cutoff)
        )
        deleted_count = result.rowcount
        session.commit()

    engine.dispose()
    logger.info("Cleaned up %d audit log entries older than %d days", deleted_count, retention_days)
    return {"deleted": deleted_count}
