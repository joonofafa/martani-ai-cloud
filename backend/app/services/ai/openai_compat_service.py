"""OpenAI-compatible LLM Service - Works with any OpenAI API-compatible provider (OpenRouter, etc.)."""

import asyncio
import base64
import httpx
import logging
from typing import AsyncGenerator
import json

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Retry config for transient server errors
_RETRY_STATUS_CODES = {500, 502, 503, 429}
_MAX_RETRIES = 3
_RETRY_BACKOFF = [1.0, 2.0, 4.0]


class OpenAICompatService:
    """Service for interacting with OpenAI API-compatible LLM providers."""

    def __init__(self, api_key: str | None = None, model: str | None = None, base_url: str | None = None):
        settings = get_settings()
        self.api_key = api_key or settings.openrouter_api_key
        self.base_url = base_url or "https://openrouter.ai/api/v1"
        self.default_model = model or settings.openrouter_model
        self.timeout = httpx.Timeout(60.0, connect=10.0)

    async def _post_with_retry(
        self,
        client: httpx.AsyncClient,
        url: str,
        *,
        json: dict,
        headers: dict,
    ) -> httpx.Response:
        """POST with automatic retry on transient server errors (500/502/503/429)."""
        last_exc: Exception | None = None
        for attempt in range(_MAX_RETRIES):
            try:
                response = await client.post(url, json=json, headers=headers)
                if response.status_code not in _RETRY_STATUS_CODES or attempt == _MAX_RETRIES - 1:
                    response.raise_for_status()
                    return response
                # Retryable status — wait and retry
                wait = _RETRY_BACKOFF[attempt] if attempt < len(_RETRY_BACKOFF) else _RETRY_BACKOFF[-1]
                logger.warning("LLM API returned %d, retrying in %.1fs (attempt %d/%d)", response.status_code, wait, attempt + 1, _MAX_RETRIES)
                await asyncio.sleep(wait)
            except httpx.HTTPStatusError as e:
                if e.response.status_code in _RETRY_STATUS_CODES and attempt < _MAX_RETRIES - 1:
                    wait = _RETRY_BACKOFF[attempt] if attempt < len(_RETRY_BACKOFF) else _RETRY_BACKOFF[-1]
                    logger.warning("LLM API returned %d, retrying in %.1fs (attempt %d/%d)", e.response.status_code, wait, attempt + 1, _MAX_RETRIES)
                    await asyncio.sleep(wait)
                    last_exc = e
                    continue
                raise
            except (httpx.ConnectError, httpx.ReadTimeout) as e:
                if attempt < _MAX_RETRIES - 1:
                    wait = _RETRY_BACKOFF[attempt] if attempt < len(_RETRY_BACKOFF) else _RETRY_BACKOFF[-1]
                    logger.warning("LLM API connection error: %s, retrying in %.1fs (attempt %d/%d)", type(e).__name__, wait, attempt + 1, _MAX_RETRIES)
                    await asyncio.sleep(wait)
                    last_exc = e
                    continue
                raise
        # Should not reach here, but just in case
        if last_exc:
            raise last_exc
        raise RuntimeError("Retry loop exhausted without response")

    def _resolve_model(self, model: str | None) -> str:
        """Resolve model name, falling back to default for incompatible models."""
        if not model:
            return self.default_model
        # Ollama-style models (e.g. "llama3.1") don't contain '/'
        # OpenRouter models use org/name format (e.g. "deepseek/deepseek-chat")
        if '/' not in model and model != self.default_model:
            return self.default_model
        return model

    async def health_check(self) -> bool:
        """Check if the API is accessible."""
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                headers = {"Authorization": f"Bearer {self.api_key}"}
                response = await client.get(
                    f"{self.base_url}/models",
                    headers=headers
                )
                return response.status_code == 200
        except Exception:
            return False

    async def list_models(self) -> list[dict]:
        """List available models."""
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            headers = {"Authorization": f"Bearer {self.api_key}"}
            response = await client.get(
                f"{self.base_url}/models",
                headers=headers
            )
            response.raise_for_status()
            data = response.json()
            return data.get("data", [])

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
            model: Model to use (defaults to configured model)
            system_prompt: Optional system prompt
            temperature: Sampling temperature (0.0-1.0)
            max_tokens: Maximum tokens in response

        Returns:
            The assistant's response text
        """
        model = self._resolve_model(model)

        # Add system message if provided
        if system_prompt:
            messages = [
                {"role": "system", "content": system_prompt},
                *messages
            ]

        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }

        if max_tokens:
            payload["max_tokens"] = max_tokens

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            response = await self._post_with_retry(
                client,
                f"{self.base_url}/chat/completions",
                json=payload,
                headers=headers,
            )
            data = response.json()
            if usage_out is not None:
                usage = data.get("usage")
                if usage:
                    usage_out.append(usage)
            return data.get("choices", [{}])[0].get("message", {}).get("content", "")

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
        Send chat messages with tools and get a complete response.

        Returns:
            The full message dict (content + optional tool_calls)
        """
        model = self._resolve_model(model)

        if system_prompt:
            messages = [
                {"role": "system", "content": system_prompt},
                *messages
            ]

        payload = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "tools": tools,
            "tool_choice": tool_choice,
        }

        if max_tokens:
            payload["max_tokens"] = max_tokens

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            response = await self._post_with_retry(
                client,
                f"{self.base_url}/chat/completions",
                json=payload,
                headers=headers,
            )
            data = response.json()
            msg = data.get("choices", [{}])[0].get("message", {})
            usage = data.get("usage")
            if usage:
                msg["_usage"] = usage
            return msg

    async def chat_with_vision(
        self,
        image_bytes: bytes,
        mime_type: str,
        prompt: str,
        vision_model: str | None = None,
        max_tokens: int = 1500,
        api_key_override: str | None = None,
        usage_out: list | None = None,
    ) -> str:
        """Analyze an image using a vision-capable model.

        Args:
            image_bytes: Raw image bytes (PNG, JPEG, etc.)
            mime_type: MIME type of the image (e.g. "image/png")
            prompt: Text prompt describing what to analyze
            vision_model: Vision-capable model name (overrides default)
            max_tokens: Maximum tokens in response

        Returns:
            The model's description/analysis of the image
        """
        b64_data = base64.b64encode(image_bytes).decode("utf-8")
        data_url = f"data:{mime_type};base64,{b64_data}"

        model = vision_model or self.default_model

        payload = {
            "model": model,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            }],
            "max_tokens": max_tokens,
        }

        effective_key = api_key_override or self.api_key
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=10.0)) as client:
            headers = {
                "Authorization": f"Bearer {effective_key}",
                "Content-Type": "application/json",
            }
            response = await self._post_with_retry(
                client,
                f"{self.base_url}/chat/completions",
                json=payload,
                headers=headers,
            )
            data = response.json()
            if usage_out is not None:
                usage = data.get("usage")
                if usage:
                    usage_out.append(usage)
            return data.get("choices", [{}])[0].get("message", {}).get("content", "")

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
        model = self._resolve_model(model)

        # Add system message if provided
        if system_prompt:
            messages = [
                {"role": "system", "content": system_prompt},
                *messages
            ]

        payload = {
            "model": model,
            "messages": messages,
            "stream": True,
            "temperature": temperature,
            "stream_options": {"include_usage": True},
        }

        if max_tokens:
            payload["max_tokens"] = max_tokens

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            async with client.stream(
                "POST",
                f"{self.base_url}/chat/completions",
                json=payload,
                headers=headers,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]  # Remove "data: " prefix
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            # Capture usage from final chunk
                            if usage_out is not None:
                                usage = data.get("usage")
                                if usage:
                                    usage_out.append(usage)
                            choices = data.get("choices", [])
                            if not choices:
                                continue
                            delta = choices[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield content
                        except json.JSONDecodeError:
                            pass
