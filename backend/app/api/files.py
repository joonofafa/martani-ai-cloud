"""File management endpoints."""

import logging
import uuid
from datetime import datetime
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Query, status
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, or_
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import get_current_user, decode_token
from app.models.user import User
from app.models.file import File as FileModel
from app.models.file_share import FileShare
from app.models.index_category import FileCategory
from app.models.embedding import DocumentEmbedding
from app.schemas.file import FileResponse, FileUploadResponse, FileUpdateRequest, FileMove
from app.services.storage.minio_service import get_minio_service
from app.services.document.parser_service import get_document_parser
from app.services.ai.embedding_service import get_embedding_service, EmbeddingService

logger = logging.getLogger(__name__)

# Extension-based MIME fallback for when clients send application/octet-stream
_EXT_MIME_MAP = {
    "txt": "text/plain", "md": "text/markdown", "csv": "text/csv",
    "pdf": "application/pdf", "json": "application/json",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "html": "text/html", "htm": "text/html",
    "xml": "text/xml", "css": "text/css", "js": "text/javascript",
    "sh": "application/x-sh",
    # Images
    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
    "gif": "image/gif", "webp": "image/webp", "svg": "image/svg+xml",
    # Audio
    "mp3": "audio/mpeg", "wav": "audio/wav", "ogg": "audio/ogg",
    "flac": "audio/flac", "m4a": "audio/x-m4a",
    # Video
    "mp4": "video/mp4", "avi": "video/x-msvideo",
    "mkv": "video/x-matroska", "webm": "video/webm",
}


def _resolve_mime(content_type: str | None, filename: str | None) -> str:
    """Resolve MIME type, falling back to extension-based detection."""
    if content_type and content_type != "application/octet-stream":
        return content_type
    if filename and "." in filename:
        ext = filename.rsplit(".", 1)[-1].lower()
        return _EXT_MIME_MAP.get(ext, content_type or "application/octet-stream")
    return content_type or "application/octet-stream"

router = APIRouter()


# ============== Schemas ==============

class CreateFolderRequest(BaseModel):
    name: str
    parent_path: str = "/"


@router.post("/folders", status_code=status.HTTP_201_CREATED)
async def create_folder(
    request: CreateFolderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new folder."""
    # Validate folder name
    if not request.name or "/" in request.name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid folder name"
        )

    # Normalize parent path
    parent = request.parent_path if request.parent_path != "/" else "/"

    # Check if folder already exists
    folder_path = f"{parent.rstrip('/')}/{request.name}"
    existing = await db.execute(
        select(FileModel).where(
            FileModel.user_id == current_user.id,
            FileModel.mime_type == "application/x-folder",
            FileModel.original_filename == request.name,
            FileModel.folder == parent,
            FileModel.deleted_at.is_(None),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Folder already exists"
        )

    # Create folder marker in the PARENT directory so it shows in listing
    folder_record = FileModel(
        filename=".folder",
        original_filename=request.name,
        mime_type="application/x-folder",
        size=0,
        storage_path="",
        folder=parent,
        user_id=current_user.id,
    )
    db.add(folder_record)
    await db.commit()

    return {
        "message": "Folder created successfully",
        "name": request.name,
        "path": folder_path
    }


@router.post("/upload", response_model=FileUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    folder: str = Query(default="/", description="Target folder path"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload a file to storage."""
    minio = get_minio_service()

    # Check storage quota (admins are exempt)
    if current_user.role != "admin" and current_user.storage_used >= current_user.storage_quota:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Storage quota exceeded",
        )

    # Early reject when client sent Content-Length (minio path also caps reads)
    max_sz = get_settings().max_file_size
    if getattr(file, "size", None) not in (None, 0) and file.size > max_sz:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {max_sz} bytes",
        )

    # Upload to MinIO
    storage_path, file_size = await minio.upload_file(
        file=file,
        user_id=str(current_user.id),
        folder=folder,
    )

    # Generate unique filename
    file_ext = file.filename.split(".")[-1] if "." in file.filename else ""
    unique_filename = f"{uuid.uuid4()}.{file_ext}" if file_ext else str(uuid.uuid4())

    # Create file record (resolve MIME from extension if octet-stream)
    resolved_mime = _resolve_mime(file.content_type, file.filename)
    file_record = FileModel(
        filename=unique_filename,
        original_filename=file.filename,
        mime_type=resolved_mime,
        size=file_size,
        storage_path=storage_path,
        folder=folder,
        user_id=current_user.id,
    )
    db.add(file_record)

    # Update user's storage used
    current_user.storage_used += file_size

    await db.commit()
    await db.refresh(file_record)

    # Auto-dispatch indexing
    try:
        from app.tasks.indexing import index_file_task, index_audio_file_task
        parser = get_document_parser()
        mime = file_record.mime_type or ""
        category = parser.get_file_category(mime)
        if category == "audio":
            index_audio_file_task.delay(str(file_record.id))
        elif category is not None:
            index_file_task.delay(str(file_record.id))
    except Exception as e:
        logger.warning("Indexing dispatch failed for file %s: %s", file_record.id, e)

    # Fire file_upload triggers
    try:
        from app.models.agent_trigger import AgentTrigger
        from app.tasks.agent import execute_agent_trigger_task
        import json as _json

        trigger_result = await db.execute(
            select(AgentTrigger).where(
                AgentTrigger.user_id == current_user.id,
                AgentTrigger.trigger_type == "file_upload",
                AgentTrigger.status == "active",
            )
        )
        for trigger in trigger_result.scalars().all():
            # Check config filter (e.g. extension filter)
            cfg = trigger.config or {}
            ext_filter = cfg.get("extensions")
            if ext_filter:
                file_ext_lower = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "").lower()
                if file_ext_lower not in [e.lower() for e in ext_filter]:
                    continue

            context = {
                "filename": file.filename,
                "mime_type": resolved_mime or "",
                "size": file_size,
                "folder": folder,
                "file_id": str(file_record.id),
            }
            execute_agent_trigger_task.delay(str(trigger.id), _json.dumps(context, ensure_ascii=False))
    except Exception as e:
        logger.warning("Trigger dispatch failed for file %s: %s", file_record.id, e)

    # Audit log
    try:
        from app.services.audit_service import write_audit_log
        await write_audit_log(
            user_id=current_user.id,
            action="file_upload",
            resource_type="file",
            resource_id=str(file_record.id),
            detail={"filename": file.filename, "size": file_size, "folder": folder, "mime_type": resolved_mime},
        )
    except Exception as e:
        logger.warning("Audit log failed for file upload %s: %s", file_record.id, e)

    return FileUploadResponse(
        id=file_record.id,
        filename=file_record.filename,
        original_filename=file_record.original_filename,
        size=file_record.size,
        mime_type=file_record.mime_type,
    )


@router.get("", response_model=list[FileResponse])
async def list_files(
    folder: str = Query(default="/", description="Folder path"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=500, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List files in a folder."""
    offset = (page - 1) * limit

    # Subquery: file IDs that have at least one active (non-revoked, non-expired) share
    active_share_sq = (
        select(FileShare.file_id)
        .where(
            FileShare.is_revoked.is_(False),
            or_(FileShare.expires_at.is_(None), FileShare.expires_at > datetime.utcnow()),
        )
        .group_by(FileShare.file_id)
        .subquery()
    )

    query = (
        select(
            FileModel,
            active_share_sq.c.file_id.isnot(None).label("has_active_shares"),
        )
        .outerjoin(active_share_sq, FileModel.id == active_share_sq.c.file_id)
        .where(
            FileModel.user_id == current_user.id,
            FileModel.folder == folder,
            FileModel.deleted_at.is_(None),
        )
        .order_by(FileModel.created_at.desc())
    )

    result = await db.execute(query.offset(offset).limit(limit))
    rows = result.all()

    file_ids = [row[0].id for row in rows]

    # Fetch category assignments for all files in one query
    cat_map: dict[uuid.UUID, list[str]] = {}
    if file_ids:
        cat_result = await db.execute(
            select(FileCategory.file_id, FileCategory.category_id)
            .where(FileCategory.file_id.in_(file_ids))
        )
        for fid, cid in cat_result.all():
            cat_map.setdefault(fid, []).append(str(cid))

    files = []
    for file_obj, has_shares in rows:
        file_obj.has_active_shares = bool(has_shares)
        file_obj.category_ids = cat_map.get(file_obj.id, [])
        files.append(file_obj)

    return files


@router.get("/{file_id}", response_model=FileResponse)
async def get_file(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get file metadata."""
    result = await db.execute(
        select(FileModel).where(
            FileModel.id == file_id,
            FileModel.user_id == current_user.id,
            FileModel.deleted_at.is_(None),
        )
    )
    file = result.scalar_one_or_none()

    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )

    return file


@router.get("/{file_id}/download")
async def download_file(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Download a file."""
    result = await db.execute(
        select(FileModel).where(
            FileModel.id == file_id,
            FileModel.user_id == current_user.id,
            FileModel.deleted_at.is_(None),
        )
    )
    file = result.scalar_one_or_none()

    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )

    minio = get_minio_service()
    content = minio.download_file(file.storage_path)

    # Audit log
    try:
        from app.services.audit_service import write_audit_log
        await write_audit_log(
            user_id=current_user.id,
            action="file_download",
            resource_type="file",
            resource_id=str(file.id),
            detail={"filename": file.original_filename, "size": file.size},
        )
    except Exception:
        pass

    return StreamingResponse(
        iter([content]),
        media_type=file.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(file.original_filename)}",
        },
    )


@router.get("/{file_id}/stream")
async def stream_file(
    file_id: uuid.UUID,
    request: Request,
    token: str = Query(..., description="JWT access token"),
    db: AsyncSession = Depends(get_db),
):
    """Stream a file for in-browser preview (video, audio, PDF, image).
    Supports HTTP Range requests for media scrubbing.
    Auth via query param because HTML5 media elements can't send headers."""
    # Verify JWT from query param (same policy as get_current_user: active users only)
    payload = decode_token(token)
    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user_result = await db.execute(select(User).where(User.id == user_id))
    stream_user = user_result.scalar_one_or_none()
    if not stream_user or not stream_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    result = await db.execute(
        select(FileModel).where(
            FileModel.id == file_id,
            FileModel.user_id == user_id,
            FileModel.deleted_at.is_(None),
        )
    )
    file = result.scalar_one_or_none()
    if not file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    minio = get_minio_service()
    mime = file.mime_type or "application/octet-stream"
    file_size = file.size

    range_header = request.headers.get("range")

    if range_header:
        # Parse Range: bytes=start-end
        range_spec = range_header.strip().lower()
        if not range_spec.startswith("bytes="):
            raise HTTPException(status_code=416, detail="Invalid range")
        range_val = range_spec[6:]
        parts = range_val.split("-", 1)
        try:
            start = int(parts[0]) if parts[0] else 0
            end = int(parts[1]) if parts[1] else file_size - 1
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid range")
        end = min(end, file_size - 1)
        length = end - start + 1

        if start >= file_size or start < 0:
            raise HTTPException(status_code=416, detail="Range not satisfiable")

        stream = minio.get_file_partial(file.storage_path, offset=start, length=length)

        def iter_partial():
            try:
                for chunk in stream.stream(8192):
                    yield chunk
            finally:
                stream.close()
                stream.release_conn()

        return StreamingResponse(
            iter_partial(),
            status_code=206,
            media_type=mime,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(length),
                "Content-Disposition": f"inline; filename*=UTF-8''{quote(file.original_filename)}",
            },
        )

    # Full file response
    stream = minio.get_file_stream(file.storage_path)

    def iter_full():
        try:
            for chunk in stream.stream(8192):
                yield chunk
        finally:
            stream.close()
            stream.release_conn()

    return StreamingResponse(
        iter_full(),
        media_type=mime,
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(file.original_filename)}",
        },
    )


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_file(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft delete a file or folder (cascade to children + clean embeddings)."""
    result = await db.execute(
        select(FileModel).where(
            FileModel.id == file_id,
            FileModel.user_id == current_user.id,
            FileModel.deleted_at.is_(None),
        )
    )
    file = result.scalar_one_or_none()

    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )

    if file.is_system:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System folders cannot be deleted",
        )

    now = datetime.utcnow()
    deleted_file_ids = [file.id]

    # If folder, cascade delete to all children recursively
    if file.mime_type == "application/x-folder":
        folder_path = f"{file.folder.rstrip('/')}/{file.original_filename}"

        # Find all descendants: files IN this folder or in subfolders
        children_result = await db.execute(
            select(FileModel).where(
                FileModel.user_id == current_user.id,
                FileModel.deleted_at.is_(None),
                or_(
                    FileModel.folder == folder_path,
                    FileModel.folder.like(f"{folder_path}/%"),
                ),
            )
        )
        children = children_result.scalars().all()

        total_size = 0
        for child in children:
            child.deleted_at = now
            total_size += child.size
            deleted_file_ids.append(child.id)

        current_user.storage_used = max(0, current_user.storage_used - total_size)

    # Delete the file/folder itself
    file.deleted_at = now
    current_user.storage_used = max(0, current_user.storage_used - file.size)

    # Clean up embeddings and category links for all deleted files
    await db.execute(
        DocumentEmbedding.__table__.delete().where(
            DocumentEmbedding.file_id.in_(deleted_file_ids)
        )
    )
    from app.models.index_category import FileCategory
    await db.execute(
        FileCategory.__table__.delete().where(
            FileCategory.file_id.in_(deleted_file_ids)
        )
    )

    await db.commit()

    # Audit log
    try:
        from app.services.audit_service import write_audit_log
        await write_audit_log(
            user_id=current_user.id,
            action="file_delete",
            resource_type="file",
            resource_id=str(file.id),
            detail={"filename": file.original_filename, "is_folder": file.mime_type == "application/x-folder"},
        )
    except Exception:
        pass


@router.patch("/{file_id}", response_model=FileResponse)
async def update_file(
    file_id: uuid.UUID,
    update_data: FileUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rename a file or folder."""
    result = await db.execute(
        select(FileModel).where(
            FileModel.id == file_id,
            FileModel.user_id == current_user.id,
            FileModel.deleted_at.is_(None),
        )
    )
    file = result.scalar_one_or_none()

    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )

    if file.is_system:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System folders cannot be renamed",
        )

    new_name = update_data.original_filename.strip()
    if not new_name or "/" in new_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid filename",
        )

    # For folders, check name collision and update children paths
    if file.mime_type == "application/x-folder":
        existing = await db.execute(
            select(FileModel).where(
                FileModel.user_id == current_user.id,
                FileModel.mime_type == "application/x-folder",
                FileModel.original_filename == new_name,
                FileModel.folder == file.folder,
                FileModel.id != file_id,
                FileModel.deleted_at.is_(None),
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A folder with this name already exists",
            )

        # Update children paths: /old_name/... → /new_name/...
        old_path = f"{file.folder.rstrip('/')}/{file.original_filename}"
        new_path = f"{file.folder.rstrip('/')}/{new_name}"

        # Direct children (folder == old_path)
        await db.execute(
            update(FileModel)
            .where(
                FileModel.user_id == current_user.id,
                FileModel.deleted_at.is_(None),
                FileModel.folder == old_path,
            )
            .values(folder=new_path)
        )

        # Nested descendants (folder LIKE old_path/%)
        descendants_result = await db.execute(
            select(FileModel).where(
                FileModel.user_id == current_user.id,
                FileModel.deleted_at.is_(None),
                FileModel.folder.like(f"{old_path}/%"),
            )
        )
        for desc in descendants_result.scalars().all():
            desc.folder = new_path + desc.folder[len(old_path):]

    file.original_filename = new_name
    file.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(file)

    return file


@router.post("/{file_id}/move")
async def move_file(
    file_id: uuid.UUID,
    move_data: FileMove,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Move a file or folder to a different directory."""
    result = await db.execute(
        select(FileModel).where(
            FileModel.id == file_id,
            FileModel.user_id == current_user.id,
            FileModel.deleted_at.is_(None),
        )
    )
    file = result.scalar_one_or_none()

    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )

    if file.is_system:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System folders cannot be moved",
        )

    target = move_data.target_folder.rstrip("/") or "/"

    # Prevent moving a folder into itself or its own descendants
    if file.mime_type == "application/x-folder":
        old_path = f"{file.folder.rstrip('/')}/{file.original_filename}"
        if target == old_path or target.startswith(f"{old_path}/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot move a folder into itself",
            )

        # Check name collision in target
        existing = await db.execute(
            select(FileModel).where(
                FileModel.user_id == current_user.id,
                FileModel.mime_type == "application/x-folder",
                FileModel.original_filename == file.original_filename,
                FileModel.folder == target,
                FileModel.id != file_id,
                FileModel.deleted_at.is_(None),
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A folder with this name already exists in target",
            )

        # Update children paths
        new_path = f"{target.rstrip('/')}/{file.original_filename}"

        await db.execute(
            update(FileModel)
            .where(
                FileModel.user_id == current_user.id,
                FileModel.deleted_at.is_(None),
                FileModel.folder == old_path,
            )
            .values(folder=new_path)
        )

        descendants_result = await db.execute(
            select(FileModel).where(
                FileModel.user_id == current_user.id,
                FileModel.deleted_at.is_(None),
                FileModel.folder.like(f"{old_path}/%"),
            )
        )
        for desc in descendants_result.scalars().all():
            desc.folder = new_path + desc.folder[len(old_path):]

    file.folder = target
    file.updated_at = datetime.utcnow()
    await db.commit()

    # Audit log
    try:
        from app.services.audit_service import write_audit_log
        await write_audit_log(
            user_id=current_user.id,
            action="file_move",
            resource_type="file",
            resource_id=str(file.id),
            detail={"filename": file.original_filename, "target_folder": target},
        )
    except Exception:
        pass

    return {"message": "Moved successfully", "id": str(file.id), "folder": target}


@router.post("/{file_id}/index")
async def index_file(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Dispatch file indexing to Celery worker."""
    from app.tasks.indexing import index_file_task, index_audio_file_task

    result = await db.execute(
        select(FileModel).where(
            FileModel.id == file_id,
            FileModel.user_id == current_user.id,
            FileModel.deleted_at.is_(None),
        )
    )
    file = result.scalar_one_or_none()

    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )

    parser = get_document_parser()

    if not parser.is_supported(file.mime_type or ""):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not supported for indexing: {file.mime_type}",
        )

    category = parser.get_file_category(file.mime_type or "")

    # Dispatch to appropriate queue
    if category == "audio":
        task_result = index_audio_file_task.delay(str(file_id))
    else:
        task_result = index_file_task.delay(str(file_id))

    # Update file with task ID
    file.index_status = "pending"
    file.celery_task_id = task_result.id
    await db.commit()

    return {
        "id": str(file.id),
        "index_status": "pending",
        "task_id": task_result.id,
        "message": f"Indexing queued ({category})",
    }


@router.post("/{file_id}/decompress")
async def decompress_file(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Decompress a ZIP file into a subfolder named after the ZIP."""
    import io
    import zipfile

    result = await db.execute(
        select(FileModel).where(
            FileModel.id == file_id,
            FileModel.user_id == current_user.id,
            FileModel.deleted_at.is_(None),
        )
    )
    file = result.scalar_one_or_none()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    if file.mime_type not in ("application/zip", "application/x-zip-compressed"):
        raise HTTPException(status_code=400, detail="Only ZIP files can be decompressed")

    minio = get_minio_service()
    zip_data = minio.download_file(file.storage_path)

    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_data))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid ZIP file")

    # Create subfolder named after the ZIP file (without .zip extension)
    zip_basename = file.original_filename
    if zip_basename.lower().endswith(".zip"):
        zip_basename = zip_basename[:-4]

    parent_folder = file.folder
    target_folder = f"{parent_folder.rstrip('/')}/{zip_basename}"

    # Create folder record if it doesn't exist
    existing = await db.execute(
        select(FileModel).where(
            FileModel.user_id == current_user.id,
            FileModel.mime_type == "application/x-folder",
            FileModel.original_filename == zip_basename,
            FileModel.folder == parent_folder,
            FileModel.deleted_at.is_(None),
        )
    )
    if not existing.scalar_one_or_none():
        folder_record = FileModel(
            filename=".folder",
            original_filename=zip_basename,
            mime_type="application/x-folder",
            size=0,
            storage_path="",
            folder=parent_folder,
            user_id=current_user.id,
        )
        db.add(folder_record)

    extracted = []
    total_size = 0
    for info in zf.infolist():
        if info.is_dir() or info.file_size == 0:
            continue
        if len(extracted) >= 100:
            break

        name = info.filename.split("/")[-1]
        if not name:
            continue

        content = zf.read(info.filename)
        storage_filename = f"{uuid.uuid4()}_{name}"
        storage_path = f"{current_user.id}/{storage_filename}"

        content_type = _resolve_mime(None, name)

        minio.client.put_object(
            minio.bucket, storage_path, io.BytesIO(content), len(content),
            content_type=content_type,
        )

        file_record = FileModel(
            user_id=current_user.id,
            filename=storage_filename,
            original_filename=name,
            mime_type=content_type,
            size=len(content),
            storage_path=storage_path,
            folder=target_folder,
        )
        db.add(file_record)
        extracted.append(name)
        total_size += len(content)

    zf.close()

    # Update user storage
    current_user.storage_used += total_size

    await db.commit()

    if not extracted:
        raise HTTPException(status_code=400, detail="ZIP file is empty")

    return {
        "message": f"Decompressed {len(extracted)} files into {target_folder}",
        "folder": target_folder,
        "files": extracted,
        "count": len(extracted),
    }


class BatchIndexRequest(BaseModel):
    file_ids: list[uuid.UUID]


@router.post("/batch-index")
async def batch_index_files(
    request: BatchIndexRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Batch index multiple files."""
    from app.tasks.indexing import index_file_task, index_audio_file_task

    parser = get_document_parser()
    results = []

    for fid in request.file_ids:
        result = await db.execute(
            select(FileModel).where(
                FileModel.id == fid,
                FileModel.user_id == current_user.id,
                FileModel.deleted_at.is_(None),
            )
        )
        file = result.scalar_one_or_none()
        if not file:
            results.append({"id": str(fid), "status": "not_found"})
            continue

        if not parser.is_supported(file.mime_type or ""):
            results.append({"id": str(fid), "status": "unsupported"})
            continue

        category = parser.get_file_category(file.mime_type or "")
        if category == "audio":
            task_result = index_audio_file_task.delay(str(fid))
        else:
            task_result = index_file_task.delay(str(fid))

        file.index_status = "pending"
        file.celery_task_id = task_result.id
        results.append({"id": str(fid), "status": "queued", "task_id": task_result.id})

    await db.commit()
    return {"results": results}
