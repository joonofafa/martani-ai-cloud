"""Public share endpoints (no authentication required)."""

from datetime import datetime
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, Request, status, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.core.security import verify_password
from app.models.file_share import FileShare
from app.models.file import File as FileModel
from app.services.storage.minio_service import get_minio_service

router = APIRouter()
_settings = get_settings()


async def _get_valid_share(token: str, db: AsyncSession) -> FileShare:
    """Fetch share by token, validate revoked/expired status."""
    result = await db.execute(
        select(FileShare).where(FileShare.token == token)
    )
    share = result.scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share not found")

    if share.is_revoked:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Share has been revoked")

    if share.expires_at and share.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Share has expired")

    return share


@router.get("/shares/{token}/info")
async def get_share_info(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    """Get public info about a shared file (no auth required)."""
    share = await _get_valid_share(token, db)

    # Load the file
    result = await db.execute(
        select(FileModel).where(
            FileModel.id == share.file_id,
            FileModel.deleted_at.is_(None),
        )
    )
    file = result.scalar_one_or_none()
    if not file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File no longer exists")

    return {
        "filename": file.original_filename,
        "size": file.size,
        "mime_type": file.mime_type,
        "has_password": share.password_hash is not None,
        "expires_at": share.expires_at.isoformat() if share.expires_at else None,
        "download_count": share.download_count,
    }


class DownloadRequest(BaseModel):
    password: Optional[str] = None


@router.post("/shares/{token}/download")
@limiter.limit(_settings.rate_limit_public_share_download)
async def download_shared_file(
    request: Request,
    token: str,
    body: DownloadRequest = DownloadRequest(),
    db: AsyncSession = Depends(get_db),
):
    """Download a shared file (no auth required). Password if set."""
    share = await _get_valid_share(token, db)

    # Check password
    if share.password_hash:
        if not body.password:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Password required")
        if not verify_password(body.password, share.password_hash):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid password")

    # Load file
    result = await db.execute(
        select(FileModel).where(
            FileModel.id == share.file_id,
            FileModel.deleted_at.is_(None),
        )
    )
    file = result.scalar_one_or_none()
    if not file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File no longer exists")

    # Increment download count
    share.download_count += 1
    await db.commit()

    # Stream file
    minio = get_minio_service()
    stream = minio.get_file_stream(file.storage_path)

    def iter_file():
        try:
            for chunk in stream.stream(8192):
                yield chunk
        finally:
            stream.close()
            stream.release_conn()

    return StreamingResponse(
        iter_file(),
        media_type=file.mime_type or "application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(file.original_filename)}",
            "Content-Length": str(file.size),
        },
    )
