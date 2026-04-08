"""File tool implementations."""

import io
import json
import uuid
import zipfile
from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file import File
from app.services.ai.tools.core import _human_size


async def _list_files(user_id: uuid.UUID, folder: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(File).where(
            File.user_id == user_id,
            File.folder == folder,
            File.deleted_at.is_(None),
        ).order_by(File.original_filename)
    )
    files = result.scalars().all()
    items = [
        {
            "id": str(f.id),
            "name": f.original_filename,
            "size": f.size,
            "size_display": _human_size(f.size),
            "type": f.mime_type,
            "folder": f.folder,
            "indexed": f.is_indexed,
            "index_status": f.index_status.value if f.index_status else None,
        }
        for f in files
    ]
    return json.dumps({"__filelist__": True, "items": items, "count": len(items), "folder": folder}, ensure_ascii=False)


async def _read_file_info(user_id: uuid.UUID, file_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(File).where(
            File.id == uuid.UUID(file_id),
            File.user_id == user_id,
            File.deleted_at.is_(None),
        )
    )
    f = result.scalar_one_or_none()
    if not f:
        return json.dumps({"error": "File not found."})

    # If DB shows 0 bytes but file exists in storage, try to get actual size
    actual_size = f.size
    if actual_size == 0 and f.storage_path:
        try:
            from app.services.storage.minio_service import get_minio_service
            minio = get_minio_service()
            stat = minio.client.stat_object(minio.bucket, f.storage_path)
            actual_size = stat.size or 0
            if actual_size > 0:
                f.size = actual_size
                await db.flush()
        except Exception:
            pass

    data = json.dumps({
        "id": str(f.id),
        "name": f.original_filename,
        "size": actual_size,
        "size_display": _human_size(actual_size),
        "type": f.mime_type,
        "folder": f.folder,
        "indexed": f.is_indexed,
        "created_at": f.created_at.isoformat(),
    }, ensure_ascii=False)
    return f"```fileinfo\n{data}\n```\nInclude the fileinfo block above in your response as-is. This block will be rendered as a file info card UI."


async def _read_file_content(user_id: uuid.UUID, file_id: str, max_length: int, db: AsyncSession) -> str:
    """Read actual file content from MinIO and extract text."""
    result = await db.execute(
        select(File).where(
            File.id == uuid.UUID(file_id),
            File.user_id == user_id,
            File.deleted_at.is_(None),
        )
    )
    f = result.scalar_one_or_none()
    if not f:
        return json.dumps({"error": "File not found."}, ensure_ascii=False)

    if not f.storage_path:
        return json.dumps({"error": "Cannot read file content (it is a folder or has no storage path)."}, ensure_ascii=False)

    mime = f.mime_type or ""

    # Check if file type is supported for text extraction
    from app.services.document.parser_service import DocumentParser
    parser = DocumentParser()

    # Direct text read for plain-text-like types
    TEXT_MIMES = {
        "text/plain", "text/csv", "text/markdown", "text/html", "text/css",
        "text/javascript", "text/xml", "application/json", "application/xml",
        "application/x-sh",
    }
    is_text = mime in TEXT_MIMES
    is_parseable = mime in parser.SUPPORTED_TYPES and parser.SUPPORTED_TYPES[mime] in ("pdf", "docx", "html", "xml", "txt")

    if not is_text and not is_parseable:
        return json.dumps({
            "error": f"This file type ({mime}) does not support text extraction. "
                     "Only text-based files such as PDF, DOCX, TXT, JSON, CSV, HTML, XML are supported."
        }, ensure_ascii=False)

    # Size guard: skip very large files (>20MB)
    if f.size > 20 * 1024 * 1024:
        return json.dumps({
            "error": f"File is too large ({_human_size(f.size)}). Only files up to 20MB can be read."
        }, ensure_ascii=False)

    try:
        from app.services.storage.minio_service import get_minio_service
        minio = get_minio_service()
        file_bytes = minio.download_file(f.storage_path)
        if file_bytes is None:
            return json.dumps({"error": "Cannot download file from storage."}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": f"File download error: {str(e)}"}, ensure_ascii=False)

    try:
        if is_text:
            # Decode raw text
            for enc in ("utf-8", "cp949", "euc-kr", "latin-1"):
                try:
                    text = file_bytes.decode(enc)
                    break
                except (UnicodeDecodeError, LookupError):
                    continue
            else:
                text = file_bytes.decode("utf-8", errors="replace")
        else:
            # Use parser for PDF, DOCX, HTML, XML
            text = parser.parse(file_bytes, mime)
    except Exception as e:
        return json.dumps({"error": f"File content extraction error: {str(e)}"}, ensure_ascii=False)

    if not text or not text.strip():
        return json.dumps({
            "file_name": f.original_filename,
            "content": "(File content is empty)",
        }, ensure_ascii=False)

    # Truncate if too long
    truncated = len(text) > max_length
    content = text[:max_length]

    result_data = {
        "file_name": f.original_filename,
        "file_type": mime,
        "content": content,
    }
    if truncated:
        result_data["truncated"] = True
        result_data["total_length"] = len(text)
        result_data["note"] = f"File content truncated to {max_length} chars. Total length: {len(text)} chars"

    return json.dumps(result_data, ensure_ascii=False)


async def _search_files_by_name(user_id: uuid.UUID, query: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(File).where(
            File.user_id == user_id,
            File.deleted_at.is_(None),
            File.original_filename.ilike(f"%{query}%"),
        ).limit(20)
    )
    files = result.scalars().all()
    items = [
        {
            "id": str(f.id),
            "name": f.original_filename,
            "size": f.size,
            "size_display": _human_size(f.size),
            "type": f.mime_type,
            "folder": f.folder,
            "indexed": f.is_indexed,
            "index_status": f.index_status.value if f.index_status else None,
        }
        for f in files
    ]
    return json.dumps({"__filelist__": True, "items": items, "count": len(items), "query": query}, ensure_ascii=False)


async def _search_files_by_content(user_id: uuid.UUID, query: str, db: AsyncSession) -> str:
    """Semantic content search using embeddings. Falls back to filename search on error."""
    try:
        from app.services.ai.embedding_service import EmbeddingService
        from app.core.settings_manager import load_settings_from_db
        from app.models.embedding import DocumentEmbedding
        from sqlalchemy import text as sa_text

        settings = await load_settings_from_db(db)
        embedding_svc = EmbeddingService(settings)
        query_embedding = await embedding_svc.embed_text(query)

        embedding_vector = f"[{','.join(map(str, query_embedding))}]"

        search_sql = """
            SELECT * FROM (
                SELECT DISTINCT ON (f.id)
                    f.id AS file_id,
                    f.original_filename AS file_name,
                    f.folder,
                    f.size,
                    f.mime_type,
                    f.is_indexed,
                    de.chunk_text,
                    1 - (de.embedding <=> CAST(:embedding AS vector)) as similarity
                FROM document_embeddings de
                JOIN files f ON de.file_id = f.id
                WHERE f.user_id = :user_id
                  AND f.deleted_at IS NULL
                ORDER BY f.id, de.embedding <=> CAST(:embedding AS vector)
            ) AS unique_files
            WHERE similarity >= 0.3
            ORDER BY similarity DESC
            LIMIT 10
        """

        result = await db.execute(sa_text(search_sql), {
            "embedding": embedding_vector,
            "user_id": str(user_id),
        })
        rows = result.fetchall()

        if not rows:
            # No semantic results — fall back to filename search
            return await _search_files_by_name(user_id, query, db)

        items = []
        for row in rows:
            items.append({
                "id": str(row.file_id),
                "name": row.file_name,
                "folder": row.folder,
                "size": row.size,
                "size_display": _human_size(row.size),
                "type": row.mime_type,
                "indexed": row.is_indexed,
                "similarity": round(float(row.similarity), 3),
                "matched_text": row.chunk_text[:200] if row.chunk_text else "",
            })

        return json.dumps({"__filelist__": True, "items": items, "count": len(items), "query": query}, ensure_ascii=False)
    except Exception:
        # Embedding service unavailable — fall back to filename search
        return await _search_files_by_name(user_id, query, db)


async def _create_text_file(
    user_id: uuid.UUID, filename: str, content: str, folder: str, db: AsyncSession
) -> str:
    from app.services.storage.minio_service import get_minio_service

    minio = get_minio_service()
    file_bytes = content.encode("utf-8")
    storage_filename = f"{uuid.uuid4()}_{filename}"
    storage_path = f"{user_id}/{storage_filename}"

    minio.client.put_object(
        minio.bucket,
        storage_path,
        io.BytesIO(file_bytes),
        len(file_bytes),
        content_type="text/plain",
    )

    new_file = File(
        user_id=user_id,
        filename=storage_filename,
        original_filename=filename,
        mime_type="text/plain",
        size=len(file_bytes),
        storage_path=storage_path,
        folder=folder,
    )
    db.add(new_file)
    await db.flush()

    return json.dumps({
        "id": str(new_file.id),
        "name": filename,
        "size": len(file_bytes),
        "message": f"File '{filename}' has been created.",
    }, ensure_ascii=False)


async def _delete_file(user_id: uuid.UUID, file_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(File).where(
            File.id == uuid.UUID(file_id),
            File.user_id == user_id,
            File.deleted_at.is_(None),
        )
    )
    f = result.scalar_one_or_none()
    if not f:
        return json.dumps({"error": "File not found."})

    f.deleted_at = datetime.utcnow()
    await db.flush()
    return json.dumps({"message": f"File '{f.original_filename}' has been deleted."}, ensure_ascii=False)


async def _move_file(user_id: uuid.UUID, file_id: str, target_folder: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(File).where(
            File.id == uuid.UUID(file_id),
            File.user_id == user_id,
            File.deleted_at.is_(None),
        )
    )
    f = result.scalar_one_or_none()
    if not f:
        return json.dumps({"error": "File not found."})

    old_folder = f.folder
    # Normalize target folder (match REST API behavior)
    target_folder = target_folder.strip()
    if ">" in target_folder:
        return json.dumps({"error": "Cannot use '>' in path. Use actual paths, not breadcrumb format. (e.g., /CSY/source)"})
    if not target_folder.startswith("/"):
        target_folder = "/" + target_folder
    target_folder = target_folder.rstrip("/") or "/"

    # If moving a folder, also update children paths
    if f.mime_type == "application/x-folder":
        old_path = f"{old_folder.rstrip('/')}/{f.original_filename}"
        new_path = f"{target_folder.rstrip('/')}/{f.original_filename}"

        # Update direct children
        await db.execute(
            update(File)
            .where(
                File.user_id == user_id,
                File.deleted_at.is_(None),
                File.folder == old_path,
            )
            .values(folder=new_path)
        )

        # Update deeper descendants
        descendants_result = await db.execute(
            select(File).where(
                File.user_id == user_id,
                File.deleted_at.is_(None),
                File.folder.like(f"{old_path}/%"),
            )
        )
        for desc in descendants_result.scalars().all():
            desc.folder = new_path + desc.folder[len(old_path):]

    f.folder = target_folder
    await db.flush()
    return json.dumps({
        "message": f"File '{f.original_filename}' moved from '{old_folder}' to '{target_folder}'.",
    }, ensure_ascii=False)


async def _move_files_batch(
    user_id: uuid.UUID, file_ids: list[str], target_folder: str, db: AsyncSession
) -> str:
    if not file_ids:
        return json.dumps({"error": "Please select files to move."})
    if len(file_ids) > 50:
        return json.dumps({"error": "Maximum 50 files can be moved at once."})

    # Normalize target folder
    target_folder = target_folder.strip()
    if ">" in target_folder:
        return json.dumps({"error": "Cannot use '>' in path. Use actual paths, not breadcrumb format. (e.g., /CSY/source)"})
    if not target_folder.startswith("/"):
        target_folder = "/" + target_folder
    target_folder = target_folder.rstrip("/") or "/"

    moved = []
    failed = []

    for fid in file_ids:
        try:
            result = await db.execute(
                select(File).where(
                    File.id == uuid.UUID(fid),
                    File.user_id == user_id,
                    File.deleted_at.is_(None),
                )
            )
            f = result.scalar_one_or_none()
            if not f:
                failed.append({"id": fid, "error": "File not found."})
                continue

            old_folder = f.folder

            # If moving a folder, also update children paths
            if f.mime_type == "application/x-folder":
                old_path = f"{old_folder.rstrip('/')}/{f.original_filename}"
                new_path = f"{target_folder.rstrip('/')}/{f.original_filename}"

                await db.execute(
                    update(File)
                    .where(
                        File.user_id == user_id,
                        File.deleted_at.is_(None),
                        File.folder == old_path,
                    )
                    .values(folder=new_path)
                )

                descendants_result = await db.execute(
                    select(File).where(
                        File.user_id == user_id,
                        File.deleted_at.is_(None),
                        File.folder.like(f"{old_path}/%"),
                    )
                )
                for desc in descendants_result.scalars().all():
                    desc.folder = new_path + desc.folder[len(old_path):]

            f.folder = target_folder
            moved.append({"id": fid, "name": f.original_filename})
        except Exception as e:
            failed.append({"id": fid, "error": str(e)})

    await db.flush()

    return json.dumps({
        "moved": len(moved),
        "failed": len(failed),
        "target_folder": target_folder,
        "details": moved,
        "errors": failed if failed else [],
        "message": f"{len(moved)} file(s) moved to '{target_folder}'." + (f" ({len(failed)} failed)" if failed else ""),
    }, ensure_ascii=False)


async def _create_folder(user_id: uuid.UUID, name: str, parent_folder: str, db: AsyncSession) -> str:
    if not name or "/" in name:
        return json.dumps({"error": "Invalid folder name."})

    parent_folder = parent_folder.strip()
    if ">" in parent_folder:
        return json.dumps({"error": "Cannot use '>' in path. Use actual paths, not breadcrumb format. (e.g., /CSY)"})
    if not parent_folder.startswith("/"):
        parent_folder = "/" + parent_folder

    # Check if folder already exists
    existing = await db.execute(
        select(File).where(
            File.user_id == user_id,
            File.mime_type == "application/x-folder",
            File.original_filename == name,
            File.folder == parent_folder,
            File.deleted_at.is_(None),
        )
    )
    if existing.scalar_one_or_none():
        return json.dumps({"error": f"Folder '{name}' already exists."})

    folder_record = File(
        user_id=user_id,
        filename=".folder",
        original_filename=name,
        mime_type="application/x-folder",
        size=0,
        storage_path="",
        folder=parent_folder,
    )
    db.add(folder_record)
    await db.flush()

    folder_path = f"{parent_folder.rstrip('/')}/{name}"
    return json.dumps({
        "message": f"Folder '{name}' created in '{parent_folder}'.",
        "path": folder_path,
    }, ensure_ascii=False)


async def _share_file(user_id: uuid.UUID, file_id: str, db: AsyncSession) -> str:
    import secrets
    from app.models.file_share import FileShare
    from app.core.config import get_settings

    result = await db.execute(
        select(File).where(
            File.id == uuid.UUID(file_id),
            File.user_id == user_id,
            File.deleted_at.is_(None),
        )
    )
    f = result.scalar_one_or_none()
    if not f:
        return json.dumps({"error": "File not found."})
    if f.mime_type == "application/x-folder":
        return json.dumps({"error": "Folders cannot be shared."})

    try:
        share = FileShare(
            file_id=f.id,
            user_id=user_id,
            token=secrets.token_urlsafe(8)[:10],
            expires_at=datetime.utcnow() + timedelta(days=7),
        )
        db.add(share)
        await db.flush()

        settings = get_settings()
        url = f"{settings.frontend_url}/s/{share.token}"

        return json.dumps({
            "message": f"Sharing link created for '{f.original_filename}' (valid for 7 days).",
            "url": url,
            "token": share.token,
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": f"Failed to create sharing link: {str(e)}"})


async def _compress_files(
    user_id: uuid.UUID, file_ids: list[str], zip_name: str, folder: str, db: AsyncSession
) -> str:
    from app.services.storage.minio_service import get_minio_service

    if not file_ids:
        return json.dumps({"error": "Please select files to compress."})
    if len(file_ids) > 50:
        return json.dumps({"error": "Maximum 50 files can be compressed at once."})

    minio = get_minio_service()
    buf = io.BytesIO()
    compressed_count = 0

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for fid in file_ids:
            try:
                result = await db.execute(
                    select(File).where(
                        File.id == uuid.UUID(fid),
                        File.user_id == user_id,
                        File.deleted_at.is_(None),
                    )
                )
                f = result.scalar_one_or_none()
                if not f or f.mime_type == "application/x-folder":
                    continue
                data = minio.download_file(f.storage_path)
                zf.writestr(f.original_filename, data)
                compressed_count += 1
            except Exception:
                continue

    if compressed_count == 0:
        return json.dumps({"error": "No files available to compress."})

    zip_bytes = buf.getvalue()
    if not zip_name.endswith(".zip"):
        zip_name += ".zip"
    storage_filename = f"{uuid.uuid4()}_{zip_name}"
    storage_path = f"{user_id}/{storage_filename}"

    minio.client.put_object(
        minio.bucket,
        storage_path,
        io.BytesIO(zip_bytes),
        len(zip_bytes),
        content_type="application/zip",
    )

    new_file = File(
        user_id=user_id,
        filename=storage_filename,
        original_filename=zip_name,
        mime_type="application/zip",
        size=len(zip_bytes),
        storage_path=storage_path,
        folder=folder,
    )
    db.add(new_file)
    await db.flush()

    return json.dumps({
        "id": str(new_file.id),
        "name": zip_name,
        "size": len(zip_bytes),
        "size_display": _human_size(len(zip_bytes)),
        "message": f"{compressed_count} file(s) compressed into '{zip_name}'.",
    }, ensure_ascii=False)


async def _decompress_file(user_id: uuid.UUID, file_id: str, db: AsyncSession) -> str:
    from app.services.storage.minio_service import get_minio_service

    result = await db.execute(
        select(File).where(
            File.id == uuid.UUID(file_id),
            File.user_id == user_id,
            File.deleted_at.is_(None),
        )
    )
    f = result.scalar_one_or_none()
    if not f:
        return json.dumps({"error": "File not found."})

    if f.mime_type not in ("application/zip", "application/x-zip-compressed"):
        return json.dumps({"error": "Only ZIP files can be extracted."})

    minio = get_minio_service()
    zip_data = minio.download_file(f.storage_path)

    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_data))
    except zipfile.BadZipFile:
        return json.dumps({"error": "Invalid ZIP file."})

    # Create subfolder named after the ZIP file (without .zip extension)
    zip_basename = f.original_filename
    if zip_basename.lower().endswith(".zip"):
        zip_basename = zip_basename[:-4]

    parent_folder = f.folder
    target_folder = f"{parent_folder.rstrip('/')}/{zip_basename}"

    # Create folder record if it doesn't exist
    existing_folder = await db.execute(
        select(File).where(
            File.user_id == user_id,
            File.mime_type == "application/x-folder",
            File.original_filename == zip_basename,
            File.folder == parent_folder,
            File.deleted_at.is_(None),
        )
    )
    if not existing_folder.scalar_one_or_none():
        folder_record = File(
            user_id=user_id,
            filename=".folder",
            original_filename=zip_basename,
            mime_type="application/x-folder",
            size=0,
            storage_path="",
            folder=parent_folder,
        )
        db.add(folder_record)

    extracted = []
    for info in zf.infolist():
        if info.is_dir() or info.file_size == 0:
            continue
        if len(extracted) >= 100:
            break

        name = info.filename.split("/")[-1]  # flatten paths
        if not name:
            continue

        content = zf.read(info.filename)
        storage_filename = f"{uuid.uuid4()}_{name}"
        storage_path = f"{user_id}/{storage_filename}"

        # Guess content type
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        mime_map = {
            "txt": "text/plain", "md": "text/markdown", "pdf": "application/pdf",
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
            "gif": "image/gif", "webp": "image/webp",
            "mp3": "audio/mpeg", "wav": "audio/wav", "mp4": "video/mp4",
            "zip": "application/zip", "json": "application/json",
            "csv": "text/csv", "html": "text/html",
        }
        content_type = mime_map.get(ext, "application/octet-stream")

        minio.client.put_object(
            minio.bucket, storage_path, io.BytesIO(content), len(content),
            content_type=content_type,
        )

        new_file = File(
            user_id=user_id,
            filename=storage_filename,
            original_filename=name,
            mime_type=content_type,
            size=len(content),
            storage_path=storage_path,
            folder=target_folder,
        )
        db.add(new_file)
        extracted.append({"name": name, "size_display": _human_size(len(content))})

    zf.close()
    await db.flush()

    if not extracted:
        return json.dumps({"error": "ZIP file is empty."})

    return json.dumps({
        "message": f"Extracted {len(extracted)} file(s) from '{f.original_filename}' to '{target_folder}'.",
        "folder": target_folder,
        "files": extracted,
    }, ensure_ascii=False)
