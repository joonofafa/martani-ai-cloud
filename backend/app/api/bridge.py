"""Bridge (브릿지) API endpoints — delivers refined data to external destinations."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.url_safety import validate_webhook_url
from app.models.pipeline import BridgeConfig, RefineryRule, RefineryResult
from app.models.user import User

router = APIRouter()


# ── Schemas ──

class BridgeCreate(BaseModel):
    name: str = Field(..., max_length=200)
    pipeline_id: str | None = None
    source_rule_id: str | None = None
    destination_type: str = Field(..., pattern=r"^(webhook|email|cloud_folder)$")
    destination_config: dict | None = None
    auto_trigger: bool = False


class BridgeUpdate(BaseModel):
    name: str | None = None
    source_rule_id: str | None = None
    destination_type: str | None = None
    destination_config: dict | None = None
    auto_trigger: bool | None = None
    status: str | None = None


class BridgeItem(BaseModel):
    id: str
    name: str
    pipeline_id: str | None
    source_rule_id: str | None
    source_rule_name: str | None = None
    destination_type: str
    destination_config: dict | None
    auto_trigger: bool
    status: str
    last_run_at: str | None
    last_run_status: str | None
    last_run_message: str | None
    delivery_count: int
    created_at: str
    updated_at: str


# ── Helpers ──

async def _get_user_bridge(db: AsyncSession, bridge_id: UUID, user_id) -> BridgeConfig:
    result = await db.execute(
        select(BridgeConfig).where(
            BridgeConfig.id == bridge_id,
            BridgeConfig.user_id == user_id,
        )
    )
    bridge = result.scalar_one_or_none()
    if not bridge:
        raise HTTPException(404, "Bridge config not found")
    return bridge


async def _bridge_to_item(db: AsyncSession, b: BridgeConfig) -> BridgeItem:
    source_name = None
    source_rule_id = None

    # Resolve source rule from destination_config
    if b.destination_config and b.destination_config.get("source_rule_id"):
        source_rule_id = b.destination_config["source_rule_id"]
        sr = await db.get(RefineryRule, source_rule_id)
        source_name = sr.name if sr else None

    return BridgeItem(
        id=str(b.id),
        name=b.name,
        pipeline_id=str(b.pipeline_id) if b.pipeline_id else None,
        source_rule_id=source_rule_id,
        source_rule_name=source_name,
        destination_type=b.destination_type,
        destination_config=_safe_config(b.destination_config),
        auto_trigger=b.auto_trigger,
        status=b.status,
        last_run_at=b.last_run_at.isoformat() if b.last_run_at else None,
        last_run_status=b.destination_config.get("last_run_status") if b.destination_config else None,
        last_run_message=b.destination_config.get("last_run_message") if b.destination_config else None,
        delivery_count=b.delivery_count,
        created_at=b.created_at.isoformat(),
        updated_at=b.updated_at.isoformat(),
    )


def _validate_destination_config(destination_type: str, config: dict | None) -> None:
    """Reject unsafe webhook URLs at create/update time."""
    if destination_type != "webhook" or not config:
        return
    url = config.get("url")
    if not url:
        return
    settings = get_settings()
    require_https = (settings.environment or "").lower() in ("production", "prod")
    try:
        validate_webhook_url(str(url), require_https=require_https)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


def _safe_config(config: dict | None) -> dict | None:
    """Strip sensitive fields from config for API response."""
    if not config:
        return config
    safe = dict(config)
    # Mask webhook headers (may contain auth tokens)
    if "headers" in safe and isinstance(safe["headers"], dict):
        safe["headers"] = {k: "***" for k in safe["headers"]}
    return safe


# ── Endpoints ──

@router.get("/configs", response_model=list[BridgeItem])
async def list_bridges(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all bridge configs for the current user."""
    result = await db.execute(
        select(BridgeConfig)
        .where(BridgeConfig.user_id == user.id)
        .order_by(BridgeConfig.created_at.desc())
    )
    bridges = result.scalars().all()
    return [await _bridge_to_item(db, b) for b in bridges]


@router.post("/configs", response_model=BridgeItem)
async def create_bridge(
    data: BridgeCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new bridge config."""
    config = dict(data.destination_config or {})
    if data.source_rule_id:
        config["source_rule_id"] = data.source_rule_id

    _validate_destination_config(data.destination_type, config)

    bridge = BridgeConfig(
        user_id=user.id,
        name=data.name,
        pipeline_id=data.pipeline_id if data.pipeline_id else None,
        destination_type=data.destination_type,
        destination_config=config,
        auto_trigger=data.auto_trigger,
        status="active",
    )
    db.add(bridge)
    await db.commit()
    await db.refresh(bridge)
    return await _bridge_to_item(db, bridge)


@router.get("/configs/{bridge_id}", response_model=BridgeItem)
async def get_bridge(
    bridge_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get bridge config details."""
    bridge = await _get_user_bridge(db, bridge_id, user.id)
    return await _bridge_to_item(db, bridge)


@router.put("/configs/{bridge_id}", response_model=BridgeItem)
async def update_bridge(
    bridge_id: UUID,
    data: BridgeUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update a bridge config."""
    bridge = await _get_user_bridge(db, bridge_id, user.id)

    update_data = data.model_dump(exclude_unset=True)

    # Merge source_rule_id into destination_config
    source_rule_id = update_data.pop("source_rule_id", None)
    if source_rule_id is not None:
        cfg = dict(bridge.destination_config or {})
        cfg["source_rule_id"] = source_rule_id
        bridge.destination_config = cfg

    for key, value in update_data.items():
        setattr(bridge, key, value)
    bridge.updated_at = datetime.utcnow()

    eff_type = bridge.destination_type
    eff_cfg = dict(bridge.destination_config or {})
    _validate_destination_config(eff_type, eff_cfg)

    await db.commit()
    await db.refresh(bridge)
    return await _bridge_to_item(db, bridge)


@router.delete("/configs/{bridge_id}")
async def delete_bridge(
    bridge_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a bridge config."""
    bridge = await _get_user_bridge(db, bridge_id, user.id)
    await db.delete(bridge)
    await db.commit()
    return {"ok": True}


@router.post("/configs/{bridge_id}/run")
async def run_bridge(
    bridge_id: UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Trigger manual execution of a bridge delivery."""
    bridge = await _get_user_bridge(db, bridge_id, user.id)

    cfg = bridge.destination_config or {}
    if cfg.get("last_run_status") == "running":
        raise HTTPException(400, "Bridge is already running")

    # Mark as running
    cfg["last_run_status"] = "running"
    bridge.destination_config = cfg
    await db.commit()

    from app.tasks.bridge import execute_bridge_task
    execute_bridge_task.delay(str(bridge.id))

    return {"ok": True, "message": "Bridge task dispatched"}


# ── Stats ──

@router.get("/stats")
async def get_bridge_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get bridge dashboard statistics."""
    total = await db.scalar(
        select(func.count(BridgeConfig.id))
        .where(BridgeConfig.user_id == user.id)
    ) or 0

    auto_count = await db.scalar(
        select(func.count(BridgeConfig.id))
        .where(
            BridgeConfig.user_id == user.id,
            BridgeConfig.auto_trigger.is_(True),
            BridgeConfig.status == "active",
        )
    ) or 0

    total_deliveries = await db.scalar(
        select(func.coalesce(func.sum(BridgeConfig.delivery_count), 0))
        .where(BridgeConfig.user_id == user.id)
    ) or 0

    return {
        "total_configs": total,
        "auto_configs": auto_count,
        "total_deliveries": total_deliveries,
    }


# ── Available sources (refinery rules with results) ──

@router.get("/sources")
async def list_bridge_sources(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List refinery rules that can be used as bridge sources."""
    result = await db.execute(
        select(RefineryRule)
        .where(RefineryRule.user_id == user.id)
        .order_by(RefineryRule.name)
    )
    rules = result.scalars().all()
    items = []
    for r in rules:
        rc = await db.scalar(
            select(func.count(RefineryResult.id))
            .where(RefineryResult.rule_id == r.id)
        ) or 0
        items.append({
            "id": str(r.id),
            "name": r.name,
            "output_format": r.output_format,
            "result_count": rc,
            "last_run_status": r.last_run_status,
            "last_run_at": r.last_run_at.isoformat() if r.last_run_at else None,
        })
    return items
