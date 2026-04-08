"""Note (StickyNote) tool implementations."""

import json
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.note import StickyNote


async def _list_notes(user_id: uuid.UUID, db: AsyncSession) -> str:
    result = await db.execute(
        select(StickyNote).where(
            StickyNote.user_id == user_id,
            StickyNote.deleted_at.is_(None),
        ).order_by(StickyNote.updated_at.desc())
    )
    notes = result.scalars().all()
    return json.dumps([
        {
            "id": str(n.id),
            "title": n.title,
            "content": n.content[:100],
            "color": n.color,
        }
        for n in notes
    ], ensure_ascii=False)


async def _read_note(user_id: uuid.UUID, note_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(StickyNote).where(
            StickyNote.id == uuid.UUID(note_id),
            StickyNote.user_id == user_id,
            StickyNote.deleted_at.is_(None),
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        return json.dumps({"error": "Note not found."})
    return json.dumps({
        "id": str(note.id),
        "title": note.title,
        "content": note.content,
        "color": note.color,
        "created_at": note.created_at.isoformat(),
    }, ensure_ascii=False)


async def _create_note(
    user_id: uuid.UUID, title: str, content: str, color: str, db: AsyncSession
) -> str:
    note = StickyNote(
        user_id=user_id,
        title=title,
        content=content,
        color=color if color in ("yellow", "green", "pink", "blue", "purple", "orange", "gray") else "yellow",
    )
    db.add(note)
    await db.flush()
    return json.dumps({
        "id": str(note.id),
        "title": title,
        "message": f"Note '{title}' has been created.",
    }, ensure_ascii=False)


async def _delete_note(user_id: uuid.UUID, note_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(StickyNote).where(
            StickyNote.id == uuid.UUID(note_id),
            StickyNote.user_id == user_id,
            StickyNote.deleted_at.is_(None),
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        return json.dumps({"error": "Note not found."})

    note.deleted_at = datetime.utcnow()
    await db.flush()
    return json.dumps({"message": f"Note '{note.title}' has been deleted."}, ensure_ascii=False)


async def _update_note(user_id: uuid.UUID, note_id: str, args: dict, db: AsyncSession) -> str:
    result = await db.execute(
        select(StickyNote).where(
            StickyNote.id == uuid.UUID(note_id),
            StickyNote.user_id == user_id,
            StickyNote.deleted_at.is_(None),
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        return json.dumps({"error": "Note not found."})

    valid_colors = ("yellow", "green", "pink", "blue", "purple", "orange", "gray")
    if "title" in args and args["title"] is not None:
        note.title = args["title"]
    if "content" in args and args["content"] is not None:
        note.content = args["content"]
    if "color" in args and args["color"] in valid_colors:
        note.color = args["color"]

    note.updated_at = datetime.utcnow()
    await db.flush()
    return json.dumps({
        "id": str(note.id),
        "title": note.title,
        "message": f"Note '{note.title}' has been updated.",
    }, ensure_ascii=False)


async def _search_notes(user_id: uuid.UUID, query: str, db: AsyncSession) -> str:
    pattern = f"%{query}%"
    result = await db.execute(
        select(StickyNote).where(
            StickyNote.user_id == user_id,
            StickyNote.deleted_at.is_(None),
            (StickyNote.title.ilike(pattern)) | (StickyNote.content.ilike(pattern)),
        ).order_by(StickyNote.updated_at.desc()).limit(20)
    )
    notes = result.scalars().all()
    return json.dumps([
        {
            "id": str(n.id),
            "title": n.title,
            "content": n.content[:100],
            "color": n.color,
        }
        for n in notes
    ], ensure_ascii=False)
