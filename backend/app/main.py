"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s: %(message)s")
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.core.database import engine, Base
from app.api import api_router
from app.api.public_shares import router as public_shares_router
from app.webdav.router import get_webdav_routes
import app.models  # noqa: F401 — ensure all models are registered

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    print(f"Starting {settings.app_name}...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Seed tool registry
    from app.services.tool_registry_service import seed_tool_registry
    from app.core.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        await seed_tool_registry(db)
    yield
    # Shutdown
    await engine.dispose()
    print("Shutdown complete")


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Martani - File storage with RAG-powered chat",
    lifespan=lifespan,
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.frontend_url,
        "http://localhost:3000",
        "http://192.168.0.123:3000",
    ],
    allow_credentials=True,
    allow_methods=settings.cors_allow_methods_list,
    allow_headers=settings.cors_allow_headers_list,
)

# Include API routes
app.include_router(api_router, prefix="/api/v1")
app.include_router(public_shares_router, prefix="/api/v1/public", tags=["public-shares"])

# Mount WebDAV routes (Starlette routes for custom HTTP methods)
for route in get_webdav_routes():
    app.routes.append(route)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": settings.app_name,
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/status.php")
async def owncloud_status():
    """OwnCloud status endpoint - clients check this on first connect."""
    return {
        "installed": True,
        "maintenance": False,
        "needsDbUpgrade": False,
        "version": "10.11.0.0",
        "versionstring": "10.11.0",
        "edition": "Community",
        "productname": "Martani",
    }


@app.get("/ocs/v1.php/cloud/capabilities")
@app.get("/ocs/v2.php/cloud/capabilities")
async def owncloud_capabilities():
    """Return minimal OCS capabilities for OwnCloud client discovery."""
    return {
        "ocs": {
            "meta": {"status": "ok", "statuscode": 100, "message": "OK"},
            "data": {
                "version": {
                    "major": 10, "minor": 11, "micro": 0,
                    "string": "10.11.0",
                },
                "capabilities": {
                    "core": {"webdav-root": "remote.php/dav"},
                    "dav": {"chunking": "1.0"},
                    "files": {
                        "bigfilechunking": True,
                        "versioning": True,
                    },
                },
            },
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
