"""Admin audit-log & usage-stats API."""

from datetime import datetime, timedelta
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case, cast, Date
from pydantic import BaseModel

from app.core.database import get_db
from app.api.admin import require_admin
from app.models.user import User
from app.models.audit_log import AuditLog

router = APIRouter(prefix="/admin/logs", tags=["admin-logs"])


# ============== Schemas ==============

class AuditLogItem(BaseModel):
    id: str
    user_id: str | None
    user_email: str | None
    user_name: str | None
    action: str
    resource_type: str | None
    resource_id: str | None
    detail: dict | None
    ip_address: str | None
    user_agent: str | None
    created_at: str


class AuditLogPage(BaseModel):
    items: list[AuditLogItem]
    total: int
    page: int
    limit: int


class DailyStats(BaseModel):
    date: str
    dau: int
    file_uploads: int
    file_upload_bytes: int
    file_downloads: int
    chat_messages: int
    chat_tokens: int
    webdav_ops: int


# ============== Endpoints ==============

@router.get("/activity", response_model=AuditLogPage)
async def get_activity_logs(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    action: Optional[str] = Query(default=None),
    user_id: Optional[UUID] = Query(default=None),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Paginated activity logs with filters."""
    # Base query
    conditions = []
    if action:
        conditions.append(AuditLog.action == action)
    if user_id:
        conditions.append(AuditLog.user_id == user_id)
    if date_from:
        try:
            dt_from = datetime.fromisoformat(date_from)
            conditions.append(AuditLog.created_at >= dt_from)
        except ValueError:
            pass
    if date_to:
        try:
            dt_to = datetime.fromisoformat(date_to)
            conditions.append(AuditLog.created_at <= dt_to)
        except ValueError:
            pass

    # Count total
    count_q = select(func.count(AuditLog.id))
    for c in conditions:
        count_q = count_q.where(c)
    total = (await db.execute(count_q)).scalar() or 0

    # Fetch page with LEFT JOIN to users
    q = (
        select(AuditLog, User.email, User.name)
        .outerjoin(User, AuditLog.user_id == User.id)
        .order_by(AuditLog.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    for c in conditions:
        q = q.where(c)
    rows = (await db.execute(q)).all()

    items = [
        AuditLogItem(
            id=str(log.id),
            user_id=str(log.user_id) if log.user_id else None,
            user_email=email,
            user_name=name,
            action=log.action,
            resource_type=log.resource_type,
            resource_id=log.resource_id,
            detail=log.detail,
            ip_address=log.ip_address,
            user_agent=log.user_agent,
            created_at=log.created_at.isoformat(),
        )
        for log, email, name in rows
    ]

    return AuditLogPage(items=items, total=total, page=page, limit=limit)


@router.get("/stats", response_model=list[DailyStats])
async def get_usage_stats(
    days: int = Query(default=30, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Daily aggregated usage statistics."""
    since = datetime.utcnow() - timedelta(days=days)
    day_col = cast(AuditLog.created_at, Date).label("day")

    q = (
        select(
            day_col,
            func.count(func.distinct(AuditLog.user_id)).label("dau"),
            func.count(case((AuditLog.action.in_(["file_upload", "webdav_upload"]), 1))).label("file_uploads"),
            func.coalesce(
                func.sum(case(
                    (AuditLog.action.in_(["file_upload", "webdav_upload"]),
                     func.coalesce(AuditLog.detail["size"].as_integer(), 0)),
                    else_=0,
                )),
                0,
            ).label("file_upload_bytes"),
            func.count(case((AuditLog.action.in_(["file_download", "webdav_download"]), 1))).label("file_downloads"),
            func.count(case((AuditLog.action == "chat_message", 1))).label("chat_messages"),
            func.coalesce(
                func.sum(case(
                    (AuditLog.action == "chat_message",
                     func.coalesce(AuditLog.detail["input_tokens"].as_integer(), 0)
                     + func.coalesce(AuditLog.detail["output_tokens"].as_integer(), 0)),
                    else_=0,
                )),
                0,
            ).label("chat_tokens"),
            func.count(case((AuditLog.action.in_([
                "webdav_upload", "webdav_download", "webdav_delete", "webdav_copy", "webdav_move",
            ]), 1))).label("webdav_ops"),
        )
        .where(AuditLog.created_at >= since)
        .group_by(day_col)
        .order_by(day_col)
    )

    rows = (await db.execute(q)).all()

    return [
        DailyStats(
            date=str(r.day),
            dau=r.dau,
            file_uploads=r.file_uploads,
            file_upload_bytes=r.file_upload_bytes,
            file_downloads=r.file_downloads,
            chat_messages=r.chat_messages,
            chat_tokens=r.chat_tokens,
            webdav_ops=r.webdav_ops,
        )
        for r in rows
    ]


@router.get("/users/{user_id}/activity", response_model=AuditLogPage)
async def get_user_activity(
    user_id: UUID,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    """Activity logs for a specific user."""
    count_q = select(func.count(AuditLog.id)).where(AuditLog.user_id == user_id)
    total = (await db.execute(count_q)).scalar() or 0

    q = (
        select(AuditLog, User.email, User.name)
        .outerjoin(User, AuditLog.user_id == User.id)
        .where(AuditLog.user_id == user_id)
        .order_by(AuditLog.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    rows = (await db.execute(q)).all()

    items = [
        AuditLogItem(
            id=str(log.id),
            user_id=str(log.user_id) if log.user_id else None,
            user_email=email,
            user_name=name,
            action=log.action,
            resource_type=log.resource_type,
            resource_id=log.resource_id,
            detail=log.detail,
            ip_address=log.ip_address,
            user_agent=log.user_agent,
            created_at=log.created_at.isoformat(),
        )
        for log, email, name in rows
    ]

    return AuditLogPage(items=items, total=total, page=page, limit=limit)
