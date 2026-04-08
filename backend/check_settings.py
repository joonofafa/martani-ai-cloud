#!/usr/bin/env python3
"""Quick script to check system settings."""
import asyncio
from sqlalchemy import select, text
from app.core.database import async_session
from app.models.settings import SystemSettings

async def main():
    async with async_session() as session:
        result = await session.execute(
            select(SystemSettings).where(
                SystemSettings.key.in_([
                    'llm_provider',
                    'openrouter_api_key',
                    'openrouter_model',
                    'openrouter_vision_model',
                    'embedding_provider',
                    'embedding_model',
                    'embedding_endpoint',
                ])
            ).order_by(SystemSettings.key)
        )
        settings = result.scalars().all()

        print("Current Settings:")
        print("-" * 60)
        for s in settings:
            value = s.value if not s.is_secret else "***" if s.value else "(not set)"
            print(f"{s.key:30} = {value}")

        if not settings:
            print("No settings found!")

if __name__ == "__main__":
    asyncio.run(main())
