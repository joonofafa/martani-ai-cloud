"""File share CRUD endpoints (authenticated)."""

import uuid
import secrets
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.config import get_settings
from app.core.security import get_current_user, get_password_hash
from app.models.user import User
from app.models.file import File as FileModel
from app.models.file_share import FileShare

settings = get_settings()
router = APIRouter()

EXPIRY_MAP = {
    "1h": timedelta(hours=1),
    "1d": timedelta(days=1),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
    "never": None,
}


class CreateShareRequest(BaseModel):
    password: Optional[str] = None
    expires_in: str = "7d"  # 1h, 1d, 7d, 30d, never


class ShareResponse(BaseModel):
    id: str
    token: str
    url: str
    has_password: bool
    expires_at: Optional[str]
    download_count: int
    created_at: str


def _build_share_url(token: str) -> str:
    return f"{settings.frontend_url}/s/{token}"


@router.post("/{file_id}/shares", status_code=status.HTTP_201_CREATED)
async def create_share(
    file_id: uuid.UUID,
    body: CreateShareRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a share link for a file."""
    # Validate expiry
    if body.expires_in not in EXPIRY_MAP:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid expires_in. Must be one of: {', '.join(EXPIRY_MAP.keys())}",
        )

    # Find file
    result = await db.execute(
        select(FileModel).where(
            FileModel.id == file_id,
            FileModel.user_id == current_user.id,
            FileModel.deleted_at.is_(None),
        )
    )
    file = result.scalar_one_or_none()
    if not file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    if file.mime_type == "application/x-folder":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot share a folder")

    # Build share
    delta = EXPIRY_MAP[body.expires_in]
    expires_at = datetime.utcnow() + delta if delta else None
    password_hash = get_password_hash(body.password) if body.password else None

    share = FileShare(
        file_id=file.id,
        user_id=current_user.id,
        token=secrets.token_urlsafe(8)[:10],
        password_hash=password_hash,
        expires_at=expires_at,
    )
    db.add(share)
    await db.commit()
    await db.refresh(share)

    return ShareResponse(
        id=str(share.id),
        token=share.token,
        url=_build_share_url(share.token),
        has_password=share.password_hash is not None,
        expires_at=share.expires_at.isoformat() if share.expires_at else None,
        download_count=share.download_count,
        created_at=share.created_at.isoformat(),
    )


@router.get("/{file_id}/shares")
async def list_shares(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List active shares for a file."""
    # Verify ownership
    result = await db.execute(
        select(FileModel).where(
            FileModel.id == file_id,
            FileModel.user_id == current_user.id,
            FileModel.deleted_at.is_(None),
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    result = await db.execute(
        select(FileShare).where(
            FileShare.file_id == file_id,
            FileShare.is_revoked == False,
        ).order_by(FileShare.created_at.desc())
    )
    shares = result.scalars().all()

    return [
        ShareResponse(
            id=str(s.id),
            token=s.token,
            url=_build_share_url(s.token),
            has_password=s.password_hash is not None,
            expires_at=s.expires_at.isoformat() if s.expires_at else None,
            download_count=s.download_count,
            created_at=s.created_at.isoformat(),
        )
        for s in shares
    ]


@router.delete("/{file_id}/shares/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_share(
    file_id: uuid.UUID,
    share_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revoke a share link."""
    result = await db.execute(
        select(FileShare).where(
            FileShare.id == share_id,
            FileShare.file_id == file_id,
            FileShare.user_id == current_user.id,
        )
    )
    share = result.scalar_one_or_none()
    if not share:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share not found")

    share.is_revoked = True
    await db.commit()
