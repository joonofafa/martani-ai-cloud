"""API routes."""

from fastapi import APIRouter

from app.api import auth, files, chat, health, admin, notes, indexing, ws
from app.api import vault, billing, admin_logs, schedule_tasks, shares, mining
from app.api import pipeline, refinery, bridge

api_router = APIRouter()

api_router.include_router(ws.router, tags=["websocket"])
api_router.include_router(health.router, prefix="/health", tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(files.router, prefix="/files", tags=["files"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(notes.router, prefix="/notes", tags=["notes"])
api_router.include_router(indexing.router, prefix="/indexing", tags=["indexing"])
api_router.include_router(vault.router, prefix="/vault", tags=["vault"])
api_router.include_router(billing.router, prefix="/billing", tags=["billing"])
api_router.include_router(schedule_tasks.router, prefix="/schedule", tags=["schedule"])
api_router.include_router(shares.router, prefix="/files", tags=["shares"])
api_router.include_router(mining.router, prefix="/mining", tags=["mining"])
api_router.include_router(pipeline.router, prefix="/pipelines", tags=["pipelines"])
api_router.include_router(refinery.router, prefix="/refinery", tags=["refinery"])
api_router.include_router(bridge.router, prefix="/bridge", tags=["bridge"])
api_router.include_router(admin.router)
api_router.include_router(admin_logs.router)
