"""Audit logging service — fire-and-forget activity recording."""

import logging
from uuid import UUID

from starlette.requests import Request

from app.core.database import AsyncSessionLocal
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


def _extract_ip(request: Request | None, ip_override: str | None = None) -> str | None:
    """Extract client IP from request, handling X-Forwarded-For (Apache reverse proxy)."""
    if ip_override:
        return ip_override
    if not request:
        return None
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def _extract_ua(request: Request | None, ua_override: str | None = None) -> str | None:
    """Extract user-agent string from request."""
    if ua_override:
        return ua_override
    if not request:
        return None
    ua = request.headers.get("User-Agent", "")
    return ua[:500] if ua else None


async def write_audit_log(
    *,
    user_id: UUID | str | None,
    action: str,
    resource_type: str | None = None,
    resource_id: str | None = None,
    detail: dict | None = None,
    request: Request | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    """Write an audit log entry using an independent DB session.

    This function is designed to never raise — any failure is silently logged
    so that audit logging never breaks the calling code path.
    """
    try:
        uid = UUID(str(user_id)) if user_id else None
        ip = _extract_ip(request, ip_address)
        ua = _extract_ua(request, user_agent)

        async with AsyncSessionLocal() as session:
            log = AuditLog(
                user_id=uid,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                detail=detail,
                ip_address=ip,
                user_agent=ua,
            )
            session.add(log)
            await session.commit()
    except Exception:
        logger.debug("Failed to write audit log: action=%s", action, exc_info=True)
