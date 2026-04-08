#!/usr/bin/env python3
"""Update existing chat sessions to use valid OpenRouter models."""
import asyncio
import sys
import os

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import update, select
from app.core.database import async_session, engine
from app.models.chat import ChatSession


async def update_invalid_models():
    """Update sessions with legacy model names to use OpenRouter default."""
    default_model = "openai/gpt-4o-mini"
    legacy_models = ["llama3.1", "llama3", "llama2", "mistral", "mixtral", "codellama",
                     "zai-org-glm-4.6v", "zai-org/glm-4.7", "zai-org/glm-4.6v"]

    async with async_session() as session:
        # Find sessions with legacy model names
        result = await session.execute(
            select(ChatSession).where(ChatSession.model.in_(legacy_models))
        )
        sessions_to_update = result.scalars().all()

        count = len(sessions_to_update)

        if count == 0:
            print("No sessions need updating.")
            return

        print(f"Found {count} sessions with legacy model names.")
        print(f"Updating to default model: {default_model}")

        # Update all sessions
        await session.execute(
            update(ChatSession)
            .where(ChatSession.model.in_(legacy_models))
            .values(model=default_model)
        )

        await session.commit()
        print(f"Successfully updated {count} sessions!")


if __name__ == "__main__":
    asyncio.run(update_invalid_models())
