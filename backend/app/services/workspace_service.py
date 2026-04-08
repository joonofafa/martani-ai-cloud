"""AI Workspace folder management and file export helpers."""

import io
import json
import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.file import File

# System folder definitions: (parent_path, folder_name)
SYSTEM_FOLDERS = [
    ("/", "AI Workspace"),
    ("/AI Workspace", "Scouts"),
    ("/AI Workspace", "Refined"),
    ("/AI Workspace", "Exports"),
]


async def ensure_workspace_folders(user_id: uuid.UUID, db: AsyncSession) -> None:
    """Create AI Workspace system folders if they don't exist yet."""
    for parent, name in SYSTEM_FOLDERS:
        result = await db.execute(
            select(File).where(
                File.user_id == user_id,
                File.mime_type == "application/x-folder",
                File.original_filename == name,
                File.folder == parent,
                File.deleted_at.is_(None),
            )
        )
        if result.scalar_one_or_none():
            continue

        folder = File(
            filename=".folder",
            original_filename=name,
            mime_type="application/x-folder",
            size=0,
            storage_path="",
            folder=parent,
            user_id=user_id,
            is_system=True,
        )
        db.add(folder)

    await db.commit()


async def save_workspace_file(
    user_id: uuid.UUID,
    folder: str,
    filename: str,
    content: str | bytes,
    mime_type: str,
    db: AsyncSession,
) -> File:
    """Save a file to an AI Workspace subfolder and return the File record.

    Args:
        user_id: Owner user ID.
        folder: Target folder, e.g. "/AI Workspace/Scouts".
        filename: Display filename, e.g. "mining_240310120000.json".
        content: File content (str will be UTF-8 encoded).
        mime_type: MIME type, e.g. "application/json".
        db: Active async DB session (caller manages commit).

    Returns:
        The created File ORM object (already flushed with id).
    """
    from app.services.storage.minio_service import get_minio_service

    if isinstance(content, str):
        content_bytes = content.encode("utf-8")
    else:
        content_bytes = content

    file_size = len(content_bytes)

    # Upload to MinIO
    minio = get_minio_service()
    ext = filename.rsplit(".", 1)[-1] if "." in filename else ""
    unique_name = f"{uuid.uuid4()}.{ext}" if ext else str(uuid.uuid4())
    storage_path = f"{user_id}/{unique_name}"

    minio.client.put_object(
        minio.bucket,
        storage_path,
        io.BytesIO(content_bytes),
        file_size,
        content_type=mime_type,
    )

    # Create File DB record
    file_record = File(
        user_id=user_id,
        filename=unique_name,
        original_filename=filename,
        mime_type=mime_type,
        size=file_size,
        storage_path=storage_path,
        folder=folder,
    )
    db.add(file_record)
    await db.flush()  # populate file_record.id

    return file_record
