"""Vault API — Credential Vault + File Vault."""

import io
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.encryption import get_vault_key, encrypt_text, decrypt_text, encrypt_bytes, decrypt_bytes
from app.models.user import User
from app.models.file import File as FileModel
from app.models.vault import CredentialVault, FileVault, ApiKeyVault
from app.models.browser_cookie import BrowserCookie
from app.services.storage.minio_service import get_minio_service

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────

class CredentialCreate(BaseModel):
    site_name: str
    username: str
    password: str
    notes: str | None = None


class CredentialUpdate(BaseModel):
    site_name: str | None = None
    username: str | None = None
    password: str | None = None
    notes: str | None = None


class CredentialListItem(BaseModel):
    id: str
    site_name: str
    username: str
    password: str  # masked
    notes: str | None
    created_at: str
    updated_at: str


class CredentialDetail(BaseModel):
    id: str
    site_name: str
    username: str
    password: str  # decrypted
    notes: str | None
    created_at: str
    updated_at: str


class FileVaultItem(BaseModel):
    id: str
    original_filename: str
    original_mime_type: str | None
    original_size: int
    original_folder: str
    encrypted_size: int
    created_at: str


# ── Credential Vault ─────────────────────────────────────

@router.get("/credentials", response_model=list[CredentialListItem])
async def list_credentials(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all credentials (password masked)."""
    key = await get_vault_key(db)
    result = await db.execute(
        select(CredentialVault)
        .where(CredentialVault.user_id == current_user.id)
        .order_by(CredentialVault.created_at.desc())
    )
    items = result.scalars().all()
    out = []
    for c in items:
        out.append(CredentialListItem(
            id=str(c.id),
            site_name=c.site_name,
            username=decrypt_text(c.username, key),
            password="••••••••",
            notes=decrypt_text(c.notes, key) if c.notes else None,
            created_at=c.created_at.isoformat(),
            updated_at=c.updated_at.isoformat(),
        ))
    return out


@router.post("/credentials", response_model=CredentialDetail, status_code=status.HTTP_201_CREATED)
async def create_credential(
    data: CredentialCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a new credential."""
    key = await get_vault_key(db)
    cred = CredentialVault(
        user_id=current_user.id,
        site_name=data.site_name,
        username=encrypt_text(data.username, key),
        password=encrypt_text(data.password, key),
        notes=encrypt_text(data.notes, key) if data.notes else None,
    )
    db.add(cred)
    await db.commit()
    await db.refresh(cred)

    return CredentialDetail(
        id=str(cred.id),
        site_name=cred.site_name,
        username=data.username,
        password=data.password,
        notes=data.notes,
        created_at=cred.created_at.isoformat(),
        updated_at=cred.updated_at.isoformat(),
    )


@router.get("/credentials/{cred_id}", response_model=CredentialDetail)
async def get_credential(
    cred_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a credential with decrypted password."""
    key = await get_vault_key(db)
    result = await db.execute(
        select(CredentialVault)
        .where(CredentialVault.id == cred_id)
        .where(CredentialVault.user_id == current_user.id)
    )
    cred = result.scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")

    return CredentialDetail(
        id=str(cred.id),
        site_name=cred.site_name,
        username=decrypt_text(cred.username, key),
        password=decrypt_text(cred.password, key),
        notes=decrypt_text(cred.notes, key) if cred.notes else None,
        created_at=cred.created_at.isoformat(),
        updated_at=cred.updated_at.isoformat(),
    )


@router.put("/credentials/{cred_id}", response_model=CredentialDetail)
async def update_credential(
    cred_id: uuid.UUID,
    data: CredentialUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a credential."""
    key = await get_vault_key(db)
    result = await db.execute(
        select(CredentialVault)
        .where(CredentialVault.id == cred_id)
        .where(CredentialVault.user_id == current_user.id)
    )
    cred = result.scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")

    if data.site_name is not None:
        cred.site_name = data.site_name
    if data.username is not None:
        cred.username = encrypt_text(data.username, key)
    if data.password is not None:
        cred.password = encrypt_text(data.password, key)
    if data.notes is not None:
        cred.notes = encrypt_text(data.notes, key) if data.notes else None

    cred.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(cred)

    return CredentialDetail(
        id=str(cred.id),
        site_name=cred.site_name,
        username=decrypt_text(cred.username, key),
        password=decrypt_text(cred.password, key),
        notes=decrypt_text(cred.notes, key) if cred.notes else None,
        created_at=cred.created_at.isoformat(),
        updated_at=cred.updated_at.isoformat(),
    )


@router.delete("/credentials/{cred_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_credential(
    cred_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a credential."""
    result = await db.execute(
        select(CredentialVault)
        .where(CredentialVault.id == cred_id)
        .where(CredentialVault.user_id == current_user.id)
    )
    cred = result.scalar_one_or_none()
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")

    await db.delete(cred)
    await db.commit()


# ── API Key Vault ────────────────────────────────────────

class ApiKeyCreate(BaseModel):
    site_name: str
    api_key: str
    expires_at: str | None = None  # ISO datetime
    notes: str | None = None


class ApiKeyUpdate(BaseModel):
    site_name: str | None = None
    api_key: str | None = None
    expires_at: str | None = None
    notes: str | None = None


class ApiKeyListItem(BaseModel):
    id: str
    site_name: str
    api_key: str  # masked
    expires_at: str | None
    notes: str | None
    created_at: str
    updated_at: str


class ApiKeyDetail(BaseModel):
    id: str
    site_name: str
    api_key: str  # decrypted
    expires_at: str | None
    notes: str | None
    created_at: str
    updated_at: str


@router.get("/api-keys", response_model=list[ApiKeyListItem])
async def list_api_keys(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all API keys (key masked)."""
    key = await get_vault_key(db)
    result = await db.execute(
        select(ApiKeyVault)
        .where(ApiKeyVault.user_id == current_user.id)
        .order_by(ApiKeyVault.created_at.desc())
    )
    items = result.scalars().all()
    out = []
    for ak in items:
        decrypted = decrypt_text(ak.api_key, key)
        masked = decrypted[:4] + "••••" + decrypted[-4:] if len(decrypted) > 8 else "••••••••"
        out.append(ApiKeyListItem(
            id=str(ak.id),
            site_name=ak.site_name,
            api_key=masked,
            expires_at=ak.expires_at.isoformat() if ak.expires_at else None,
            notes=ak.notes,
            created_at=ak.created_at.isoformat(),
            updated_at=ak.updated_at.isoformat(),
        ))
    return out


@router.post("/api-keys", response_model=ApiKeyDetail, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    data: ApiKeyCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a new API key."""
    key = await get_vault_key(db)
    expires = datetime.fromisoformat(data.expires_at) if data.expires_at else None
    ak = ApiKeyVault(
        user_id=current_user.id,
        site_name=data.site_name,
        api_key=encrypt_text(data.api_key, key),
        expires_at=expires,
        notes=data.notes,
    )
    db.add(ak)
    await db.commit()
    await db.refresh(ak)

    return ApiKeyDetail(
        id=str(ak.id),
        site_name=ak.site_name,
        api_key=data.api_key,
        expires_at=ak.expires_at.isoformat() if ak.expires_at else None,
        notes=ak.notes,
        created_at=ak.created_at.isoformat(),
        updated_at=ak.updated_at.isoformat(),
    )


@router.get("/api-keys/{ak_id}", response_model=ApiKeyDetail)
async def get_api_key(
    ak_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get an API key with decrypted value."""
    key = await get_vault_key(db)
    result = await db.execute(
        select(ApiKeyVault)
        .where(ApiKeyVault.id == ak_id)
        .where(ApiKeyVault.user_id == current_user.id)
    )
    ak = result.scalar_one_or_none()
    if not ak:
        raise HTTPException(status_code=404, detail="API key not found")

    return ApiKeyDetail(
        id=str(ak.id),
        site_name=ak.site_name,
        api_key=decrypt_text(ak.api_key, key),
        expires_at=ak.expires_at.isoformat() if ak.expires_at else None,
        notes=ak.notes,
        created_at=ak.created_at.isoformat(),
        updated_at=ak.updated_at.isoformat(),
    )


@router.put("/api-keys/{ak_id}", response_model=ApiKeyDetail)
async def update_api_key(
    ak_id: uuid.UUID,
    data: ApiKeyUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update an API key."""
    key = await get_vault_key(db)
    result = await db.execute(
        select(ApiKeyVault)
        .where(ApiKeyVault.id == ak_id)
        .where(ApiKeyVault.user_id == current_user.id)
    )
    ak = result.scalar_one_or_none()
    if not ak:
        raise HTTPException(status_code=404, detail="API key not found")

    if data.site_name is not None:
        ak.site_name = data.site_name
    if data.api_key is not None:
        ak.api_key = encrypt_text(data.api_key, key)
    if data.expires_at is not None:
        ak.expires_at = datetime.fromisoformat(data.expires_at) if data.expires_at else None
    if data.notes is not None:
        ak.notes = data.notes

    ak.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(ak)

    return ApiKeyDetail(
        id=str(ak.id),
        site_name=ak.site_name,
        api_key=decrypt_text(ak.api_key, key),
        expires_at=ak.expires_at.isoformat() if ak.expires_at else None,
        notes=ak.notes,
        created_at=ak.created_at.isoformat(),
        updated_at=ak.updated_at.isoformat(),
    )


@router.delete("/api-keys/{ak_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_api_key(
    ak_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an API key."""
    result = await db.execute(
        select(ApiKeyVault)
        .where(ApiKeyVault.id == ak_id)
        .where(ApiKeyVault.user_id == current_user.id)
    )
    ak = result.scalar_one_or_none()
    if not ak:
        raise HTTPException(status_code=404, detail="API key not found")

    await db.delete(ak)
    await db.commit()


# ── File Vault ───────────────────────────────────────────

@router.get("/files", response_model=list[FileVaultItem])
async def list_vault_files(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List files in the vault."""
    result = await db.execute(
        select(FileVault)
        .where(FileVault.user_id == current_user.id)
        .order_by(FileVault.created_at.desc())
    )
    items = result.scalars().all()
    return [
        FileVaultItem(
            id=str(v.id),
            original_filename=v.original_filename,
            original_mime_type=v.original_mime_type,
            original_size=v.original_size,
            original_folder=v.original_folder,
            encrypted_size=v.encrypted_size,
            created_at=v.created_at.isoformat(),
        )
        for v in items
    ]


@router.post("/files/{file_id}/lock", response_model=FileVaultItem, status_code=status.HTTP_201_CREATED)
async def lock_file(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Move a file from explorer to vault (encrypt + soft-delete original)."""
    # Find the file
    result = await db.execute(
        select(FileModel)
        .where(FileModel.id == file_id)
        .where(FileModel.user_id == current_user.id)
        .where(FileModel.deleted_at.is_(None))
    )
    file_record = result.scalar_one_or_none()
    if not file_record:
        raise HTTPException(status_code=404, detail="File not found")
    if file_record.mime_type == "application/x-folder":
        raise HTTPException(status_code=400, detail="Cannot lock a folder")

    key = await get_vault_key(db)
    minio = get_minio_service()

    # Download original file
    file_data = minio.download_file(file_record.storage_path)

    # Encrypt
    encrypted_data = encrypt_bytes(file_data, key)

    # Upload encrypted to vault path in MinIO
    vault_path = f"{current_user.id}/vault/{uuid.uuid4()}.enc"
    minio.client.put_object(
        minio.bucket,
        vault_path,
        io.BytesIO(encrypted_data),
        len(encrypted_data),
        content_type="application/octet-stream",
    )

    # Create vault record
    vault_entry = FileVault(
        user_id=current_user.id,
        original_filename=file_record.original_filename,
        original_mime_type=file_record.mime_type,
        original_size=file_record.size,
        original_folder=file_record.folder,
        encrypted_storage_path=vault_path,
        encrypted_size=len(encrypted_data),
    )
    db.add(vault_entry)

    # Soft-delete original file
    file_record.deleted_at = datetime.utcnow()

    await db.commit()
    await db.refresh(vault_entry)

    return FileVaultItem(
        id=str(vault_entry.id),
        original_filename=vault_entry.original_filename,
        original_mime_type=vault_entry.original_mime_type,
        original_size=vault_entry.original_size,
        original_folder=vault_entry.original_folder,
        encrypted_size=vault_entry.encrypted_size,
        created_at=vault_entry.created_at.isoformat(),
    )


@router.post("/files/{vault_id}/unlock", status_code=status.HTTP_200_OK)
async def unlock_file(
    vault_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Restore a file from vault back to explorer (decrypt + create file record)."""
    result = await db.execute(
        select(FileVault)
        .where(FileVault.id == vault_id)
        .where(FileVault.user_id == current_user.id)
    )
    vault_entry = result.scalar_one_or_none()
    if not vault_entry:
        raise HTTPException(status_code=404, detail="Vault file not found")

    key = await get_vault_key(db)
    minio = get_minio_service()

    # Download encrypted file
    encrypted_data = minio.download_file(vault_entry.encrypted_storage_path)

    # Decrypt
    original_data = decrypt_bytes(encrypted_data, key)

    # Upload decrypted file back to storage
    ext = ""
    if "." in vault_entry.original_filename:
        ext = vault_entry.original_filename.rsplit(".", 1)[-1]
    unique_filename = f"{uuid.uuid4()}.{ext}" if ext else str(uuid.uuid4())
    folder = vault_entry.original_folder.strip("/")
    storage_path = f"{current_user.id}/{folder}/{unique_filename}" if folder else f"{current_user.id}/{unique_filename}"

    minio.client.put_object(
        minio.bucket,
        storage_path,
        io.BytesIO(original_data),
        len(original_data),
        content_type=vault_entry.original_mime_type or "application/octet-stream",
    )

    # Create new file record
    new_file = FileModel(
        user_id=current_user.id,
        filename=unique_filename,
        original_filename=vault_entry.original_filename,
        mime_type=vault_entry.original_mime_type,
        size=vault_entry.original_size,
        storage_path=storage_path,
        folder=vault_entry.original_folder,
    )
    db.add(new_file)

    # Delete encrypted file from MinIO and vault record
    minio.delete_file(vault_entry.encrypted_storage_path)
    await db.delete(vault_entry)

    await db.commit()
    await db.refresh(new_file)

    return {
        "message": "File restored to explorer",
        "file_id": str(new_file.id),
        "filename": new_file.original_filename,
        "folder": new_file.folder,
    }


@router.delete("/files/{vault_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vault_file(
    vault_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Permanently delete a file from the vault."""
    result = await db.execute(
        select(FileVault)
        .where(FileVault.id == vault_id)
        .where(FileVault.user_id == current_user.id)
    )
    vault_entry = result.scalar_one_or_none()
    if not vault_entry:
        raise HTTPException(status_code=404, detail="Vault file not found")

    minio = get_minio_service()
    minio.delete_file(vault_entry.encrypted_storage_path)

    await db.delete(vault_entry)
    await db.commit()


# ── Browser Cookies ───────────────────────────────────────


class CookieImport(BaseModel):
    domain: str
    label: str | None = None
    cookies_json: str  # JSON array string


class CookieListItem(BaseModel):
    id: str
    domain: str
    label: str | None
    updated_at: str


@router.get("/cookies", response_model=list[CookieListItem])
async def list_cookies(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List saved browser cookie domains (values not exposed)."""
    result = await db.execute(
        select(BrowserCookie)
        .where(BrowserCookie.user_id == current_user.id)
        .order_by(BrowserCookie.updated_at.desc())
    )
    items = result.scalars().all()
    return [
        CookieListItem(
            id=str(c.id),
            domain=c.domain,
            label=c.label,
            updated_at=c.updated_at.isoformat() if c.updated_at else "",
        )
        for c in items
    ]


@router.post("/cookies/import", response_model=CookieListItem, status_code=status.HTTP_201_CREATED)
async def import_cookies(
    data: CookieImport,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import browser cookies from JSON."""
    import json as _json
    try:
        cookies = _json.loads(data.cookies_json)
        if not isinstance(cookies, list):
            raise HTTPException(status_code=400, detail="cookies_json must be a JSON array")
    except _json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}")

    key = await get_vault_key(db)
    encrypted = encrypt_text(_json.dumps(cookies, ensure_ascii=False), key)

    # Upsert
    result = await db.execute(
        select(BrowserCookie).where(
            BrowserCookie.user_id == current_user.id,
            BrowserCookie.domain == data.domain,
        )
    )
    row = result.scalar_one_or_none()
    if row:
        row.cookies_encrypted = encrypted
        row.label = data.label or row.label
        row.updated_at = datetime.utcnow()
    else:
        row = BrowserCookie(
            user_id=current_user.id,
            domain=data.domain,
            label=data.label,
            cookies_encrypted=encrypted,
        )
        db.add(row)

    await db.commit()
    await db.refresh(row)

    return CookieListItem(
        id=str(row.id),
        domain=row.domain,
        label=row.label,
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
    )


@router.delete("/cookies/{domain:path}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cookies(
    domain: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete saved cookies for a domain."""
    result = await db.execute(
        select(BrowserCookie).where(
            BrowserCookie.user_id == current_user.id,
            BrowserCookie.domain == domain,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Cookie not found")

    await db.delete(row)
    await db.commit()
