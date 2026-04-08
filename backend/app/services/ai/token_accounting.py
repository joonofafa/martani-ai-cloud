"""Centralized token quota checking and usage recording."""

import logging
from datetime import date

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User

logger = logging.getLogger(__name__)

# Fireworks whisper charges ~$0.0009/min.
# Map to equivalent tokens so audio fits into the same quota system.
AUDIO_TOKENS_PER_MINUTE = 500


async def check_quota(db: AsyncSession, user_id) -> tuple[bool, str | None]:
    """Check if user has remaining token quota. Auto-resets monthly.

    Returns (allowed, error_message).
    Admin users are never blocked.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return False, "사용자를 찾을 수 없습니다."

    # Auto-reset on month change
    first_of_month = date.today().replace(day=1)
    if user.token_reset_date < first_of_month:
        user.tokens_used_month = 0
        user.token_reset_date = first_of_month
        await db.flush()

    if user.role != "admin" and user.tokens_used_month >= user.token_quota:
        msg = (
            "AI 비서의 월별 사용 한도가 초과되었습니다.\n\n"
            "다음 달 1일에 자동으로 초기화되며, "
            "요금제 페이지에서 더 높은 요금제로 변경하시면 한도를 늘릴 수 있습니다.\n\n"
            "\U0001F449 [요금제 변경](/billing)"
        )
        return False, msg

    return True, None


async def record_usage(
    db: AsyncSession,
    user_id,
    input_tokens: int = 0,
    output_tokens: int = 0,
    source: str = "chat",
) -> None:
    """Record token usage against user's monthly quota.

    Uses SQL-level increment to avoid race conditions.
    Caller should commit the transaction.
    """
    total = input_tokens + output_tokens
    if total <= 0:
        return

    await db.execute(
        update(User)
        .where(User.id == user_id)
        .values(tokens_used_month=User.tokens_used_month + total)
    )

    # Also record to audit_logs for per-source statistics
    try:
        from app.services.audit_service import write_audit_log
        await write_audit_log(
            user_id=user_id,
            action="token_usage",
            resource_type=source,
            detail={
                "source": source,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
            },
            db=db,
        )
    except Exception as e:
        logger.warning("Failed to write token audit log: %s", e)

    logger.debug("Token usage recorded: user=%s source=%s tokens=%d", user_id, source, total)


def estimate_audio_tokens(duration_seconds: float) -> int:
    """Convert audio duration to equivalent token count for quota purposes."""
    minutes = duration_seconds / 60.0
    return max(1, int(minutes * AUDIO_TOKENS_PER_MINUTE))
