"""Celery task for executing refinery (data refinement) pipelines."""

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
    name="app.tasks.refinery.execute_refinery_task",
    bind=True,
    max_retries=1,
    soft_time_limit=300,
    time_limit=360,
)
def execute_refinery_task(self, rule_id: str):
    """Execute a refinery rule in background."""
    return _run_async(_execute_refinery_async(rule_id))


async def _execute_refinery_async(rule_id: str):
    """Run the refinery pipeline for a rule.

    Uses separate DB sessions for each phase to avoid connection timeouts
    during long-running LLM operations (postgres idle_in_transaction_session_timeout).
    """
    from datetime import datetime
    from app.models.pipeline import RefineryRule, RefineryResult
    from app.models.collection_task import CollectionResult
    from app.core.settings_manager import load_settings_from_db

    engine = create_task_engine()
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        # ── Phase 0: Load rule, source data, settings — then close session ──
        rule_data = None
        raw_data = []
        settings = None

        async with session_factory() as db:
            result = await db.execute(
                select(RefineryRule).where(RefineryRule.id == rule_id)
            )
            rule = result.scalar_one_or_none()
            if not rule:
                logger.error("Refinery rule not found: %s", rule_id)
                return {"status": "error", "reason": "rule not found"}

            # Mark as running
            rule.last_run_status = "running"
            await db.commit()

            settings = await load_settings_from_db(db)

            # Snapshot rule data
            rule_data = {
                "id": str(rule.id),
                "user_id": str(rule.user_id),
                "pipeline_id": str(rule.pipeline_id) if rule.pipeline_id else None,
                "source_task_id": str(rule.source_task_id) if rule.source_task_id else None,
                "name": rule.name,
                "prompt": rule.prompt,
                "filter_rules": rule.filter_rules,
                "output_format": rule.output_format,
            }

            if not rule.source_task_id:
                await db.execute(
                    update(RefineryRule)
                    .where(RefineryRule.id == rule_id)
                    .values(
                        last_run_status="failed",
                        last_run_message="소스 수집 작업이 설정되지 않았습니다",
                        last_run_at=datetime.utcnow(),
                        run_count=RefineryRule.run_count + 1,
                    )
                )
                await db.commit()
                return {"status": "failed", "reason": "no source task"}

            # Fetch and snapshot source data
            source_results = await db.execute(
                select(CollectionResult)
                .where(CollectionResult.task_id == rule.source_task_id)
                .order_by(CollectionResult.created_at.desc())
                .limit(100)
            )
            source_items = source_results.scalars().all()

            if not source_items:
                await db.execute(
                    update(RefineryRule)
                    .where(RefineryRule.id == rule_id)
                    .values(
                        last_run_status="no_results",
                        last_run_message="소스 수집 결과가 없습니다. 먼저 수집을 실행하세요.",
                        last_run_at=datetime.utcnow(),
                        run_count=RefineryRule.run_count + 1,
                    )
                )
                await db.commit()
                return {"status": "no_results"}

            # Build data for AI refinement (detached from session)
            for item in source_items:
                entry = {}
                if item.parsed_data:
                    entry["data"] = item.parsed_data
                if item.raw_text:
                    entry["text"] = item.raw_text[:2000]
                if item.source_url:
                    entry["source"] = item.source_url
                if entry:
                    raw_data.append(entry)

        # Session is now closed — safe for long-running LLM calls

        # Apply filter rules
        if rule_data["filter_rules"]:
            raw_data = _apply_filters(raw_data, rule_data["filter_rules"])

        if not raw_data:
            async with session_factory() as db:
                await db.execute(
                    update(RefineryRule)
                    .where(RefineryRule.id == rule_id)
                    .values(
                        last_run_status="no_results",
                        last_run_message="필터 적용 후 남은 데이터가 없습니다",
                        last_run_at=datetime.utcnow(),
                        run_count=RefineryRule.run_count + 1,
                    )
                )
                await db.commit()
            return {"status": "no_results"}

        # ── Phase 1: LLM refinement (no DB session) ──
        try:
            refined = await _refine_with_llm(
                raw_data=raw_data,
                prompt=rule_data["prompt"],
                output_format=rule_data["output_format"],
                settings=settings,
            )
        except SoftTimeLimitExceeded:
            logger.warning("Refinery task timed out: %s", rule_id)
            try:
                async with session_factory() as err_db:
                    await err_db.execute(
                        update(RefineryRule)
                        .where(RefineryRule.id == rule_id)
                        .values(
                            last_run_status="timeout",
                            last_run_message="작업 시간 초과 (5분 제한)",
                            last_run_at=datetime.utcnow(),
                            run_count=RefineryRule.run_count + 1,
                        )
                    )
                    await err_db.commit()
            except Exception:
                pass
            return {"status": "timeout"}
        except Exception as e:
            logger.error("Refinery task failed: %s — %s", rule_id, e)
            try:
                async with session_factory() as err_db:
                    await err_db.execute(
                        update(RefineryRule)
                        .where(RefineryRule.id == rule_id)
                        .values(
                            last_run_status="failed",
                            last_run_message=str(e)[:200],
                            last_run_at=datetime.utcnow(),
                            run_count=RefineryRule.run_count + 1,
                        )
                    )
                    await err_db.commit()
            except Exception:
                pass
            return {"status": "failed", "reason": str(e)}

        # ── Phase 2: Save results with fresh session ──
        async with session_factory() as db:
            output_text = json.dumps(refined, ensure_ascii=False, indent=2) if refined else None

            refinery_result = RefineryResult(
                rule_id=rule_data["id"],
                user_id=rule_data["user_id"],
                pipeline_id=rule_data["pipeline_id"],
                refined_data=refined if isinstance(refined, dict) else {"result": refined},
                output_text=output_text,
            )
            db.add(refinery_result)

            result_count = 1 if refined else 0

            # Export to /AI Workspace/Refined/
            file_export_failed = False
            if result_count > 0 and output_text:
                try:
                    from app.services.workspace_service import (
                        ensure_workspace_folders,
                        save_workspace_file,
                    )
                    await ensure_workspace_folders(rule_data["user_id"], db)

                    fmt = rule_data["output_format"]
                    ext = "csv" if fmt == "csv" else "json"
                    mime = "text/csv" if fmt == "csv" else "application/json"
                    from zoneinfo import ZoneInfo
                    ts = datetime.now(ZoneInfo("Asia/Seoul")).strftime("%y%m%d%H%M%S")
                    rule_name = rule_data.get("name", "refinery")[:20].strip()
                    filename = f"{rule_name}_{ts}.{ext}"

                    file_record = await save_workspace_file(
                        user_id=rule_data["user_id"],
                        folder="/AI Workspace/Refined",
                        filename=filename,
                        content=output_text,
                        mime_type=mime,
                        db=db,
                    )
                    refinery_result.file_id = file_record.id
                except Exception as e:
                    logger.warning(
                        "Failed to export refinery result to Refined folder: %s", e,
                    )
                    file_export_failed = True

            run_msg = "정제 완료" if result_count > 0 else "정제 결과 없음"
            if file_export_failed:
                run_msg += " (파일 저장 실패)"

            await db.execute(
                update(RefineryRule)
                .where(RefineryRule.id == rule_id)
                .values(
                    last_run_status="success" if result_count > 0 else "no_results",
                    last_run_message=run_msg,
                    last_run_at=datetime.utcnow(),
                    run_count=RefineryRule.run_count + 1,
                )
            )
            await db.commit()

            logger.info("Refinery rule completed: %s, status=success", rule_id)
            return {"status": "success", "results": result_count}
    finally:
        await engine.dispose()


def _apply_filters(data: list[dict], filter_rules: dict) -> list[dict]:
    """Apply keyword include/exclude and dedup filters."""
    result = data

    include_kw = filter_rules.get("include_keywords", [])
    exclude_kw = filter_rules.get("exclude_keywords", [])
    dedup = filter_rules.get("dedup", False)

    if include_kw:
        filtered = []
        for item in result:
            text = json.dumps(item, ensure_ascii=False).lower()
            if any(kw.lower() in text for kw in include_kw):
                filtered.append(item)
        result = filtered

    if exclude_kw:
        filtered = []
        for item in result:
            text = json.dumps(item, ensure_ascii=False).lower()
            if not any(kw.lower() in text for kw in exclude_kw):
                filtered.append(item)
        result = filtered

    if dedup:
        seen = set()
        unique = []
        for item in result:
            key = json.dumps(item, sort_keys=True, ensure_ascii=False)
            if key not in seen:
                seen.add(key)
                unique.append(item)
        result = unique

    return result


async def _refine_with_llm(raw_data: list, prompt: str, output_format: str, settings) -> dict | list | str:
    """Use LLM to refine/transform collected data."""
    from app.services.ai.llm_service import LLMService

    llm = LLMService(settings)

    format_instruction = {
        "json": "결과를 JSON 형식으로 반환해줘.",
        "csv": "결과를 CSV 형식 텍스트로 반환해줘.",
        "summary": "결과를 한국어 요약 텍스트로 반환해줘.",
    }.get(output_format, "결과를 JSON 형식으로 반환해줘.")

    system_msg = (
        "당신은 데이터 정제 전문가입니다. "
        "사용자의 지시에 따라 원본 데이터를 정제, 변환, 요약합니다. "
        f"{format_instruction}"
    )

    user_msg = (
        f"## 정제 지시\n{prompt}\n\n"
        f"## 원본 데이터 ({len(raw_data)}건)\n"
        f"```json\n{json.dumps(raw_data[:50], ensure_ascii=False, indent=2)}\n```"
    )

    content = await llm.chat(
        messages=[
            {"role": "system", "content": system_msg},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.3,
        max_tokens=4000,
    )

    # Try to parse as JSON
    if output_format in ("json", "csv"):
        try:
            # Extract JSON from markdown code blocks if present
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            return json.loads(content)
        except (json.JSONDecodeError, IndexError):
            return {"raw_output": content}
    else:
        return {"summary": content}
