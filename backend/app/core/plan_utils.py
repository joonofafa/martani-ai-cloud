"""Shared plan/tier utility functions."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.settings import SystemSettings, SettingsKeys

# Default tier quotas (bytes / tokens)
FREE_STORAGE_DEFAULT = 1 * 1024 * 1024 * 1024          # 1 GB
FREE_TOKEN_DEFAULT = 500_000
BASIC_STORAGE_DEFAULT = 10 * 1024 * 1024 * 1024        # 10 GB
BASIC_TOKEN_DEFAULT = 5_000_000
PRO_STORAGE_DEFAULT = 100 * 1024 * 1024 * 1024         # 100 GB
PRO_TOKEN_DEFAULT = 50_000_000

_PLAN_KEYS = {
    "free": (SettingsKeys.FREE_STORAGE_QUOTA, SettingsKeys.FREE_TOKEN_QUOTA,
             FREE_STORAGE_DEFAULT, FREE_TOKEN_DEFAULT),
    "basic": (SettingsKeys.BASIC_STORAGE_QUOTA, SettingsKeys.BASIC_TOKEN_QUOTA,
              BASIC_STORAGE_DEFAULT, BASIC_TOKEN_DEFAULT),
    "pro": (SettingsKeys.PRO_STORAGE_QUOTA, SettingsKeys.PRO_TOKEN_QUOTA,
            PRO_STORAGE_DEFAULT, PRO_TOKEN_DEFAULT),
}


async def tier_defaults(db: AsyncSession, plan: str) -> tuple[int, int]:
    """Return (storage_quota, token_quota) for a given plan from DB settings."""
    sq_key, tq_key, sq_default, tq_default = _PLAN_KEYS.get(
        plan, _PLAN_KEYS["free"]
    )

    sq_result = await db.execute(select(SystemSettings).where(SystemSettings.key == sq_key))
    sq_setting = sq_result.scalar_one_or_none()
    storage_quota = int(sq_setting.value) if sq_setting and sq_setting.value else sq_default

    tq_result = await db.execute(select(SystemSettings).where(SystemSettings.key == tq_key))
    tq_setting = tq_result.scalar_one_or_none()
    token_quota = int(tq_setting.value) if tq_setting and tq_setting.value else tq_default

    return storage_quota, token_quota
