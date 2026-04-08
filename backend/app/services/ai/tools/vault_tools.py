"""Vault tool implementations."""

import json
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.ai.tools.core import _human_size


async def _list_vault_files(user_id: uuid.UUID, db: AsyncSession) -> str:
    from app.models.vault import FileVault

    result = await db.execute(
        select(FileVault).where(
            FileVault.user_id == user_id,
        ).order_by(FileVault.created_at.desc())
    )
    files = result.scalars().all()

    if not files:
        return json.dumps({
            "message": "No files backed up in the file vault.",
            "files": [],
        }, ensure_ascii=False)

    items = []
    for f in files:
        items.append({
            "id": str(f.id),
            "filename": f.original_filename,
            "size": f.original_size,
            "size_display": _human_size(f.original_size),
            "mime_type": f.original_mime_type,
            "original_folder": f.original_folder,
            "backup_date": f.created_at.isoformat(),
        })

    data = json.dumps({
        "message": f"{len(items)} file(s) backed up in the file vault.",
        "files": items,
    }, ensure_ascii=False)
    return f"{data}\n\nDo not show the raw JSON above. Summarize in a user-friendly format. Naturally describe file names, sizes, original folders, backup dates, etc."
