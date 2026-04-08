"""Sticky Notes CRUD endpoints."""

import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.note import StickyNote
from app.schemas.note import (
    NoteCreate,
    NoteUpdate,
    NoteResponse,
    NoteBulkPositionUpdate,
)

router = APIRouter()


@router.get("", response_model=list[NoteResponse])
async def list_notes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all sticky notes for the current user."""
    result = await db.execute(
        select(StickyNote)
        .where(StickyNote.user_id == current_user.id)
        .where(StickyNote.deleted_at.is_(None))
        .order_by(StickyNote.z_index.asc())
    )
    return result.scalars().all()


@router.post("", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note(
    data: NoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new sticky note."""
    note = StickyNote(
        title=data.title,
        content=data.content,
        color=data.color,
        position_x=data.position_x,
        position_y=data.position_y,
        user_id=current_user.id,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


@router.get("/search", response_model=list[NoteResponse])
async def search_notes(
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Search notes by title or content."""
    pattern = f"%{q}%"
    result = await db.execute(
        select(StickyNote)
        .where(StickyNote.user_id == current_user.id)
        .where(StickyNote.deleted_at.is_(None))
        .where(
            (StickyNote.title.ilike(pattern)) | (StickyNote.content.ilike(pattern))
        )
        .order_by(StickyNote.updated_at.desc())
    )
    return result.scalars().all()


@router.patch("/bulk-position", response_model=list[NoteResponse])
async def bulk_update_positions(
    data: NoteBulkPositionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bulk update note positions and z-index."""
    note_ids = [item.id for item in data.updates]
    result = await db.execute(
        select(StickyNote)
        .where(StickyNote.id.in_(note_ids))
        .where(StickyNote.user_id == current_user.id)
        .where(StickyNote.deleted_at.is_(None))
    )
    notes = {n.id: n for n in result.scalars().all()}

    for item in data.updates:
        note = notes.get(item.id)
        if note:
            note.position_x = item.position_x
            note.position_y = item.position_y
            if item.z_index is not None:
                note.z_index = item.z_index
            note.updated_at = datetime.utcnow()

    await db.commit()
    return list(notes.values())


@router.patch("/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: uuid.UUID,
    data: NoteUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a sticky note (partial update for auto-save)."""
    result = await db.execute(
        select(StickyNote)
        .where(StickyNote.id == note_id)
        .where(StickyNote.user_id == current_user.id)
        .where(StickyNote.deleted_at.is_(None))
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(note, field, value)

    note.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(note)
    return note


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft-delete a sticky note."""
    result = await db.execute(
        select(StickyNote)
        .where(StickyNote.id == note_id)
        .where(StickyNote.user_id == current_user.id)
        .where(StickyNote.deleted_at.is_(None))
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    note.deleted_at = datetime.utcnow()
    await db.commit()
