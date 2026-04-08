"""WebDAV authentication: supports Basic Auth and Bearer token."""

import base64
from starlette.requests import Request
from starlette.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.security import verify_password, decode_token
from app.models.user import User


class WebDAVAuthError(Exception):
    """Raised when WebDAV authentication fails."""
    def __init__(self, detail: str = "Unauthorized"):
        self.detail = detail


async def authenticate_webdav(request: Request) -> tuple[User, AsyncSession]:
    """
    Authenticate a WebDAV request. Supports:
    1. Basic Auth (username=email, password=plaintext)
    2. Bearer token (existing JWT)

    Returns (user, db_session). Caller must close db_session.
    Raises WebDAVAuthError on failure.
    """
    auth_header = request.headers.get("Authorization", "")

    db = AsyncSessionLocal()
    try:
        if auth_header.startswith("Basic "):
            user = await _auth_basic(auth_header, db)
        elif auth_header.startswith("Bearer "):
            user = await _auth_bearer(auth_header, db)
        else:
            raise WebDAVAuthError("Missing or invalid Authorization header")
        return user, db
    except WebDAVAuthError:
        await db.close()
        raise


async def _auth_basic(auth_header: str, db: AsyncSession) -> User:
    """Decode Basic Auth, look up user by email, verify bcrypt password."""
    try:
        encoded = auth_header[6:]
        decoded = base64.b64decode(encoded).decode("utf-8")
        email, password = decoded.split(":", 1)
    except Exception:
        raise WebDAVAuthError("Malformed Basic Auth header")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(password, user.hashed_password):
        raise WebDAVAuthError("Invalid credentials")
    if not user.is_active:
        raise WebDAVAuthError("User is inactive")

    return user


async def _auth_bearer(auth_header: str, db: AsyncSession) -> User:
    """Validate JWT Bearer token."""
    token = auth_header[7:]
    try:
        payload = decode_token(token)
    except Exception:
        raise WebDAVAuthError("Invalid token")

    if payload.get("type") != "access":
        raise WebDAVAuthError("Invalid token type")

    user_id = payload.get("sub")
    if not user_id:
        raise WebDAVAuthError("Invalid token payload")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise WebDAVAuthError("User not found or inactive")

    return user


def unauthorized_response(detail: str = "Unauthorized") -> Response:
    """Return a 401 with WWW-Authenticate header for WebDAV clients."""
    return Response(
        content=detail,
        status_code=401,
        headers={"WWW-Authenticate": 'Basic realm="Martani WebDAV"'},
    )
