"""WebDAV route registration using Starlette Route for custom HTTP methods."""

from starlette.routing import Route

from .handlers import (
    handle_propfind,
    handle_get,
    handle_head,
    handle_put,
    handle_delete,
    handle_mkcol,
    handle_move,
    handle_copy,
    handle_options,
)

DAV_PREFIX = "/remote.php/dav/files"


def get_webdav_routes() -> list[Route]:
    """Return all WebDAV routes for mounting on the FastAPI app."""
    path_pattern = DAV_PREFIX + "/{webdav_path:path}"

    return [
        Route(path_pattern, endpoint=handle_options, methods=["OPTIONS"]),
        Route(path_pattern, endpoint=handle_propfind, methods=["PROPFIND"]),
        Route(path_pattern, endpoint=handle_get, methods=["GET"]),
        Route(path_pattern, endpoint=handle_head, methods=["HEAD"]),
        Route(path_pattern, endpoint=handle_put, methods=["PUT"]),
        Route(path_pattern, endpoint=handle_delete, methods=["DELETE"]),
        Route(path_pattern, endpoint=handle_mkcol, methods=["MKCOL"]),
        Route(path_pattern, endpoint=handle_move, methods=["MOVE"]),
        Route(path_pattern, endpoint=handle_copy, methods=["COPY"]),
    ]
