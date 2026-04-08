from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class FileResponse(BaseModel):
    id: UUID
    filename: str
    original_filename: str
    mime_type: str | None
    size: int
    folder: str
    is_indexed: bool = False
    index_status: str = "pending"
    index_progress: int = 0
    index_error: str | None = None
    indexed_at: datetime | None = None
    has_active_shares: bool = False
    is_system: bool = False
    category_ids: list[str] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FileUploadResponse(BaseModel):
    id: UUID
    filename: str
    original_filename: str
    size: int
    mime_type: str | None
    message: str = "File uploaded successfully"


class FolderCreate(BaseModel):
    name: str
    parent_path: str = "/"


class FileMove(BaseModel):
    target_folder: str


class FileUpdateRequest(BaseModel):
    original_filename: str
