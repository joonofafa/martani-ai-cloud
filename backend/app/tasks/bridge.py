"""Celery task for executing bridge (data delivery) operations."""

import asyncio
import json
import logging

from celery.exceptions import SoftTimeLimitExceeded
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.celery_app import celery_app
from app.core.database import create_task_engine

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Run an async coroutine in a new event loop (for Celery sync tasks)."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(
    name="app.tasks.bridge.execute_bridge_task",
    bind=True,
    max_retries=1,
    soft_time_limit=120,
    time_limit=180,
)
def execute_bridge_task(self, bridge_id: str):
    """Execute a bridge delivery in background."""
    return _run_async(_execute_bridge_async(bridge_id))


async def _execute_bridge_async(bridge_id: str):
    """Run the bridge delivery for a config."""
    from datetime import datetime
    from app.models.pipeline import BridgeConfig, RefineryRule, RefineryResult
    from app.services.workspace_service import ensure_workspace_folders, save_workspace_file

    engine = create_task_engine()
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        # ── Phase 0: Load config and source data ──
        bridge_data = None
        results_data = []

        async with session_factory() as db:
            result = await db.execute(
                select(BridgeConfig).where(BridgeConfig.id == bridge_id)
            )
            bridge = result.scalar_one_or_none()
            if not bridge:
                logger.error("Bridge config not found: %s", bridge_id)
                return {"status": "error", "reason": "config not found"}

            bridge_data = {
                "id": str(bridge.id),
                "user_id": str(bridge.user_id),
                "name": bridge.name,
                "destination_type": bridge.destination_type,
                "destination_config": dict(bridge.destination_config or {}),
                "pipeline_id": str(bridge.pipeline_id) if bridge.pipeline_id else None,
            }

            source_rule_id = bridge_data["destination_config"].get("source_rule_id")
            if not source_rule_id:
                await _update_bridge_status(
                    session_factory, bridge_id,
                    status="failed",
                    message="소스 정제 규칙이 설정되지 않았습니다",
                )
                return {"status": "failed", "reason": "no source rule"}

            # Fetch latest refinery results
            res = await db.execute(
                select(RefineryResult)
                .where(RefineryResult.rule_id == source_rule_id)
                .order_by(RefineryResult.created_at.desc())
                .limit(50)
            )
            refinery_results = res.scalars().all()

            if not refinery_results:
                await _update_bridge_status(
                    session_factory, bridge_id,
                    status="no_results",
                    message="전달할 정제 결과가 없습니다. 먼저 정제를 실행하세요.",
                )
                return {"status": "no_results"}

            # Build export data
            for rr in refinery_results:
                entry = {}
                if rr.refined_data:
                    entry["data"] = rr.refined_data
                if rr.output_text:
                    entry["text"] = rr.output_text
                entry["created_at"] = rr.created_at.isoformat()
                results_data.append(entry)

        # ── Phase 1: Deliver to destination ──
        dest_type = bridge_data["destination_type"]
        config = bridge_data["destination_config"]
        delivery_ok = True
        delivery_message = ""

        try:
            if dest_type == "webhook":
                delivery_message = await _deliver_webhook(config, results_data)
            elif dest_type == "email":
                delivery_message = await _deliver_email(config, results_data, bridge_data)
            elif dest_type == "cloud_folder":
                delivery_message = "클라우드 폴더에 저장 완료"
            else:
                delivery_message = f"Unsupported destination type: {dest_type}"
                delivery_ok = False
        except Exception as e:
            logger.error("Bridge delivery failed: %s — %s", bridge_id, e)
            delivery_ok = False
            delivery_message = str(e)[:200]

        # ── Phase 2: Save to /AI Workspace/Exports/ and update status ──
        file_export_failed = False
        async with session_factory() as db:
            try:
                await ensure_workspace_folders(bridge_data["user_id"], db)

                from zoneinfo import ZoneInfo
                ts = datetime.now(ZoneInfo("Asia/Seoul")).strftime("%y%m%d%H%M%S")
                bridge_name = bridge_data["name"][:20].strip()
                filename = f"{bridge_name}_{ts}.json"
                content = json.dumps(results_data, ensure_ascii=False, indent=2)

                await save_workspace_file(
                    user_id=bridge_data["user_id"],
                    folder="/AI Workspace/Exports",
                    filename=filename,
                    content=content,
                    mime_type="application/json",
                    db=db,
                )
            except Exception as e:
                logger.warning("Failed to export bridge result to Exports folder: %s", e)
                file_export_failed = True

            run_status = "success" if delivery_ok else "failed"
            run_msg = delivery_message
            if file_export_failed:
                run_msg += " (파일 저장 실패)"

            cfg = bridge_data["destination_config"]
            cfg["last_run_status"] = run_status
            cfg["last_run_message"] = run_msg

            await db.execute(
                update(BridgeConfig)
                .where(BridgeConfig.id == bridge_id)
                .values(
                    destination_config=cfg,
                    last_run_at=datetime.utcnow(),
                    delivery_count=BridgeConfig.delivery_count + (1 if delivery_ok else 0),
                    updated_at=datetime.utcnow(),
                )
            )
            await db.commit()

        logger.info("Bridge task completed: %s, status=%s", bridge_id, run_status)
        return {"status": run_status, "message": run_msg}

    except SoftTimeLimitExceeded:
        logger.warning("Bridge task timed out: %s", bridge_id)
        try:
            await _update_bridge_status(
                session_factory, bridge_id,
                status="timeout",
                message="작업 시간 초과 (2분 제한)",
            )
        except Exception:
            pass
        return {"status": "timeout"}
    except Exception as e:
        logger.error("Bridge task failed unexpectedly: %s — %s", bridge_id, e)
        try:
            await _update_bridge_status(
                session_factory, bridge_id,
                status="failed",
                message=str(e)[:200],
            )
        except Exception:
            pass
        return {"status": "failed", "reason": str(e)}
    finally:
        await engine.dispose()


async def _update_bridge_status(
    session_factory, bridge_id: str, status: str, message: str,
):
    """Update bridge run status via raw SQL update."""
    from datetime import datetime
    from app.models.pipeline import BridgeConfig

    async with session_factory() as db:
        result = await db.execute(
            select(BridgeConfig).where(BridgeConfig.id == bridge_id)
        )
        bridge = result.scalar_one_or_none()
        if bridge:
            cfg = dict(bridge.destination_config or {})
            cfg["last_run_status"] = status
            cfg["last_run_message"] = message
            await db.execute(
                update(BridgeConfig)
                .where(BridgeConfig.id == bridge_id)
                .values(
                    destination_config=cfg,
                    last_run_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                )
            )
            await db.commit()


async def _deliver_webhook(config: dict, data: list) -> str:
    """Send data to a webhook URL via HTTP POST."""
    import httpx

    from app.core.config import get_settings
    from app.core.url_safety import validate_webhook_url

    url = config.get("url")
    if not url:
        raise ValueError("Webhook URL is not configured")

    settings = get_settings()
    require_https = (settings.environment or "").lower() in ("production", "prod")
    validate_webhook_url(str(url), require_https=require_https)

    headers = config.get("headers", {})
    headers.setdefault("Content-Type", "application/json")

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json={"results": data}, headers=headers)
        resp.raise_for_status()

    return f"Webhook 전달 완료 (HTTP {resp.status_code})"


async def _deliver_email(config: dict, data: list, bridge_data: dict) -> str:
    """Send data summary via email."""
    # Use the existing mail infrastructure if available
    to_email = config.get("email")
    if not to_email:
        raise ValueError("Email address is not configured")

    subject = config.get("subject", f"[Martani] 브릿지 전달: {bridge_data['name']}")
    body_lines = [
        f"브릿지 '{bridge_data['name']}'에서 {len(data)}건의 정제 결과를 전달합니다.",
        "",
        "---",
        "",
    ]
    for i, item in enumerate(data[:10], 1):
        text = item.get("text", json.dumps(item.get("data", {}), ensure_ascii=False))
        body_lines.append(f"[{i}] {text[:300]}")
        body_lines.append("")

    if len(data) > 10:
        body_lines.append(f"... 외 {len(data) - 10}건")

    import smtplib
    from email.mime.text import MIMEText

    smtp_host = config.get("smtp_host", "localhost")
    smtp_port = int(config.get("smtp_port", 587))
    smtp_user = config.get("smtp_user", "")
    smtp_pass = config.get("smtp_pass", "")
    from_email = config.get("from_email", smtp_user or "noreply@martani.app")

    msg = MIMEText("\n".join(body_lines), "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_email

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        if smtp_user and smtp_pass:
            server.starttls()
            server.login(smtp_user, smtp_pass)
        server.send_message(msg)

    return f"이메일 전달 완료 ({to_email})"
