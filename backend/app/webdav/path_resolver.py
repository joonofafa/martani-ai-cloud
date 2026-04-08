"""URL path ↔ DB folder/filename mapping for WebDAV."""

from urllib.parse import quote
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file import File as FileModel
from app.models.user import User


def parse_webdav_path(webdav_path: str) -> tuple[str, str]:
    """
    Parse the captured URL path into (username, relative_path).

    Input:  "user@example.com/Documents/report.pdf"
    Output: ("user@example.com", "/Documents/report.pdf")

    Input:  "user@example.com" or "user@example.com/"
    Output: ("user@example.com", "/")
    """
    parts = webdav_path.strip("/").split("/", 1)
    username = parts[0]
    relative_path = "/" + parts[1] if len(parts) > 1 else "/"
    # Normalize trailing slashes
    if relative_path != "/":
        relative_path = relative_path.rstrip("/")
    return username, relative_path


def split_parent_and_name(path: str) -> tuple[str, str | None]:
    """
    Split a path into parent folder and item name.

    "/Documents/report.pdf" -> ("/Documents", "report.pdf")
    "/Documents"            -> ("/", "Documents")
    "/"                     -> ("/", None)
    """
    path = path.rstrip("/")
    if not path or path == "/":
        return "/", None

    last_slash = path.rfind("/")
    parent = path[:last_slash] if last_slash > 0 else "/"
    name = path[last_slash + 1:]
    return parent, name


def build_href(username: str, path: str) -> str:
    """Build a properly percent-encoded WebDAV href from username and path.

    Each path segment is individually encoded so that '/' separators are preserved.
    The username (email) is also encoded (@ → %40 etc.).
    """
    encoded_user = quote(username, safe="")
    if path == "/":
        return f"/remote.php/dav/files/{encoded_user}/"
    # Encode each segment individually, preserving '/' separators
    segments = path.split("/")
    encoded_path = "/".join(quote(seg, safe="") for seg in segments)
    return f"/remote.php/dav/files/{encoded_user}{encoded_path}"


def parse_destination_header(destination: str) -> tuple[str, str]:
    """
    Parse the Destination header (full URL) into (username, path).

    Input: "https://server.com/remote.php/dav/files/user@test.com/NewFolder/file.txt"
    Output: ("user@test.com", "/NewFolder/file.txt")
    """
    from urllib.parse import urlparse
    parsed = urlparse(destination)
    path = parsed.path

    prefix = "/remote.php/dav/files/"
    if prefix in path:
        remainder = path[path.index(prefix) + len(prefix):]
        return parse_webdav_path(remainder)

    # Fallback: treat entire path as webdav path
    return parse_webdav_path(path.lstrip("/"))


async def resolve_path(
    db: AsyncSession,
    user: User,
    path: str,
) -> FileModel | None:
    """
    Resolve a WebDAV path to a File record.

    For "/" returns None (virtual root, always exists).
    For "/Documents" looks for folder with original_filename="Documents" in folder="/".
    For "/Documents/report.pdf" looks for file with original_filename="report.pdf" in folder="/Documents".
    """
    if path == "/" or path == "":
        return None

    parent, name = split_parent_and_name(path)
    if name is None:
        return None

    result = await db.execute(
        select(FileModel).where(
            FileModel.user_id == user.id,
            FileModel.original_filename == name,
            FileModel.folder == parent,
            FileModel.deleted_at.is_(None),
        )
    )
    return result.scalars().first()


async def list_directory(
    db: AsyncSession,
    user: User,
    folder_path: str,
) -> list[FileModel]:
    """List all items (files + folders) in a directory."""
    result = await db.execute(
        select(FileModel).where(
            FileModel.user_id == user.id,
            FileModel.folder == folder_path,
            FileModel.deleted_at.is_(None),
        ).order_by(FileModel.original_filename)
    )
    return list(result.scalars().all())


def is_folder_record(file_record: FileModel | None, path: str) -> bool:
    """Check if a path refers to a folder."""
    if path == "/" or path == "":
        return True
    if file_record is None:
        return False
    return file_record.mime_type == "application/x-folder"
