"""Shared utilities used across tool modules."""

import re as _re
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file import File
from app.services.tool_registry_service import get_tool_label  # noqa: F401 – re-export


# ── Agent file naming convention ──

AGENT_FOLDER = "/AI Agent"

_FILENAME_UNSAFE_RE = _re.compile(r'[^\w가-힣\s.-]')


def _agent_filename(prompt: str, ext: str) -> str:
    """Generate agent filename: {prompt_15chars}_{YYmmddhhmmss}.{ext}"""
    clean = _FILENAME_UNSAFE_RE.sub('', prompt).strip()
    prefix = clean[:15].strip() or "AI_task"
    ts = datetime.now().strftime("%y%m%d%H%M%S")
    ext = ext.lstrip('.')
    return f"{prefix}_{ts}.{ext}"


async def _ensure_agent_folder(user_id: uuid.UUID, db: AsyncSession) -> None:
    """Create /AI Agent folder if it doesn't exist."""
    result = await db.execute(
        select(File).where(
            File.user_id == user_id,
            File.folder == "/",
            File.original_filename == "AI Agent",
            File.mime_type == "application/x-folder",
            File.deleted_at.is_(None),
        )
    )
    if not result.scalar_one_or_none():
        db.add(File(
            user_id=user_id,
            filename=".folder",
            original_filename="AI Agent",
            mime_type="application/x-folder",
            size=0,
            storage_path="",
            folder="/",
        ))
        await db.flush()


def _human_size(size_bytes: int) -> str:
    """Convert bytes to human-readable string."""
    if size_bytes >= 1024 * 1024 * 1024:
        return f"{size_bytes / 1024 / 1024 / 1024:.1f} GB"
    elif size_bytes >= 1024 * 1024:
        return f"{size_bytes / 1024 / 1024:.1f} MB"
    elif size_bytes >= 1024:
        return f"{size_bytes / 1024:.1f} KB"
    return f"{size_bytes} B"
