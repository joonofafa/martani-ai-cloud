"""WebSocket endpoint for real-time AI chat with streaming and notifications."""

import asyncio
import json
import logging
import uuid as _uuid_mod
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from jose import JWTError, jwt

import redis.asyncio as aioredis

from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.models.chat import ChatSession, ChatMessage, MessageRole
from app.services.ai.agent_executor import run_agent

logger = logging.getLogger(__name__)

router = APIRouter()


async def _authenticate_ws(token: str) -> User | None:
    """Authenticate WebSocket connection via JWT token."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("type") != "access":
            return None
        user_id = payload.get("sub")
        if not user_id:
            return None
    except JWTError:
        return None

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user and not user.is_active:
            return None
        return user


async def _save_user_message(db, session_id: str, user_id, content: str):
    """Verify session ownership and save user message. Returns (session, message) or (None, None)."""
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.id == _uuid_mod.UUID(session_id),
            ChatSession.user_id == user_id,
            ChatSession.deleted_at.is_(None),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        return None, None

    user_msg = ChatMessage(
        session_id=session.id,
        role=MessageRole.USER,
        content=content,
    )
    db.add(user_msg)
    await db.commit()
    return session, user_msg


@router.websocket("/ws/chat/{session_id}")
async def websocket_chat(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for real-time chat.

    Connection: ws://host/api/v1/ws/chat/{session_id}?token=JWT_TOKEN

    Client sends: {"type": "message", "content": "..."}
    Server sends:
      - {"type": "token", "content": "..."} -- streaming text tokens
      - {"type": "tool_call", "name": "...", "arguments": {...}} -- tool being called
      - {"type": "tool_result", "name": "...", "result": "..."} -- tool result
      - {"type": "done", "message_id": "...", "content": "..."} -- final complete message
      - {"type": "error", "message": "..."} -- error
      - {"type": "input_request", "prompt": "..."} -- request user input (MFA etc.)
    """
    # Authenticate via query param
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    user = await _authenticate_ws(token)
    if not user:
        await websocket.close(code=4001, reason="Invalid token")
        return

    await websocket.accept()

    try:
        while True:
            # Receive message from client
            try:
                raw = await websocket.receive_text()
            except RuntimeError:
                # WS disconnected during relay (e.g., client closed after done event)
                break
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = data.get("type")

            # Handle reconnect: re-attach to an active Celery task's stream
            if msg_type == "reconnect":
                settings = get_settings()
                async with AsyncSessionLocal() as db:
                    own = await db.execute(
                        select(ChatSession).where(
                            ChatSession.id == _uuid_mod.UUID(session_id),
                            ChatSession.user_id == user.id,
                            ChatSession.deleted_at.is_(None),
                        )
                    )
                    if not own.scalar_one_or_none():
                        await websocket.send_json({"type": "error", "message": "Session not found"})
                        continue
                if settings.chat_use_celery:
                    r = aioredis.from_url(settings.redis_url)
                    try:
                        active_data = await r.get(f"chat:active:{session_id}")
                        if active_data:
                            info = json.loads(active_data)
                            message_id = info["message_id"]
                            await websocket.send_json({
                                "type": "task_started",
                                "message_id": message_id,
                            })
                            # Replay progress buffer before subscribing to live events
                            progress_data = await r.get(f"chat:progress:{session_id}")
                            if progress_data:
                                progress = json.loads(progress_data)
                                await websocket.send_json({
                                    "type": "progress_replay",
                                    "tools": progress.get("tools", []),
                                    "last_text": progress.get("last_text", ""),
                                })
                            await _handle_celery_relay(
                                websocket, session_id, message_id, settings,
                            )
                        else:
                            # Task already finished
                            await websocket.send_json({"type": "done"})
                    finally:
                        await r.aclose()
                else:
                    await websocket.send_json({"type": "done"})
                continue

            if msg_type != "message":
                continue

            content = (data.get("content") or "").strip()
            if not content:
                continue

            logger.info("WS message received: session=%s, content_len=%d", session_id, len(content))

            settings = get_settings()

            async with AsyncSessionLocal() as db:
                session, user_msg = await _save_user_message(db, session_id, user.id, content)
                if not session:
                    await websocket.send_json({"type": "error", "message": "Session not found"})
                    continue

                message_id = str(user_msg.id)
                logger.info("WS dispatch: msg_id=%s, celery=%s", message_id, settings.chat_use_celery)

                try:
                    if settings.chat_use_celery:
                        # Celery mode: relay handles ALL WS I/O (no outer loop reading)
                        await _handle_celery_mode(
                            websocket, session_id, message_id, str(user.id), settings,
                        )
                    else:
                        # Inline mode: run agent with concurrent input handling
                        await _handle_inline_mode_with_input(
                            websocket, db, user, session, user_msg, content,
                        )
                except WebSocketDisconnect:
                    raise
                except Exception as e:
                    logger.exception("WS handler error: %s", e)
                    await db.rollback()
                    try:
                        await websocket.send_json({"type": "error", "message": str(e)})
                    except Exception:
                        pass

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("WS unexpected error")


async def _handle_celery_mode(
    websocket: WebSocket,
    session_id: str,
    message_id: str,
    user_id: str,
    settings,
):
    """Dispatch Celery task and relay Redis pub/sub events to WebSocket.

    This function owns all WS I/O — no other coroutine should read from WS concurrently.
    """
    r = aioredis.from_url(settings.redis_url)
    channel = f"chat:stream:{session_id}:{message_id}"
    input_channel = f"chat:input:{session_id}:{message_id}"

    pubsub = r.pubsub()
    await pubsub.subscribe(channel)

    try:
        # Dispatch Celery task (after subscribing to avoid race condition)
        from app.tasks.chat import process_chat_message_task
        process_chat_message_task.delay(session_id, user_id, message_id)

        # Notify client that the task has started
        await websocket.send_json({"type": "task_started", "message_id": message_id})

        # Relay events between Redis and WebSocket
        await _relay_loop(websocket, pubsub, r, input_channel)
    finally:
        await pubsub.unsubscribe(channel)
        try:
            await r.delete(input_channel)
        except Exception:
            pass
        await r.aclose()


async def _handle_celery_relay(
    websocket: WebSocket,
    session_id: str,
    message_id: str,
    settings,
):
    """Reconnect relay: subscribe to an existing Celery task's stream (no dispatch)."""
    r = aioredis.from_url(settings.redis_url)
    channel = f"chat:stream:{session_id}:{message_id}"
    input_channel = f"chat:input:{session_id}:{message_id}"

    pubsub = r.pubsub()
    await pubsub.subscribe(channel)

    try:
        await _relay_loop(websocket, pubsub, r, input_channel)
    finally:
        await pubsub.unsubscribe(channel)
        await r.aclose()


async def _relay_loop(websocket, pubsub, r, input_channel):
    """Shared relay loop: forward Redis pub/sub <-> WebSocket."""
    done = asyncio.Event()

    async def relay_redis_to_ws():
        """Forward Redis pub/sub messages to WebSocket."""
        while not done.is_set():
            msg = await pubsub.get_message(
                ignore_subscribe_messages=True, timeout=1.0,
            )
            if msg and msg["type"] == "message":
                data = json.loads(msg["data"])
                try:
                    await websocket.send_json(data)
                except Exception:
                    done.set()
                    break
                if data.get("type") in ("done", "error"):
                    done.set()
                    break

    async def relay_ws_to_redis():
        """Forward client input_response to Redis for Celery task."""
        while not done.is_set():
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
                msg = json.loads(raw)
                if msg.get("type") == "input_response":
                    await r.rpush(input_channel, msg.get("content", ""))
            except asyncio.TimeoutError:
                continue
            except (WebSocketDisconnect, Exception):
                break

    await asyncio.gather(relay_redis_to_ws(), relay_ws_to_redis())


async def _handle_inline_mode_with_input(
    websocket: WebSocket,
    db,
    user: User,
    session: ChatSession,
    user_msg: ChatMessage,
    content: str,
):
    """Run agent inline with concurrent input handling for MFA/OTP.

    Uses a task + outer loop pattern so we can read input_response from WS
    while run_agent() is executing.
    """
    input_event = asyncio.Event()
    input_value: dict[str, str | None] = {"value": None}

    async def ws_publish(event: dict):
        try:
            await websocket.send_json(event)
        except Exception:
            pass

    async def ws_request_input(prompt: str) -> str:
        await websocket.send_json({"type": "input_request", "prompt": prompt})
        input_event.clear()
        input_value["value"] = None
        try:
            await asyncio.wait_for(input_event.wait(), timeout=300)
        except asyncio.TimeoutError:
            return ""
        return input_value["value"] or ""

    if session.category_id:
        # Category-scoped RAG mode
        from app.tasks.chat import _handle_category_rag
        from app.core.database import AsyncSessionLocal
        exec_task = asyncio.create_task(
            _handle_category_rag(
                factory=AsyncSessionLocal,
                session_id=str(session.id),
                category_id=str(session.category_id),
                session_model=session.model,
                user_content=user_msg.content,
                user_id=str(user.id),
                publish=ws_publish,
            )
        )
    else:
        exec_task = asyncio.create_task(
            run_agent(
                db=db,
                user_id=user.id,
                prompt=content,
                agent_type=session.agent_type,
                session_id=session.id,
                source="chat",
                on_event=ws_publish,
                request_user_input=ws_request_input,
                skip_user_message=True,
            )
        )

    try:
        while not exec_task.done():
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=1.0)
                data = json.loads(raw)
                if data.get("type") == "input_response":
                    input_value["value"] = data.get("content", "")
                    input_event.set()
            except asyncio.TimeoutError:
                continue
            except json.JSONDecodeError:
                continue

        # Re-raise any exception from the task
        if exec_task.exception():
            raise exec_task.exception()
    except WebSocketDisconnect:
        exec_task.cancel()
        raise
    except Exception as e:
        if not exec_task.done():
            exec_task.cancel()
        logger.exception("Inline agent run failed: %s", e)
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


@router.websocket("/ws/notifications")
async def websocket_notifications(websocket: WebSocket):
    """
    WebSocket endpoint for real-time notifications (schedule/trigger results).

    Connection: ws://host/api/v1/ws/notifications?token=JWT_TOKEN
    Server sends: {"type": "notification", "source": "schedule"|"trigger", "name": "...", ...}
    """
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Missing token")
        return

    user = await _authenticate_ws(token)
    if not user:
        await websocket.close(code=4001, reason="Invalid token")
        return

    await websocket.accept()

    settings = get_settings()
    r = aioredis.from_url(settings.redis_url)
    pubsub = r.pubsub()
    channel = f"user:{user.id}:notifications"

    try:
        await pubsub.subscribe(channel)

        while True:
            # Wait for Redis messages with a timeout to check WS health
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=5.0)
            if msg and msg["type"] == "message":
                try:
                    payload = json.loads(msg["data"])
                    await websocket.send_json(payload)
                except (json.JSONDecodeError, Exception):
                    pass

            # Send heartbeat/ping to detect disconnection
            try:
                await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=0.01,
                )
            except asyncio.TimeoutError:
                pass  # No client message, that's fine
            except WebSocketDisconnect:
                break

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.close()
        await r.close()
