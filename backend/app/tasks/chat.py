"""Celery task for processing chat messages in background."""

import asyncio
import json
import logging
from datetime import datetime
from uuid import UUID

import redis.asyncio as aioredis
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.core.database import create_task_engine
from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Run an async coroutine in a new event loop (for Celery sync tasks)."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(
    name="app.tasks.chat.process_chat_message_task",
    bind=True,
    max_retries=1,
    soft_time_limit=600,
)
def process_chat_message_task(self, session_id: str, user_id: str, message_id: str):
    """Process a chat message with tool calling in background."""
    _run_async(_process_chat_message_async(session_id, user_id, message_id))


async def _process_chat_message_async(
    session_id: str, user_id: str, message_id: str
):
    """Async implementation: run agent and publish events via Redis pub/sub."""
    settings = get_settings()
    r = aioredis.from_url(settings.redis_url)
    channel = f"chat:stream:{session_id}:{message_id}"
    input_channel = f"chat:input:{session_id}:{message_id}"
    active_key = f"chat:active:{session_id}"
    notification_channel = f"user:{user_id}:notifications"

    # Mark this task as active in Redis (TTL = soft_time_limit + 60s buffer)
    await r.set(
        active_key,
        json.dumps({"message_id": message_id, "user_id": user_id, "session_id": session_id}),
        ex=660,
    )

    progress_key = f"chat:progress:{session_id}"

    async def publish(event: dict):
        await r.publish(channel, json.dumps(event, ensure_ascii=False))

        etype = event.get("type")
        if etype == "tool_call":
            raw = await r.get(progress_key)
            progress = json.loads(raw) if raw else {"tools": [], "last_text": ""}
            tool_label = event.get("display_name") or event.get("name") or ""
            if tool_label:
                progress["tools"].append(tool_label)
            progress["last_text"] = ""  # new tool → reset previous text
            await r.set(progress_key, json.dumps(progress, ensure_ascii=False), ex=660)
        elif etype == "token":
            raw = await r.get(progress_key)
            if raw:
                progress = json.loads(raw)
                progress["last_text"] = progress.get("last_text", "") + (event.get("content") or "")
                await r.set(progress_key, json.dumps(progress, ensure_ascii=False), ex=660)
        elif etype in ("done", "error"):
            await r.delete(progress_key)

    async def request_input(prompt: str) -> str:
        await publish({"type": "input_request", "prompt": prompt})
        result = await r.blpop(input_channel, timeout=300)
        if result:
            return result[1].decode()
        return ""

    engine = create_task_engine()
    factory = async_sessionmaker(engine, expire_on_commit=False)

    try:
        async with factory() as db:
            # Load DB settings early (needed for LLM service API keys)
            from app.core.settings_manager import load_settings_from_db
            await load_settings_from_db(db)

            # Load tool label cache (needed for display_name in events)
            from app.services.tool_registry_service import refresh_cache, _label_cache
            if not _label_cache:
                await refresh_cache(db)

            from app.models.chat import ChatSession, ChatMessage, MessageRole

            session = await db.get(ChatSession, UUID(session_id))
            user_msg = await db.get(ChatMessage, UUID(message_id))
            if not session or not user_msg:
                await publish({"type": "error", "message": "Session or message not found"})
                return

            # Category-scoped RAG: bypass run_agent, use RAG directly
            if session.category_id:
                await _handle_category_rag(
                    factory=factory,
                    session_id=session_id,
                    category_id=str(session.category_id),
                    session_model=session.model,
                    user_content=user_msg.content,
                    user_id=user_id,
                    publish=publish,
                )
            else:
                from app.services.ai.agent_executor import run_agent

                await run_agent(
                    db=db,
                    user_id=UUID(user_id),
                    prompt=user_msg.content,
                    agent_type=session.agent_type,
                    session_id=UUID(session_id),
                    source="chat",
                    on_event=publish,
                    request_user_input=request_input,
                    skip_user_message=True,  # WS handler already saved user message
                )
        # Notify completion via user notification channel
        await r.publish(notification_channel, json.dumps({
            "type": "ai_status", "status": "done", "session_id": session_id,
        }))
    except Exception as e:
        logger.exception("Chat task failed: %s", e)
        try:
            await publish({"type": "error", "message": str(e)})
            await r.publish(notification_channel, json.dumps({
                "type": "ai_status", "status": "error", "session_id": session_id,
            }))
        except Exception:
            pass
    finally:
        # Remove active task marker and progress buffer
        try:
            await r.delete(active_key, progress_key)
        except Exception:
            pass
        await engine.dispose()
        await r.aclose()


async def _handle_category_rag(
    factory, session_id: str, category_id: str, session_model: str,
    user_content: str, user_id: str, publish,
):
    """Handle category-scoped RAG chat in Celery task.

    Uses short-lived DB sessions to avoid idle-in-transaction timeouts
    during long LLM streaming.
    """
    from datetime import datetime
    from sqlalchemy import select, update
    from app.models.file import File as FileModel
    from app.models.index_category import FileCategory
    from app.models.chat import ChatSession, ChatMessage, MessageRole
    from app.core.settings_manager import load_settings_from_db
    from app.services.ai.llm_service import LLMService
    from app.services.ai.embedding_service import EmbeddingService
    from app.services.ai.rag_service import RAGService

    # ── Phase 1: Read all needed data from DB (short session) ──
    async with factory() as db:
        # Resolve category-scoped file IDs
        result = await db.execute(
            select(FileModel.id)
            .join(FileCategory, FileCategory.file_id == FileModel.id)
            .where(
                FileModel.user_id == UUID(user_id),
                FileModel.is_indexed.is_(True),
                FileCategory.category_id == UUID(category_id),
            )
        )
        file_ids = [str(row[0]) for row in result.all()]

        # Get chat history
        history_result = await db.execute(
            select(ChatMessage).where(
                ChatMessage.session_id == UUID(session_id),
            ).order_by(ChatMessage.created_at.desc()).limit(20)
        )
        history = [
            {"role": msg.role.value, "content": msg.content}
            for msg in reversed(history_result.scalars().all())
        ]

        settings = await load_settings_from_db(db)
    # DB session closed here

    if not file_ids:
        response_text = "이 카테고리에 인덱싱된 파일이 없습니다."
    else:
        await publish({"type": "tool_call", "name": "semantic_search", "display_name": "문서 검색 중..."})

        llm = LLMService(settings)
        embedding = EmbeddingService(settings)

        # Sync session model with current default
        current_model = getattr(llm.service, 'default_model', None)
        model_to_use = session_model
        if current_model and session_model != current_model:
            model_to_use = current_model
            # Update model in a quick session
            async with factory() as db:
                await db.execute(
                    update(ChatSession)
                    .where(ChatSession.id == UUID(session_id))
                    .values(model=current_model)
                )
                await db.commit()

        rag_service = RAGService(embedding_service=embedding, llm_service=llm)

        # ── Phase 2: Streaming (no DB session held open) ──
        # RAG search needs DB for embedding query — use a short session
        async with factory() as db:
            response_text = ""
            async for data in rag_service.chat_with_context_stream(
                db=db,
                user_id=user_id,
                query=user_content,
                chat_history=history[:-1],
                file_ids=file_ids,
                model=model_to_use,
            ):
                if "sources" in data:
                    await publish({"type": "tool_result", "name": "semantic_search", "display_name": "문서 검색 완료"})
                elif "chunk" in data:
                    response_text += data["chunk"]
                    await publish({"type": "token", "content": data["chunk"]})

    # ── Phase 3: Save assistant message (fresh session) ──
    async with factory() as db:
        assistant_msg = ChatMessage(
            session_id=UUID(session_id),
            role=MessageRole.ASSISTANT,
            content=response_text,
        )
        db.add(assistant_msg)
        await db.execute(
            update(ChatSession)
            .where(ChatSession.id == UUID(session_id))
            .values(updated_at=datetime.utcnow())
        )
        await db.commit()
        await db.refresh(assistant_msg)

        # Generate title if first exchange
        from sqlalchemy import select, func
        msg_count = await db.execute(
            select(func.count()).select_from(ChatMessage).where(
                ChatMessage.session_id == UUID(session_id)
            )
        )
        if msg_count.scalar() <= 2:
            generate_session_title_task.delay(
                session_id, user_content[:300], response_text[:300],
            )

    await publish({"type": "done", "message_id": str(assistant_msg.id)})


@celery_app.task(
    name="app.tasks.chat.generate_session_title_task",
    soft_time_limit=30,
    time_limit=45,
    ignore_result=True,
)
def generate_session_title_task(session_id: str, user_message: str, assistant_message: str):
    """Generate a chat session title using LLM (fire-and-forget)."""
    _run_async(_generate_session_title_async(session_id, user_message, assistant_message))


async def _generate_session_title_async(session_id: str, user_message: str, assistant_message: str):
    """Call LLM to generate a concise session title, then update DB."""
    from app.core.settings_manager import load_settings_from_db
    from app.models.chat import ChatSession
    from app.services.ai.llm_service import LLMService

    engine = create_task_engine()
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with session_factory() as db:
            db_settings = await load_settings_from_db(db)
            llm = LLMService(db_settings)

            # Truncate inputs to save tokens
            user_short = user_message[:300]
            assistant_short = assistant_message[:300]

            prompt = (
                f"User: {user_short}\n"
                f"Assistant: {assistant_short}\n\n"
                "위 대화의 제목을 10단어 이내의 짧은 한국어 또는 영어로 생성하세요. "
                "제목만 출력하세요. 따옴표나 설명 없이 제목만."
            )

            try:
                title = await llm.chat(
                    messages=[{"role": "user", "content": prompt}],
                    system_prompt="You generate short, descriptive chat titles. Output only the title, nothing else.",
                    temperature=0.3,
                    max_tokens=30,
                )
                if not title:
                    title = user_message[:50]
                else:
                    title = title.strip().strip('"').strip("'").strip()
                if not title or len(title) > 100:
                    title = user_message[:50]
            except Exception as e:
                logger.warning("Title generation LLM call failed: %s", e)
                title = user_message[:50]

            await db.execute(
                update(ChatSession)
                .where(ChatSession.id == UUID(session_id))
                .values(title=title)
            )
            await db.commit()
            logger.info("Session %s title generated: %s", session_id, title)
    finally:
        await engine.dispose()
