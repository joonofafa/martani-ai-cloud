"""Chat storage service: save/load conversations as JSONB files in MinIO."""

import io
import json
import logging
import uuid
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.models.chat import ChatSession, ChatMessage
from app.models.user import User
from app.services.storage.minio_service import get_minio_service

logger = logging.getLogger(__name__)

CHAT_FOLDER = ".chats"


class ChatStorageService:
    def __init__(self):
        self.minio = get_minio_service()

    def _storage_path(self, user_id: str, session_id: str) -> str:
        return f"{user_id}/{CHAT_FOLDER}/{session_id}.json"

    async def save_to_file(self, db: AsyncSession, session_id: uuid.UUID) -> int:
        """Save session messages to MinIO as JSONB, delete messages from DB.
        Returns the file size in bytes.
        """
        result = await db.execute(
            select(ChatSession).where(ChatSession.id == session_id)
        )
        session = result.scalar_one_or_none()
        if not session:
            raise ValueError(f"Session {session_id} not found")

        # Get all messages
        msg_result = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at)
        )
        messages = msg_result.scalars().all()

        if not messages:
            return 0

        # Build JSONB
        data = {
            "session_id": str(session.id),
            "title": session.title,
            "category_id": str(session.category_id) if session.category_id else None,
            "agent_type": session.agent_type,
            "model": session.model,
            "use_rag": session.use_rag,
            "created_at": session.created_at.isoformat(),
            "updated_at": session.updated_at.isoformat(),
            "messages": [
                {
                    "id": str(m.id),
                    "role": m.role.value,
                    "content": m.content,
                    "rag_context": m.rag_context,
                    "source": m.source,
                    "source_id": str(m.source_id) if m.source_id else None,
                    "input_tokens": m.input_tokens,
                    "output_tokens": m.output_tokens,
                    "created_at": m.created_at.isoformat(),
                }
                for m in messages
            ],
        }

        content = json.dumps(data, ensure_ascii=False).encode("utf-8")
        file_size = len(content)
        storage_path = self._storage_path(str(session.user_id), str(session.id))

        # Upload to MinIO
        self.minio.client.put_object(
            self.minio.bucket,
            storage_path,
            io.BytesIO(content),
            file_size,
            content_type="application/json",
        )

        # Update session metadata
        session.file_path = storage_path
        session.file_size = file_size

        # Update user storage
        user_result = await db.execute(select(User).where(User.id == session.user_id))
        user = user_result.scalar_one_or_none()
        if user:
            user.storage_used = (user.storage_used or 0) + file_size

        # Delete messages from DB
        await db.execute(
            delete(ChatMessage).where(ChatMessage.session_id == session_id)
        )

        await db.commit()
        logger.info("Saved session %s to MinIO (%d bytes)", session_id, file_size)
        return file_size

    async def load_from_file(self, db: AsyncSession, session_id: uuid.UUID) -> int:
        """Load conversation from MinIO file back into DB messages.
        Returns the number of messages restored.
        """
        result = await db.execute(
            select(ChatSession).where(ChatSession.id == session_id)
        )
        session = result.scalar_one_or_none()
        if not session or not session.file_path:
            raise ValueError(f"Session {session_id} has no saved file")

        # Check if messages already exist in DB
        existing = await db.execute(
            select(ChatMessage.id)
            .where(ChatMessage.session_id == session_id)
            .limit(1)
        )
        if existing.scalar_one_or_none():
            # Already loaded
            return 0

        # Download from MinIO
        content = self.minio.download_file(session.file_path)
        data = json.loads(content)

        # Restore messages to DB (keep file_path — MinIO file is the archive)
        for m in data.get("messages", []):
            msg = ChatMessage(
                id=uuid.UUID(m["id"]),
                session_id=session_id,
                role=m["role"],
                content=m["content"],
                rag_context=m.get("rag_context"),
                source=m.get("source"),
                source_id=uuid.UUID(m["source_id"]) if m.get("source_id") else None,
                input_tokens=m.get("input_tokens"),
                output_tokens=m.get("output_tokens"),
                created_at=datetime.fromisoformat(m["created_at"]),
            )
            db.add(msg)

        await db.commit()
        msg_count = len(data.get("messages", []))
        logger.info("Loaded session %s from MinIO (%d messages)", session_id, msg_count)
        return msg_count

    async def delete_file(self, db: AsyncSession, session_id: uuid.UUID) -> None:
        """Delete the MinIO file for a session and subtract from storage."""
        result = await db.execute(
            select(ChatSession).where(ChatSession.id == session_id)
        )
        session = result.scalar_one_or_none()
        if not session:
            return

        if session.file_path:
            try:
                self.minio.delete_file(session.file_path)
            except Exception:
                logger.warning("Failed to delete MinIO file: %s", session.file_path)

            # Subtract from user storage
            if session.file_size:
                user_result = await db.execute(
                    select(User).where(User.id == session.user_id)
                )
                user = user_result.scalar_one_or_none()
                if user:
                    user.storage_used = max(0, (user.storage_used or 0) - session.file_size)

            session.file_path = None
            session.file_size = 0
            await db.commit()


# Singleton
_chat_storage: ChatStorageService | None = None


def get_chat_storage() -> ChatStorageService:
    global _chat_storage
    if _chat_storage is None:
        _chat_storage = ChatStorageService()
    return _chat_storage
