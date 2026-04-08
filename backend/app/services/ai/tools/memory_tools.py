"""Agent memory tool implementations."""

import json
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent_memory import AgentMemory


async def _save_memory(
    user_id: uuid.UUID, category: str, key: str, content: str, db: AsyncSession
) -> str:
    valid_categories = ("preference", "habit", "fact", "instruction", "contact")
    if category not in valid_categories:
        category = "general"

    # Check if same key exists — update instead of duplicate
    result = await db.execute(
        select(AgentMemory).where(
            AgentMemory.user_id == user_id,
            AgentMemory.category == category,
            AgentMemory.key == key,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.content = content
        existing.updated_at = datetime.utcnow()
        await db.flush()
        return json.dumps({
            "id": str(existing.id),
            "message": f"Memory updated: [{category}] {key}",
        }, ensure_ascii=False)

    memory = AgentMemory(
        user_id=user_id,
        category=category,
        key=key,
        content=content,
    )
    db.add(memory)
    await db.flush()

    return json.dumps({
        "id": str(memory.id),
        "message": f"New memory saved: [{category}] {key}",
    }, ensure_ascii=False)


async def _recall_memory(
    user_id: uuid.UUID, query: str, category: str | None, db: AsyncSession
) -> str:
    stmt = select(AgentMemory).where(AgentMemory.user_id == user_id)

    if category:
        stmt = stmt.where(AgentMemory.category == category)

    if query:
        pattern = f"%{query}%"
        stmt = stmt.where(
            (AgentMemory.key.ilike(pattern)) | (AgentMemory.content.ilike(pattern))
        )

    result = await db.execute(
        stmt.order_by(AgentMemory.updated_at.desc()).limit(30)
    )
    memories = result.scalars().all()

    if not memories:
        return json.dumps({"message": "No related memories found.", "memories": []}, ensure_ascii=False)

    return json.dumps({
        "message": f"{len(memories)} memory(ies) found",
        "memories": [
            {
                "id": str(m.id),
                "category": m.category,
                "key": m.key,
                "content": m.content,
                "updated_at": m.updated_at.isoformat(),
            }
            for m in memories
        ],
    }, ensure_ascii=False)


async def _delete_memory(user_id: uuid.UUID, memory_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(AgentMemory).where(
            AgentMemory.id == uuid.UUID(memory_id),
            AgentMemory.user_id == user_id,
        )
    )
    memory = result.scalar_one_or_none()
    if not memory:
        return json.dumps({"error": "Memory not found."})

    await db.delete(memory)
    await db.flush()
    return json.dumps({
        "message": f"Memory deleted: [{memory.category}] {memory.key}",
    }, ensure_ascii=False)
