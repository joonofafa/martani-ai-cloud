"""LLM Service - Unified interface for LLM providers (OpenRouter, Ollama)."""

from typing import AsyncGenerator
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.settings_manager import load_settings_from_db, DynamicSettings
from app.services.ai.ollama_service import OllamaService
from app.services.ai.openai_compat_service import OpenAICompatService


class LLMService:
    """Unified service for chat completions from different providers."""

    def __init__(self, settings: DynamicSettings | None = None):
        if settings is None:
            # Fallback to environment variables if no DB settings provided
            env_settings = get_settings()
            self.provider = env_settings.llm_provider
            ollama_url = env_settings.ollama_url
            ollama_model = env_settings.ollama_model
            openrouter_api_key = env_settings.openrouter_api_key
            openrouter_model = env_settings.openrouter_model
        else:
            # Use database settings
            self.provider = settings.llm_provider
            # Use generic llm_endpoint and llm_model (which are loaded from database)
            ollama_url = settings.llm_endpoint
            ollama_model = settings.llm_model
            openrouter_api_key = settings.openrouter_api_key
            openrouter_model = settings.openrouter_model

        if self.provider == "openrouter":
            self.service = OpenAICompatService(
                api_key=openrouter_api_key,
                model=openrouter_model,
                base_url="https://openrouter.ai/api/v1",
            )
            self.vision_model = (settings.openrouter_vision_model
                                 if settings else get_settings().openrouter_vision_model)
            # Separate API key for vision; falls back to chat key if not set
            vision_key = (settings.openrouter_vision_api_key
                          if settings else get_settings().openrouter_vision_api_key)
            self.vision_api_key = vision_key if vision_key else openrouter_api_key
        else:  # Default to Ollama
            self.service = OllamaService(base_url=ollama_url, model=ollama_model)
            self.vision_model = None
            self.vision_api_key = None

    async def health_check(self) -> bool:
        """Check if the LLM provider is accessible."""
        return await self.service.health_check()

    async def list_models(self) -> list[dict]:
        """List available models from the provider."""
        return await self.service.list_models()

    async def chat(
        self,
        messages: list[dict],
        model: str | None = None,
        system_prompt: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        usage_out: list | None = None,
    ) -> str:
        """
        Send chat messages and get a complete response.

        Args:
            messages: List of message dicts with 'role' and 'content'
            model: Model to use (uses provider's default if not specified)
            system_prompt: Optional system prompt
            temperature: Sampling temperature (0.0-1.0)
            max_tokens: Maximum tokens in response
            usage_out: Optional list to collect usage data

        Returns:
            The assistant's response text
        """
        return await self.service.chat(
            messages=messages,
            model=model,
            system_prompt=system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            usage_out=usage_out,
        )

    async def chat_with_tools(
        self,
        messages: list[dict],
        tools: list[dict],
        model: str | None = None,
        system_prompt: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        tool_choice: str = "auto",
    ) -> dict:
        """
        Send chat messages with tools and get full message dict.
        Falls back to plain chat for providers that don't support tools.
        """
        if isinstance(self.service, OpenAICompatService):
            return await self.service.chat_with_tools(
                messages=messages,
                tools=tools,
                model=model,
                system_prompt=system_prompt,
                temperature=temperature,
                max_tokens=max_tokens,
                tool_choice=tool_choice,
            )
        # Fallback: plain chat (Ollama doesn't support tool calling)
        text = await self.service.chat(
            messages=messages,
            model=model,
            system_prompt=system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return {"role": "assistant", "content": text}

    async def chat_with_vision(
        self,
        image_bytes: bytes,
        mime_type: str,
        prompt: str,
        max_tokens: int = 1500,
        usage_out: list | None = None,
    ) -> str:
        """Analyze an image using a vision-capable model.

        Returns empty string if provider doesn't support vision.
        """
        if not self.vision_model or not isinstance(self.service, OpenAICompatService):
            return ""
        return await self.service.chat_with_vision(
            image_bytes=image_bytes,
            mime_type=mime_type,
            prompt=prompt,
            vision_model=self.vision_model,
            max_tokens=max_tokens,
            api_key_override=self.vision_api_key,
            usage_out=usage_out,
        )

    async def chat_stream(
        self,
        messages: list[dict],
        model: str | None = None,
        system_prompt: str | None = None,
        temperature: float = 0.7,
        max_tokens: int | None = None,
        usage_out: list | None = None,
    ) -> AsyncGenerator[str, None]:
        """
        Send chat messages and stream the response.

        Yields:
            Chunks of the assistant's response text
        """
        async for chunk in self.service.chat_stream(
            messages=messages,
            model=model,
            system_prompt=system_prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            usage_out=usage_out,
        ):
            yield chunk


async def get_llm_service(db: AsyncSession = Depends(get_db)) -> LLMService:
    """
    Get LLM service with settings loaded from database.

    This is a FastAPI dependency that loads runtime settings from the database
    and creates an LLM service instance with those settings.
    """
    settings = await load_settings_from_db(db)
    return LLMService(settings)
