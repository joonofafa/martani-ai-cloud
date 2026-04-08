"""Embedding Service - Text to vector embeddings via Ollama."""

import httpx
from typing import Sequence
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.settings_manager import load_settings_from_db, DynamicSettings


class EmbeddingService:
    """Service for generating text embeddings using Ollama."""

    def __init__(self, settings: DynamicSettings | None = None):
        if settings is None:
            # Fallback to environment variables
            env_settings = get_settings()
            ollama_url = env_settings.ollama_url
            ollama_model = env_settings.embedding_model
            ollama_dim = env_settings.embedding_dimension
        else:
            # Use database settings
            ollama_url = settings.embedding_endpoint
            ollama_model = settings.embedding_model
            ollama_dim = settings.embedding_dimension

        self.base_url = ollama_url
        self.model = ollama_model
        self.dimension = ollama_dim
        self.timeout = httpx.Timeout(120.0, connect=10.0)

    async def embed_text(self, text: str) -> list[float]:
        """
        Generate embedding for a single text.

        Args:
            text: Text to embed

        Returns:
            Embedding vector as list of floats
        """
        result = await self.embed_texts([text])
        return result[0]

    async def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        """
        Generate embeddings for multiple texts using batch API.

        Args:
            texts: List of texts to embed

        Returns:
            List of embedding vectors
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/api/embed",
                json={
                    "model": self.model,
                    "input": list(texts),
                }
            )
            response.raise_for_status()
            data = response.json()
            return data.get("embeddings", [])

    async def embed_document_chunks(
        self,
        chunks: list[str],
        batch_size: int = 10,
    ) -> list[list[float]]:
        """
        Embed document chunks with batching for large documents.

        Args:
            chunks: List of text chunks
            batch_size: Number of chunks to process at once

        Returns:
            List of embedding vectors
        """
        all_embeddings = []

        for i in range(0, len(chunks), batch_size):
            batch = chunks[i:i + batch_size]
            batch_embeddings = await self.embed_texts(batch)
            all_embeddings.extend(batch_embeddings)

        return all_embeddings

    def get_dimension(self) -> int:
        """Get the embedding dimension for the current model."""
        return self.dimension


async def get_embedding_service(db: AsyncSession = Depends(get_db)) -> EmbeddingService:
    """
    Get embedding service with settings loaded from database.

    This is a FastAPI dependency that loads runtime settings from the database
    and creates an embedding service instance with those settings.
    """
    settings = await load_settings_from_db(db)
    return EmbeddingService(settings)
