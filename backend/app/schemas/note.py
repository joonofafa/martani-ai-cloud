from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class NoteCreate(BaseModel):
    title: str = ""
    content: str = ""
    color: str = "yellow"
    position_x: int = 0
    position_y: int = 0


class NoteUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    color: str | None = None
    position_x: int | None = None
    position_y: int | None = None
    width: int | None = None
    height: int | None = None
    z_index: int | None = None
    is_pinned: bool | None = None


class NoteResponse(BaseModel):
    id: UUID
    title: str
    content: str
    color: str
    position_x: int
    position_y: int
    width: int
    height: int
    z_index: int
    is_pinned: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BulkPositionItem(BaseModel):
    id: UUID
    position_x: int
    position_y: int
    z_index: int | None = None


class NoteBulkPositionUpdate(BaseModel):
    updates: list[BulkPositionItem]
