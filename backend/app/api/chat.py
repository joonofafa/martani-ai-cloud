"""Chat endpoints with RAG support and AI agent messenger."""

import logging
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
import json

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.chat import ChatSession, ChatMessage, MessageRole
from app.schemas.chat import (
    ChatSessionCreate,
    ChatSessionResponse,
    ChatMessageCreate,
    ChatMessageResponse,
    ChatRequest,
)
from app.services.ai.llm_service import get_llm_service, LLMService
from app.services.ai.embedding_service import get_embedding_service, EmbeddingService
from app.services.ai.rag_service import RAGService
from app.services.ai.agent_executor import run_agent, clean_response, strip_tools_blocks
from app.services.ai.token_accounting import check_quota, record_usage
from app.core.settings_manager import get_setting_value
from app.core.agent_types import AGENT_TYPES
from app.models.settings import SettingsKeys
from app.models.index_category import IndexCategory, FileCategory
from app.services.chat_storage import get_chat_storage
import redis.asyncio as aioredis
from app.core.config import get_settings as get_app_settings

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/sessions", response_model=ChatSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    session_data: ChatSessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    llm: LLMService = Depends(get_llm_service),
):
    """Create a new chat session."""
    # Use default model from LLM service if not specified
    default_model = llm.service.default_model if hasattr(llm.service, 'default_model') else "zai-org/glm-4.7"

    # Auto-save current active agent session before creating new one
    if session_data.agent_type:
        existing_result = await db.execute(
            select(ChatSession).where(
                ChatSession.user_id == current_user.id,
                ChatSession.agent_type == session_data.agent_type,
                ChatSession.deleted_at.is_(None),
            )
        )
        existing = existing_result.scalars().all()
        storage = get_chat_storage()
        for old_session in existing:
            # Check if it has messages in DB
            msg_count_result = await db.execute(
                select(func.count()).select_from(ChatMessage).where(
                    ChatMessage.session_id == old_session.id
                )
            )
            db_msg_count = msg_count_result.scalar() or 0

            if old_session.file_path:
                if db_msg_count > 0:
                    # Loaded from file and possibly has new messages — re-save
                    await storage.save_to_file(db, old_session.id)
                # else: already archived, no loaded messages, skip
                continue

            if db_msg_count > 0:
                # Set a fallback title before archiving if still default
                agent_info = AGENT_TYPES.get(old_session.agent_type or "")
                default_titles = {"New Chat", agent_info["title"]} if agent_info else {"New Chat"}
                if old_session.title in default_titles:
                    first_msg_result = await db.execute(
                        select(ChatMessage.content).where(
                            ChatMessage.session_id == old_session.id,
                            ChatMessage.role == MessageRole.USER,
                        ).order_by(ChatMessage.created_at).limit(1)
                    )
                    first_content = first_msg_result.scalar_one_or_none()
                    if first_content:
                        old_session.title = first_content[:50]
                await storage.save_to_file(db, old_session.id)
            else:
                # Empty session — soft delete instead of leaving orphans
                old_session.deleted_at = datetime.utcnow()

    # Resolve title: explicit > agent default > "New Chat"
    title = session_data.title
    if not title and session_data.agent_type:
        agent_info = AGENT_TYPES.get(session_data.agent_type)
        if agent_info:
            title = agent_info["title"]
    title = title or "New Chat"

    session = ChatSession(
        title=title,
        model=session_data.model or default_model,
        use_rag=session_data.use_rag,
        rag_file_ids=session_data.rag_file_ids,
        agent_type=session_data.agent_type,
        category_id=session_data.category_id,
        user_id=current_user.id,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return session


@router.get("/sessions")
async def list_sessions(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    agent_type: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List chat sessions with category info."""
    offset = (page - 1) * limit

    query = (
        select(ChatSession, IndexCategory.name.label("cat_name"))
        .outerjoin(IndexCategory, ChatSession.category_id == IndexCategory.id)
        .where(
            ChatSession.user_id == current_user.id,
            ChatSession.deleted_at.is_(None),
        )
    )
    if agent_type:
        query = query.where(ChatSession.agent_type == agent_type)

    query = query.order_by(ChatSession.updated_at.desc())
    result = await db.execute(query.offset(offset).limit(limit))
    rows = result.all()

    items = []
    for session, cat_name in rows:
        resp = ChatSessionResponse.model_validate(session)
        resp.category_name = cat_name
        if session.file_path:
            # Archived — file exists, mark as having messages
            resp.message_count = -1  # indicates "archived with messages"
        else:
            msg_result = await db.execute(
                select(func.count()).select_from(ChatMessage).where(
                    ChatMessage.session_id == session.id
                )
            )
            resp.message_count = msg_result.scalar() or 0
        items.append(resp)

    return items


@router.get("/sessions/{session_id}", response_model=ChatSessionResponse)
async def get_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a chat session with category info."""
    result = await db.execute(
        select(ChatSession, IndexCategory.name.label("cat_name"))
        .outerjoin(IndexCategory, ChatSession.category_id == IndexCategory.id)
        .where(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user.id,
            ChatSession.deleted_at.is_(None),
        )
    )
    row = result.first()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    session, cat_name = row
    resp = ChatSessionResponse.model_validate(session)
    resp.category_name = cat_name
    # category_id is set but category_name is None → category was deleted
    return resp


@router.get("/sessions/{session_id}/messages", response_model=list[ChatMessageResponse])
async def get_session_messages(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get messages for a chat session."""
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user.id,
            ChatSession.deleted_at.is_(None),
        )
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    messages_result = await db.execute(
        select(ChatMessage).where(
            ChatMessage.session_id == session_id,
        ).order_by(ChatMessage.created_at)
    )
    messages = messages_result.scalars().all()

    return messages


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a chat session."""
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user.id,
            ChatSession.deleted_at.is_(None),
        )
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    # Delete MinIO file if exists
    storage = get_chat_storage()
    await storage.delete_file(db, session.id)

    # Delete messages from DB
    await db.execute(
        delete(ChatMessage).where(ChatMessage.session_id == session.id)
    )

    session.deleted_at = datetime.utcnow()
    await db.commit()


@router.post("/sessions/{session_id}/save")
async def save_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save current session messages to MinIO file."""
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user.id,
            ChatSession.deleted_at.is_(None),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    storage = get_chat_storage()
    file_size = await storage.save_to_file(db, session_id)
    return {"status": "ok", "file_size": file_size}


@router.post("/sessions/{session_id}/load")
async def load_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Load session messages from MinIO file back to DB for active use."""
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user.id,
            ChatSession.deleted_at.is_(None),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.file_path:
        return {"status": "ok", "message_count": 0, "already_active": True}

    storage = get_chat_storage()
    msg_count = await storage.load_from_file(db, session_id)
    return {"status": "ok", "message_count": msg_count}


# ─── Agent Messenger Endpoints ───
# NOTE: Fixed routes (/agents/unread) must come before parameterized routes
# (/agents/{agent_type}/...) to avoid FastAPI matching "unread" as agent_type.

@router.get("/agents/summary")
async def get_agents_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get summary for all agent types: last message, unread count."""
    summary = {}

    for agent_type in AGENT_TYPES:
        result = await db.execute(
            select(ChatSession).where(
                ChatSession.user_id == current_user.id,
                ChatSession.agent_type == agent_type,
                ChatSession.deleted_at.is_(None),
            )
        )
        session = result.scalar_one_or_none()

        if not session:
            summary[agent_type] = {
                "last_message": None,
                "last_message_at": None,
                "unread_count": 0,
            }
            continue

        # Get last message
        last_msg_result = await db.execute(
            select(ChatMessage).where(
                ChatMessage.session_id == session.id,
            ).order_by(ChatMessage.created_at.desc()).limit(1)
        )
        last_msg = last_msg_result.scalar_one_or_none()

        # Get unread count
        unread_query = select(func.count()).select_from(ChatMessage).where(
            ChatMessage.session_id == session.id,
            ChatMessage.role == MessageRole.ASSISTANT,
        )
        if session.last_read_at:
            unread_query = unread_query.where(ChatMessage.created_at > session.last_read_at)
        unread_result = await db.execute(unread_query)
        unread_count = unread_result.scalar() or 0

        summary[agent_type] = {
            "last_message": last_msg.content[:50] if last_msg else None,
            "last_message_at": last_msg.created_at.isoformat() if last_msg else None,
            "unread_count": unread_count,
        }

    return summary


@router.get("/agents/unread")
async def get_agents_unread(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get unread message counts for all agent types."""
    unread_counts = {}

    for agent_type in AGENT_TYPES:
        result = await db.execute(
            select(ChatSession).where(
                ChatSession.user_id == current_user.id,
                ChatSession.agent_type == agent_type,
                ChatSession.deleted_at.is_(None),
            )
        )
        session = result.scalar_one_or_none()

        if not session:
            unread_counts[agent_type] = 0
            continue

        unread_query = select(func.count()).select_from(ChatMessage).where(
            ChatMessage.session_id == session.id,
            ChatMessage.role == MessageRole.ASSISTANT,
        )
        if session.last_read_at:
            unread_query = unread_query.where(ChatMessage.created_at > session.last_read_at)

        unread_result = await db.execute(unread_query)
        unread_counts[agent_type] = unread_result.scalar() or 0

    return unread_counts


@router.get("/agents/processing")
async def get_agents_processing(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get list of agent sessions currently being processed by Celery."""
    # Find all agent sessions for this user
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.user_id == current_user.id,
            ChatSession.agent_type.isnot(None),
            ChatSession.deleted_at.is_(None),
        )
    )
    sessions = result.scalars().all()
    if not sessions:
        return []

    settings = get_app_settings()
    r = aioredis.from_url(settings.redis_url)
    active = []
    try:
        for s in sessions:
            data = await r.get(f"chat:active:{s.id}")
            if data:
                info = json.loads(data)
                active.append({
                    "session_id": str(s.id),
                    "message_id": info.get("message_id"),
                })
    finally:
        await r.aclose()

    return active


@router.get("/agents/{agent_type}/session", response_model=ChatSessionResponse)
async def get_or_create_agent_session(
    agent_type: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    llm: LLMService = Depends(get_llm_service),
):
    """Get or create a session for a specific agent type."""
    if agent_type not in AGENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown agent type: {agent_type}",
        )

    agent = AGENT_TYPES[agent_type]

    # Look for a non-archived active session first
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.user_id == current_user.id,
            ChatSession.agent_type == agent_type,
            ChatSession.deleted_at.is_(None),
            ChatSession.file_path.is_(None),  # Not archived
        ).order_by(ChatSession.created_at.desc())
    )
    session = result.scalars().first()

    default_model = llm.service.default_model if hasattr(llm.service, 'default_model') else "zai-org/glm-4.7"

    if not session:
        session = ChatSession(
            title=agent["title"],
            model=default_model,
            use_rag=agent.get("use_rag", False),
            agent_type=agent_type,
            user_id=current_user.id,
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
    elif session.model != default_model:
        # Update model when provider/model setting has changed
        session.model = default_model
        await db.commit()
        await db.refresh(session)

    # Calculate unread count
    unread_count = 0
    unread_query = select(func.count()).select_from(ChatMessage).where(
        ChatMessage.session_id == session.id,
        ChatMessage.role == MessageRole.ASSISTANT,
    )
    if session.last_read_at:
        unread_query = unread_query.where(ChatMessage.created_at > session.last_read_at)
    unread_result = await db.execute(unread_query)
    unread_count = unread_result.scalar() or 0

    # Return with unread_count
    response = ChatSessionResponse.model_validate(session)
    response.unread_count = unread_count
    return response


@router.post("/agents/{agent_type}/read")
async def mark_agent_read(
    agent_type: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark agent session as read (update last_read_at)."""
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.user_id == current_user.id,
            ChatSession.agent_type == agent_type,
            ChatSession.deleted_at.is_(None),
        ).order_by(ChatSession.created_at.desc())
    )
    session = result.scalars().first()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent session not found",
        )

    session.last_read_at = datetime.utcnow()
    await db.commit()
    return {"status": "ok"}


@router.post("/sessions/{session_id}/messages", response_model=ChatMessageResponse)
async def send_message(
    session_id: uuid.UUID,
    message_data: ChatMessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    llm: LLMService = Depends(get_llm_service),
    embedding: EmbeddingService = Depends(get_embedding_service),
):
    """Send a message and get a response (non-streaming)."""
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user.id,
            ChatSession.deleted_at.is_(None),
        )
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    # Sync agent session model with current LLM provider default
    if session.agent_type:
        current_model = getattr(llm.service, 'default_model', None)
        if current_model and session.model != current_model:
            session.model = current_model
            await db.commit()

    # Save user message (commit immediately so it persists even if response fails)
    user_message = ChatMessage(
        session_id=session.id,
        role=MessageRole.USER,
        content=message_data.content,
    )
    db.add(user_message)
    await db.commit()

    # Get chat history (limit to recent messages to avoid context pollution)
    MAX_HISTORY = 20
    history_result = await db.execute(
        select(ChatMessage).where(
            ChatMessage.session_id == session_id,
        ).order_by(ChatMessage.created_at.desc())
        .limit(MAX_HISTORY)
    )
    history = [
        {"role": msg.role.value, "content": strip_tools_blocks(msg.content)}
        for msg in reversed(history_result.scalars().all())
    ]

    # Determine agent-specific behavior
    agent_config = AGENT_TYPES.get(session.agent_type) if session.agent_type else None

    # Token quota check
    allowed, quota_error = await check_quota(db, current_user.id)
    if not allowed:
        quota_msg = ChatMessage(
            session_id=session.id,
            role=MessageRole.ASSISTANT,
            content=quota_error,
        )
        db.add(quota_msg)
        await db.commit()
        await db.refresh(quota_msg)
        return quota_msg

    # Generate response
    usage_out: list = []
    rag_context = None

    # Resolve RAG file IDs: category-scoped or all indexed
    async def _resolve_rag_file_ids() -> list[str]:
        from app.models.file import File as FileModel
        if session.category_id:
            # Category-scoped: only files in this category
            result = await db.execute(
                select(FileModel.id)
                .join(FileCategory, FileCategory.file_id == FileModel.id)
                .where(
                    FileModel.user_id == current_user.id,
                    FileModel.is_indexed.is_(True),
                    FileCategory.category_id == session.category_id,
                )
            )
            return [str(row[0]) for row in result.all()]
        else:
            # All indexed files
            result = await db.execute(
                select(FileModel.id).where(
                    FileModel.user_id == current_user.id,
                    FileModel.is_indexed.is_(True),
                )
            )
            return [str(row[0]) for row in result.all()]

    # Use RAG: agent with use_rag flag, or session with category_id
    use_rag_for_session = (agent_config and agent_config.get("use_rag")) or session.category_id
    if use_rag_for_session:
        indexed_file_ids = await _resolve_rag_file_ids()

        if indexed_file_ids:
            rag_service = RAGService(embedding_service=embedding, llm_service=llm)
            response_text, sources = await rag_service.chat_with_context(
                db=db,
                user_id=str(current_user.id),
                query=message_data.content,
                chat_history=history[:-1],
                file_ids=indexed_file_ids,
                model=session.model,
                usage_out=usage_out,
            )
            if sources:
                rag_context = json.dumps([
                    {"file_id": s["file_id"], "file_name": s["file_name"], "similarity": s["similarity"]}
                    for s in sources
                ])
        else:
            # No indexed files, use regular chat
            system_prompt = None
            if agent_config:
                db_prompt = await get_setting_value(db, agent_config["prompt_key"])
                system_prompt = db_prompt if db_prompt else agent_config["default_prompt"]
            response_text = await llm.chat(
                messages=history,
                model=session.model,
                system_prompt=system_prompt,
                usage_out=usage_out,
            )
    elif session.use_rag and session.rag_file_ids:
        rag_service = RAGService(embedding_service=embedding, llm_service=llm)
        response_text, sources = await rag_service.chat_with_context(
            db=db,
            user_id=str(current_user.id),
            query=message_data.content,
            chat_history=history[:-1],
            file_ids=[str(fid) for fid in session.rag_file_ids],
            model=session.model,
            usage_out=usage_out,
        )
        if sources:
            rag_context = json.dumps([
                {"file_id": s["file_id"], "file_name": s["file_name"], "similarity": s["similarity"]}
                for s in sources
            ])
    else:
        # Use unified run_agent() for tool calling and plain chat
        try:
            response_text = await run_agent(
                db=db,
                user_id=current_user.id,
                prompt=message_data.content,
                agent_type=session.agent_type,
                session_id=session.id,
                source="chat",
                skip_user_message=True,  # already saved above
            )
        except Exception as e:
            logger.exception("Agent error: %s", e)
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"LLM service error: {str(e)}",
            )

        # run_agent() already saved the assistant message; retrieve it
        latest_result = await db.execute(
            select(ChatMessage).where(
                ChatMessage.session_id == session.id,
                ChatMessage.role == MessageRole.ASSISTANT,
            ).order_by(ChatMessage.created_at.desc()).limit(1)
        )
        assistant_message = latest_result.scalar_one_or_none()

        # Generate session title with LLM if first exchange
        message_count_result = await db.execute(
            select(func.count()).select_from(ChatMessage).where(
                ChatMessage.session_id == session_id
            )
        )
        if message_count_result.scalar() <= 2:
            from app.tasks.chat import generate_session_title_task
            generate_session_title_task.delay(
                str(session.id),
                message_data.content[:300],
                (assistant_message.content or "")[:300],
            )

        session.updated_at = datetime.utcnow()
        await db.commit()

        return assistant_message

    # RAG paths: clean and save assistant message
    response_text = clean_response(response_text)

    # Calculate total tokens from usage_out
    total_input = sum(u.get("prompt_tokens", 0) for u in usage_out)
    total_output = sum(u.get("completion_tokens", 0) for u in usage_out)

    assistant_message = ChatMessage(
        session_id=session.id,
        role=MessageRole.ASSISTANT,
        content=response_text,
        rag_context=rag_context,
        input_tokens=total_input or None,
        output_tokens=total_output or None,
    )
    db.add(assistant_message)

    # Record token usage
    if total_input or total_output:
        await record_usage(db, current_user.id, total_input, total_output, source="chat")

    # Generate session title with LLM if first exchange
    message_count_result = await db.execute(
        select(func.count()).select_from(ChatMessage).where(
            ChatMessage.session_id == session_id
        )
    )
    if message_count_result.scalar() <= 2:
        from app.tasks.chat import generate_session_title_task
        generate_session_title_task.delay(
            str(session.id),
            message_data.content[:300],
            response_text[:300],
        )

    session.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(assistant_message)

    return assistant_message


@router.post("/sessions/{session_id}/messages/stream")
async def send_message_stream(
    session_id: uuid.UUID,
    message_data: ChatMessageCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    llm: LLMService = Depends(get_llm_service),
    embedding: EmbeddingService = Depends(get_embedding_service),
):
    """Send a message and stream the response."""
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == session_id,
            ChatSession.user_id == current_user.id,
            ChatSession.deleted_at.is_(None),
        )
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found",
        )

    # Sync agent session model with current LLM provider default
    if session.agent_type:
        current_model = getattr(llm.service, 'default_model', None)
        if current_model and session.model != current_model:
            session.model = current_model
            await db.commit()

    # Save user message
    user_message = ChatMessage(
        session_id=session.id,
        role=MessageRole.USER,
        content=message_data.content,
    )
    db.add(user_message)
    await db.commit()

    # Get chat history (limit to recent messages to avoid context pollution)
    MAX_HISTORY = 20
    history_result = await db.execute(
        select(ChatMessage).where(
            ChatMessage.session_id == session_id,
        ).order_by(ChatMessage.created_at.desc())
        .limit(MAX_HISTORY)
    )
    history = [
        {"role": msg.role.value, "content": strip_tools_blocks(msg.content)}
        for msg in reversed(history_result.scalars().all())
    ]

    # Token quota check
    allowed, quota_error = await check_quota(db, current_user.id)
    if not allowed:
        quota_msg = ChatMessage(
            session_id=session.id,
            role=MessageRole.ASSISTANT,
            content=quota_error,
        )
        db.add(quota_msg)
        await db.commit()

        async def quota_stream():
            yield f"data: {json.dumps({'type': 'content', 'data': quota_error})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'message_id': str(quota_msg.id)})}\n\n"

        return StreamingResponse(
            quota_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
        )

    # Determine agent config for streaming
    agent_config = AGENT_TYPES.get(session.agent_type) if session.agent_type else None

    # Resolve RAG file IDs for streaming (category-scoped or explicit)
    stream_rag_file_ids: list[str] | None = None
    if session.category_id:
        from app.models.file import File as FileModel
        cat_result = await db.execute(
            select(FileModel.id)
            .join(FileCategory, FileCategory.file_id == FileModel.id)
            .where(
                FileModel.user_id == current_user.id,
                FileModel.is_indexed.is_(True),
                FileCategory.category_id == session.category_id,
            )
        )
        stream_rag_file_ids = [str(row[0]) for row in cat_result.all()]
    elif session.use_rag and session.rag_file_ids:
        stream_rag_file_ids = [str(fid) for fid in session.rag_file_ids]

    async def generate():
        full_response = ""
        rag_context = None
        usage_out: list = []

        if stream_rag_file_ids:
            rag_service = RAGService(embedding_service=embedding, llm_service=llm)
            async for data in rag_service.chat_with_context_stream(
                db=db,
                user_id=str(current_user.id),
                query=message_data.content,
                chat_history=history[:-1],
                file_ids=stream_rag_file_ids,
                model=session.model,
                usage_out=usage_out,
            ):
                if "sources" in data:
                    sources = data["sources"]
                    rag_context = json.dumps([
                        {"file_id": s["file_id"], "file_name": s["file_name"]}
                        for s in sources
                    ])
                    yield f"data: {json.dumps({'type': 'sources', 'data': sources})}\n\n"
                elif "chunk" in data:
                    full_response += data["chunk"]
                    yield f"data: {json.dumps({'type': 'content', 'data': data['chunk']})}\n\n"
        else:
            # Use agent system prompt from DB if available
            if agent_config:
                db_prompt = await get_setting_value(db, agent_config["prompt_key"])
                system_prompt = db_prompt if db_prompt else agent_config["default_prompt"]
            else:
                system_prompt = None
            async for chunk in llm.chat_stream(
                messages=history,
                model=session.model,
                system_prompt=system_prompt,
                usage_out=usage_out,
            ):
                full_response += chunk
                yield f"data: {json.dumps({'type': 'content', 'data': chunk})}\n\n"

        # Calculate total tokens
        total_input = sum(u.get("prompt_tokens", 0) for u in usage_out)
        total_output = sum(u.get("completion_tokens", 0) for u in usage_out)

        # Save assistant message
        assistant_message = ChatMessage(
            session_id=session.id,
            role=MessageRole.ASSISTANT,
            content=full_response,
            rag_context=rag_context,
            input_tokens=total_input or None,
            output_tokens=total_output or None,
        )
        db.add(assistant_message)

        # Record token usage
        if total_input or total_output:
            await record_usage(db, current_user.id, total_input, total_output, source="chat")

        session.updated_at = datetime.utcnow()
        await db.commit()

        # Generate session title with LLM if first exchange
        msg_count_result = await db.execute(
            select(func.count()).select_from(ChatMessage).where(
                ChatMessage.session_id == session_id
            )
        )
        if msg_count_result.scalar() <= 2:
            from app.tasks.chat import generate_session_title_task
            generate_session_title_task.delay(
                    str(session.id),
                    message_data.content[:300],
                    full_response[:300],
                )

        yield f"data: {json.dumps({'type': 'done', 'message_id': str(assistant_message.id)})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )


@router.post("/chat", response_model=ChatMessageResponse)
async def quick_chat(
    chat_data: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    llm: LLMService = Depends(get_llm_service),
    embedding: EmbeddingService = Depends(get_embedding_service),
):
    """Quick chat - create session if needed and send message."""
    # Get or create session
    if chat_data.session_id:
        result = await db.execute(
            select(ChatSession).where(
                ChatSession.id == chat_data.session_id,
                ChatSession.user_id == current_user.id,
                ChatSession.deleted_at.is_(None),
            )
        )
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found",
            )
    else:
        # Use default model from LLM service if not specified
        default_model = llm.service.default_model if hasattr(llm.service, 'default_model') else "zai-org/glm-4.7"

        session = ChatSession(
            title="New Chat",
            model=chat_data.model or default_model,
            use_rag=chat_data.use_rag,
            rag_file_ids=chat_data.rag_file_ids,
            user_id=current_user.id,
        )
        db.add(session)
        await db.flush()

    # Save user message
    user_message = ChatMessage(
        session_id=session.id,
        role=MessageRole.USER,
        content=chat_data.message,
    )
    db.add(user_message)
    await db.flush()

    # Get history (limit to recent messages)
    MAX_HISTORY = 20
    history_result = await db.execute(
        select(ChatMessage).where(
            ChatMessage.session_id == session.id,
        ).order_by(ChatMessage.created_at.desc())
        .limit(MAX_HISTORY)
    )
    history = [
        {"role": msg.role.value, "content": strip_tools_blocks(msg.content)}
        for msg in reversed(history_result.scalars().all())
    ]

    # Generate response
    rag_context = None
    if session.use_rag and session.rag_file_ids:
        rag_service = RAGService(embedding_service=embedding, llm_service=llm)
        response_text, sources = await rag_service.chat_with_context(
            db=db,
            user_id=str(current_user.id),
            query=chat_data.message,
            chat_history=history[:-1],
            file_ids=[str(fid) for fid in session.rag_file_ids],
            model=session.model,
        )
        if sources:
            rag_context = json.dumps(sources)
    else:
        response_text = await llm.chat(
            messages=history,
            model=session.model,
        )

    assistant_message = ChatMessage(
        session_id=session.id,
        role=MessageRole.ASSISTANT,
        content=response_text,
        rag_context=rag_context,
    )
    db.add(assistant_message)
    session.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(assistant_message)

    # Generate title for new sessions
    msg_count_result = await db.execute(
        select(func.count()).select_from(ChatMessage).where(
            ChatMessage.session_id == session.id
        )
    )
    if msg_count_result.scalar() <= 2:
        from app.tasks.chat import generate_session_title_task
        generate_session_title_task.delay(
            str(session.id),
            chat_data.message[:300],
            response_text[:300],
        )

    return assistant_message


@router.get("/models")
async def list_models(
    db: AsyncSession = Depends(get_db),
    llm: LLMService = Depends(get_llm_service),
):
    """List available LLM models."""
    try:
        models = await llm.list_models()
        return {"models": models}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to LLM provider: {str(e)}",
        )
