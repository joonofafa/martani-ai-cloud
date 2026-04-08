"""Health check endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.database import get_db
from app.services.ai.llm_service import get_llm_service, LLMService
from app.services.storage.minio_service import get_minio_service

router = APIRouter()


@router.get("")
async def health_check():
    """Basic health check."""
    return {"status": "healthy"}


@router.get("/detailed")
async def detailed_health_check(
    db: AsyncSession = Depends(get_db),
    llm: LLMService = Depends(get_llm_service),
):
    """Detailed health check with service status."""
    checks = {
        "api": True,
        "database": False,
        "minio": False,
        "llm": False,
    }

    # Check database
    try:
        await db.execute(text("SELECT 1"))
        checks["database"] = True
    except Exception:
        pass

    # Check MinIO
    try:
        minio = get_minio_service()
        # MinIO client doesn't have async health check, just verify bucket exists
        checks["minio"] = minio.client.bucket_exists(minio.bucket)
    except Exception:
        pass

    # Check LLM provider
    try:
        checks["llm"] = await llm.health_check()
    except Exception:
        pass

    all_healthy = all(checks.values())

    return {
        "status": "healthy" if all_healthy else "degraded",
        "services": checks,
    }
