"""WebDAV method handlers for OwnCloud compatibility."""

import io
import logging
import uuid
from datetime import datetime
from urllib.parse import quote

from starlette.requests import Request
from starlette.responses import Response
from sqlalchemy import select, update, func

from app.models.file import File as FileModel
from app.models.user import User
from app.models.embedding import DocumentEmbedding
from app.services.storage.minio_service import get_minio_service
from app.api.files import _resolve_mime

from app.services.audit_service import write_audit_log as _audit
from .auth import authenticate_webdav, unauthorized_response, WebDAVAuthError
from .path_resolver import (
    parse_webdav_path,
    split_parent_and_name,
    build_href,
    parse_destination_header,
    resolve_path,
    list_directory,
    is_folder_record,
)
from .xml_builder import build_multistatus, build_response_element, generate_etag

logger = logging.getLogger(__name__)


async def handle_options(request: Request) -> Response:
    """Return DAV capabilities. OwnCloud clients check this on connect."""
    return Response(
        status_code=200,
        headers={
            "DAV": "1, 2, 3",
            "Allow": "OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, MKCOL, MOVE, COPY",
            "MS-Author-Via": "DAV",
        },
    )


async def handle_propfind(request: Request) -> Response:
    """List directory contents or get file properties (207 Multi-Status)."""
    try:
        user, db = await authenticate_webdav(request)
    except WebDAVAuthError as e:
        return unauthorized_response(e.detail)

    try:
        username, path = parse_webdav_path(request.path_params["webdav_path"])
        if not _verify_username(username, user):
            return Response(status_code=403, content="Access denied")

        depth = request.headers.get("Depth", "1")

        file_record = await resolve_path(db, user, path)
        is_dir = is_folder_record(file_record, path)

        responses = []

        if is_dir:
            # Add the directory itself
            responses.append(build_response_element(
                href=build_href(username, path),
                file_record=file_record,
                is_folder=True,
                is_root=(path == "/"),
            ))

            if depth == "1":
                folder_path = path if path == "/" else path
                items = await list_directory(db, user, folder_path)
                for item in items:
                    item_is_folder = item.mime_type == "application/x-folder"
                    item_path = f"{path.rstrip('/')}/{item.original_filename}"
                    href = build_href(username, item_path)
                    if item_is_folder:
                        href += "/"
                    responses.append(build_response_element(
                        href=href,
                        file_record=item,
                        is_folder=item_is_folder,
                    ))
        else:
            if file_record is None:
                return Response(status_code=404, content="Not Found")
            responses.append(build_response_element(
                href=build_href(username, path),
                file_record=file_record,
                is_folder=False,
            ))

        xml_body = build_multistatus(responses)
        return Response(
            content=xml_body,
            status_code=207,
            media_type="application/xml; charset=utf-8",
        )
    finally:
        await db.close()


async def handle_get(request: Request) -> Response:
    """Download a file, or show directory listing for folders."""
    try:
        user, db = await authenticate_webdav(request)
    except WebDAVAuthError as e:
        return unauthorized_response(e.detail)

    try:
        username, path = parse_webdav_path(request.path_params["webdav_path"])
        if not _verify_username(username, user):
            return Response(status_code=403, content="Access denied")

        file_record = await resolve_path(db, user, path)
        is_dir = is_folder_record(file_record, path)

        if is_dir:
            # Browser-friendly directory listing
            items = await list_directory(db, user, path)
            return _build_directory_html(username, path, items)

        if not file_record:
            return Response(status_code=404, content="Not Found")

        minio = get_minio_service()
        content = minio.download_file(file_record.storage_path)

        await _audit(
            user_id=user.id, action="webdav_download", resource_type="file",
            resource_id=str(file_record.id),
            detail={"filename": file_record.original_filename, "size": file_record.size},
            request=request,
        )

        return Response(
            content=content,
            media_type=file_record.mime_type or "application/octet-stream",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{quote(file_record.original_filename)}",
                "ETag": f'"{generate_etag(file_record)}"',
                "Content-Length": str(file_record.size),
                "Last-Modified": file_record.updated_at.strftime("%a, %d %b %Y %H:%M:%S GMT"),
            },
        )
    finally:
        await db.close()


async def handle_head(request: Request) -> Response:
    """Get file headers without body."""
    try:
        user, db = await authenticate_webdav(request)
    except WebDAVAuthError as e:
        return unauthorized_response(e.detail)

    try:
        username, path = parse_webdav_path(request.path_params["webdav_path"])
        if not _verify_username(username, user):
            return Response(status_code=403, content="Access denied")

        if path == "/":
            return Response(status_code=200)

        file_record = await resolve_path(db, user, path)
        if not file_record:
            return Response(status_code=404)

        return Response(
            status_code=200,
            headers={
                "Content-Type": file_record.mime_type or "application/octet-stream",
                "Content-Length": str(file_record.size),
                "ETag": f'"{generate_etag(file_record)}"',
                "Last-Modified": file_record.updated_at.strftime("%a, %d %b %Y %H:%M:%S GMT"),
            },
        )
    finally:
        await db.close()


async def handle_put(request: Request) -> Response:
    """Upload a file (create or overwrite)."""
    try:
        user, db = await authenticate_webdav(request)
    except WebDAVAuthError as e:
        return unauthorized_response(e.detail)

    try:
        username, path = parse_webdav_path(request.path_params["webdav_path"])
        if not _verify_username(username, user):
            return Response(status_code=403, content="Access denied")

        parent, filename = split_parent_and_name(path)
        if not filename:
            return Response(status_code=403, content="Cannot PUT to root")

        # Check storage quota (admins are exempt)
        if user.role != "admin" and user.storage_used >= user.storage_quota:
            return Response(status_code=507, content="Storage quota exceeded")

        body = await request.body()
        raw_ct = request.headers.get("Content-Type", "application/octet-stream")
        content_type = _resolve_mime(raw_ct, filename)

        existing = await resolve_path(db, user, path)
        minio = get_minio_service()

        if existing and existing.mime_type != "application/x-folder":
            # Overwrite existing file — upload new first, then delete old (M1)
            old_storage = existing.storage_path
            old_size = existing.size

            storage_path, file_size = _upload_bytes(
                minio, body, content_type, str(user.id), parent, filename
            )

            try:
                minio.delete_file(old_storage)
            except Exception:
                logger.warning("Failed to delete old MinIO object: %s", old_storage)

            # Clear old embeddings before re-indexing
            await db.execute(
                DocumentEmbedding.__table__.delete().where(
                    DocumentEmbedding.file_id == existing.id
                )
            )

            delta = file_size - old_size
            await _atomic_storage_update(db, user, delta)

            existing.size = file_size
            existing.mime_type = content_type
            existing.storage_path = storage_path
            existing.updated_at = datetime.utcnow()

            await db.commit()
            await db.refresh(existing)

            # Dispatch indexing (H2)
            _dispatch_indexing(existing)

            await _audit(
                user_id=user.id, action="webdav_upload", resource_type="file",
                resource_id=str(existing.id),
                detail={"filename": filename, "size": file_size, "folder": parent, "overwrite": True},
                request=request,
            )

            return Response(
                status_code=204,
                headers={"ETag": f'"{generate_etag(existing)}"'},
            )
        else:
            # New file
            storage_path, file_size = _upload_bytes(
                minio, body, content_type, str(user.id), parent, filename
            )

            file_ext = filename.rsplit(".", 1)[-1] if "." in filename else ""
            unique_fn = f"{uuid.uuid4()}.{file_ext}" if file_ext else str(uuid.uuid4())

            file_record = FileModel(
                filename=unique_fn,
                original_filename=filename,
                mime_type=content_type,
                size=file_size,
                storage_path=storage_path,
                folder=parent,
                user_id=user.id,
            )
            db.add(file_record)
            await _atomic_storage_update(db, user, file_size)

            await db.commit()
            await db.refresh(file_record)

            # Dispatch indexing (H2)
            _dispatch_indexing(file_record)

            await _audit(
                user_id=user.id, action="webdav_upload", resource_type="file",
                resource_id=str(file_record.id),
                detail={"filename": filename, "size": file_size, "folder": parent},
                request=request,
            )

            return Response(
                status_code=201,
                headers={"ETag": f'"{generate_etag(file_record)}"'},
            )
    finally:
        await db.close()


async def handle_mkcol(request: Request) -> Response:
    """Create a folder (collection)."""
    try:
        user, db = await authenticate_webdav(request)
    except WebDAVAuthError as e:
        return unauthorized_response(e.detail)

    try:
        username, path = parse_webdav_path(request.path_params["webdav_path"])
        if not _verify_username(username, user):
            return Response(status_code=403, content="Access denied")

        parent, folder_name = split_parent_and_name(path)
        if not folder_name:
            return Response(status_code=405, content="Cannot create root")

        # Check parent exists (if not root)
        if parent != "/":
            parent_record = await resolve_path(db, user, parent)
            if not parent_record or parent_record.mime_type != "application/x-folder":
                return Response(status_code=409, content="Parent folder does not exist")

        # Check folder doesn't already exist
        existing = await resolve_path(db, user, path)
        if existing:
            return Response(status_code=405, content="Already exists")

        folder_record = FileModel(
            filename=".folder",
            original_filename=folder_name,
            mime_type="application/x-folder",
            size=0,
            storage_path="",
            folder=parent,
            user_id=user.id,
        )
        db.add(folder_record)
        await db.commit()

        return Response(status_code=201)
    finally:
        await db.close()


async def handle_delete(request: Request) -> Response:
    """Delete a file or folder (recursive soft delete + MinIO + embeddings)."""
    try:
        user, db = await authenticate_webdav(request)
    except WebDAVAuthError as e:
        return unauthorized_response(e.detail)

    try:
        username, path = parse_webdav_path(request.path_params["webdav_path"])
        if not _verify_username(username, user):
            return Response(status_code=403, content="Access denied")

        if path == "/":
            return Response(status_code=403, content="Cannot delete root")

        file_record = await resolve_path(db, user, path)
        if not file_record:
            return Response(status_code=404, content="Not Found")

        now = datetime.utcnow()
        minio = get_minio_service()
        deleted_ids: list = [file_record.id]
        total_size = file_record.size

        if file_record.mime_type == "application/x-folder":
            # Recursively soft-delete folder contents, collecting IDs and sizes
            folder_path = f"{file_record.folder.rstrip('/')}/{file_record.original_filename}"
            child_ids, child_size = await _delete_folder_recursive(
                db, user, folder_path, now, minio
            )
            deleted_ids.extend(child_ids)
            total_size += child_size
        else:
            # Delete MinIO object for non-folder file
            try:
                minio.delete_file(file_record.storage_path)
            except Exception:
                logger.warning("Failed to delete MinIO object: %s", file_record.storage_path)

        # Soft delete the item itself
        file_record.deleted_at = now

        # Clean up embeddings for all deleted files
        if deleted_ids:
            await db.execute(
                DocumentEmbedding.__table__.delete().where(
                    DocumentEmbedding.file_id.in_(deleted_ids)
                )
            )

        # Atomic storage update
        await _atomic_storage_update(db, user, -total_size)

        await db.commit()

        await _audit(
            user_id=user.id, action="webdav_delete", resource_type="file",
            resource_id=str(file_record.id),
            detail={"filename": file_record.original_filename, "is_folder": file_record.mime_type == "application/x-folder"},
            request=request,
        )

        return Response(status_code=204)
    finally:
        await db.close()


async def handle_move(request: Request) -> Response:
    """Move or rename a file/folder."""
    try:
        user, db = await authenticate_webdav(request)
    except WebDAVAuthError as e:
        return unauthorized_response(e.detail)

    try:
        username, src_path = parse_webdav_path(request.path_params["webdav_path"])
        if not _verify_username(username, user):
            return Response(status_code=403, content="Access denied")

        destination = request.headers.get("Destination")
        if not destination:
            return Response(status_code=400, content="Missing Destination header")

        dest_username, dest_path = parse_destination_header(destination)
        if dest_username != username:
            return Response(status_code=403, content="Cross-user move not allowed")

        overwrite = request.headers.get("Overwrite", "T") == "T"

        src_record = await resolve_path(db, user, src_path)
        if not src_record:
            return Response(status_code=404, content="Source not found")

        dest_parent, dest_name = split_parent_and_name(dest_path)

        # Check destination exists
        dest_existing = await resolve_path(db, user, dest_path)
        if dest_existing:
            if not overwrite:
                return Response(status_code=412, content="Destination exists")
            dest_existing.deleted_at = datetime.utcnow()

            # Clean up MinIO + embeddings for overwritten non-folder (M5)
            if dest_existing.mime_type != "application/x-folder":
                minio = get_minio_service()
                try:
                    minio.delete_file(dest_existing.storage_path)
                except Exception:
                    logger.warning("Failed to delete MinIO object: %s", dest_existing.storage_path)
                await db.execute(
                    DocumentEmbedding.__table__.delete().where(
                        DocumentEmbedding.file_id == dest_existing.id
                    )
                )

            await _atomic_storage_update(db, user, -dest_existing.size)

        # For folder moves, update all children's folder paths
        # Note: storage_path in MinIO is not changed — it's an opaque key (L1)
        if src_record.mime_type == "application/x-folder":
            old_folder_path = f"{src_record.folder.rstrip('/')}/{src_record.original_filename}"
            new_folder_path = f"{dest_parent.rstrip('/')}/{dest_name}"
            await _move_folder_children(db, user, old_folder_path, new_folder_path)

        # Update the record itself
        src_record.folder = dest_parent
        src_record.original_filename = dest_name
        src_record.updated_at = datetime.utcnow()

        await db.commit()

        await _audit(
            user_id=user.id, action="webdav_move", resource_type="file",
            resource_id=str(src_record.id),
            detail={"filename": src_record.original_filename, "src": src_path, "dest": dest_path},
            request=request,
        )

        status_code = 204 if dest_existing else 201
        return Response(status_code=status_code)
    finally:
        await db.close()


async def handle_copy(request: Request) -> Response:
    """Copy a file."""
    try:
        user, db = await authenticate_webdav(request)
    except WebDAVAuthError as e:
        return unauthorized_response(e.detail)

    try:
        username, src_path = parse_webdav_path(request.path_params["webdav_path"])
        if not _verify_username(username, user):
            return Response(status_code=403, content="Access denied")

        destination = request.headers.get("Destination")
        if not destination:
            return Response(status_code=400, content="Missing Destination header")

        overwrite = request.headers.get("Overwrite", "T") == "T"

        dest_username, dest_path = parse_destination_header(destination)
        if dest_username != username:
            return Response(status_code=403, content="Cross-user copy not allowed")

        dest_parent, dest_name = split_parent_and_name(dest_path)

        src_record = await resolve_path(db, user, src_path)
        if not src_record:
            return Response(status_code=404, content="Source not found")

        if src_record.mime_type == "application/x-folder":
            return Response(status_code=403, content="Folder copy not supported")

        minio = get_minio_service()

        # Check destination conflict (M3)
        dest_existing = await resolve_path(db, user, dest_path)
        existed = False
        if dest_existing:
            if not overwrite:
                return Response(status_code=412, content="Destination exists")
            existed = True
            # Soft-delete + MinIO + embedding cleanup for overwritten file
            dest_existing.deleted_at = datetime.utcnow()
            if dest_existing.mime_type != "application/x-folder":
                try:
                    minio.delete_file(dest_existing.storage_path)
                except Exception:
                    logger.warning("Failed to delete MinIO object: %s", dest_existing.storage_path)
                await db.execute(
                    DocumentEmbedding.__table__.delete().where(
                        DocumentEmbedding.file_id == dest_existing.id
                    )
                )
            await _atomic_storage_update(db, user, -dest_existing.size)

        # Check quota (admins are exempt)
        if user.role != "admin" and user.storage_used + src_record.size > user.storage_quota:
            return Response(status_code=507, content="Storage quota exceeded")

        # Copy file in MinIO
        content = minio.download_file(src_record.storage_path)
        storage_path, file_size = _upload_bytes(
            minio, content, src_record.mime_type or "application/octet-stream",
            str(user.id), dest_parent, dest_name,
        )

        file_ext = dest_name.rsplit(".", 1)[-1] if "." in dest_name else ""
        unique_fn = f"{uuid.uuid4()}.{file_ext}" if file_ext else str(uuid.uuid4())

        new_record = FileModel(
            filename=unique_fn,
            original_filename=dest_name,
            mime_type=src_record.mime_type,
            size=file_size,
            storage_path=storage_path,
            folder=dest_parent,
            user_id=user.id,
        )
        db.add(new_record)
        await _atomic_storage_update(db, user, file_size)
        await db.commit()

        await _audit(
            user_id=user.id, action="webdav_copy", resource_type="file",
            resource_id=str(new_record.id),
            detail={"filename": dest_name, "src": src_path, "dest": dest_path, "size": file_size},
            request=request,
        )

        return Response(status_code=204 if existed else 201)
    finally:
        await db.close()


# ============== Helper Functions ==============


def _verify_username(username: str, user: User) -> bool:
    """Verify the URL username matches the authenticated user."""
    return username == user.email


def _upload_bytes(
    minio, content: bytes, content_type: str,
    user_id: str, folder: str, filename: str,
) -> tuple[str, int]:
    """Upload raw bytes to MinIO, returning (storage_path, size)."""
    file_ext = filename.rsplit(".", 1)[-1] if "." in filename else ""
    unique_name = f"{uuid.uuid4()}.{file_ext}" if file_ext else str(uuid.uuid4())

    folder_clean = folder.strip("/")
    if folder_clean:
        storage_path = f"{user_id}/{folder_clean}/{unique_name}"
    else:
        storage_path = f"{user_id}/{unique_name}"

    file_size = len(content)
    minio.client.put_object(
        minio.bucket,
        storage_path,
        io.BytesIO(content),
        file_size,
        content_type=content_type,
    )
    return storage_path, file_size


async def _delete_folder_recursive(
    db, user: User, folder_path: str, now: datetime, minio
) -> tuple[list, int]:
    """Soft-delete all items inside a folder recursively.

    Returns (deleted_file_ids, total_size) for embedding cleanup and storage accounting.
    """
    result = await db.execute(
        select(FileModel).where(
            FileModel.user_id == user.id,
            FileModel.folder == folder_path,
            FileModel.deleted_at.is_(None),
        )
    )
    children = result.scalars().all()

    deleted_ids: list = []
    total_size = 0

    for child in children:
        if child.mime_type == "application/x-folder":
            subfolder_path = f"{folder_path.rstrip('/')}/{child.original_filename}"
            sub_ids, sub_size = await _delete_folder_recursive(
                db, user, subfolder_path, now, minio
            )
            deleted_ids.extend(sub_ids)
            total_size += sub_size
        else:
            # Delete MinIO object for non-folder files
            try:
                minio.delete_file(child.storage_path)
            except Exception:
                logger.warning("Failed to delete MinIO object: %s", child.storage_path)
        child.deleted_at = now
        deleted_ids.append(child.id)
        total_size += child.size

    return deleted_ids, total_size


async def _move_folder_children(db, user: User, old_path: str, new_path: str):
    """Update folder column for all items inside a moved folder."""
    result = await db.execute(
        select(FileModel).where(
            FileModel.user_id == user.id,
            FileModel.folder == old_path,
            FileModel.deleted_at.is_(None),
        )
    )
    children = result.scalars().all()

    for child in children:
        if child.mime_type == "application/x-folder":
            old_subfolder = f"{old_path.rstrip('/')}/{child.original_filename}"
            new_subfolder = f"{new_path.rstrip('/')}/{child.original_filename}"
            await _move_folder_children(db, user, old_subfolder, new_subfolder)
        child.folder = new_path


async def _atomic_storage_update(db, user: User, delta: int):
    """Atomically update user.storage_used by delta, clamped to >= 0."""
    await db.execute(
        update(User).where(User.id == user.id)
        .values(storage_used=func.greatest(0, User.storage_used + delta))
    )
    await db.refresh(user)


def _dispatch_indexing(file_record: FileModel):
    """Dispatch Celery indexing task matching the app API pattern."""
    try:
        from app.tasks.indexing import index_file_task, index_audio_file_task
        from app.services.document.parser_service import get_document_parser

        parser = get_document_parser()
        mime = file_record.mime_type or ""
        category = parser.get_file_category(mime)
        if category == "audio":
            index_audio_file_task.delay(str(file_record.id))
        elif category is not None:
            index_file_task.delay(str(file_record.id))
    except Exception:
        pass  # Don't fail the WebDAV operation if indexing dispatch fails


def _build_directory_html(username: str, path: str, items: list[FileModel]) -> Response:
    """Build a simple HTML directory listing for browser access."""
    from html import escape

    title = f"Index of {escape(path)}"
    base = f"/remote.php/dav/files/{escape(username)}"

    rows = []
    # Parent directory link
    if path != "/":
        parent, _ = split_parent_and_name(path)
        parent_href = f"{base}{parent}" if parent != "/" else f"{base}/"
        rows.append(f'<tr><td>📁</td><td><a href="{parent_href}">..</a></td><td>-</td><td>-</td></tr>')

    for item in items:
        item_path = f"{path.rstrip('/')}/{item.original_filename}"
        href = f"{base}{item_path}"
        if item.mime_type == "application/x-folder":
            href += "/"
            icon = "📁"
            size = "-"
        else:
            icon = "📄"
            size = _format_size(item.size)
        name = escape(item.original_filename)
        modified = item.updated_at.strftime("%Y-%m-%d %H:%M")
        rows.append(f'<tr><td>{icon}</td><td><a href="{href}">{name}</a></td><td>{size}</td><td>{modified}</td></tr>')

    rows_html = "\n".join(rows)
    html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>{title}</title>
<style>
  body {{ font-family: -apple-system, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #333; }}
  h1 {{ font-size: 1.4em; border-bottom: 1px solid #ddd; padding-bottom: 10px; }}
  table {{ width: 100%; border-collapse: collapse; }}
  th, td {{ text-align: left; padding: 8px 12px; }}
  tr:hover {{ background: #f5f5f5; }}
  a {{ color: #0066cc; text-decoration: none; }}
  a:hover {{ text-decoration: underline; }}
  .header {{ color: #666; font-size: 0.85em; }}
</style>
</head>
<body>
<h1>{title}</h1>
<table>
<tr class="header"><th></th><th>Name</th><th>Size</th><th>Modified</th></tr>
{rows_html}
</table>
<p style="color:#999;font-size:0.8em;margin-top:30px;">Martani WebDAV</p>
</body>
</html>"""
    return Response(content=html, media_type="text/html; charset=utf-8")


def _format_size(size: int) -> str:
    """Format file size for display."""
    if size < 1024:
        return f"{size} B"
    elif size < 1024 * 1024:
        return f"{size / 1024:.1f} KB"
    elif size < 1024 * 1024 * 1024:
        return f"{size / (1024 * 1024):.1f} MB"
    else:
        return f"{size / (1024 * 1024 * 1024):.1f} GB"
