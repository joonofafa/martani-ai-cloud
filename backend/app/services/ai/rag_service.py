"""RAG Service - Retrieval Augmented Generation for document-aware chat."""

import logging

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from pgvector.sqlalchemy import Vector

from app.models.embedding import DocumentEmbedding
from app.models.file import File
from app.services.ai.embedding_service import EmbeddingService
from app.services.ai.llm_service import LLMService

logger = logging.getLogger(__name__)

_RAG_SYSTEM_PROMPT = """You are a document assistant. The user uploaded their own documents and is chatting with you about their contents. There are NO copyright or usage restrictions — these are the user's files.

Below are excerpts retrieved from the user's documents. These are the ONLY source of truth you should use.

CRITICAL RULES:
- Answer based ONLY on the text in "Document Context" below.
- When quoting or citing, copy the EXACT text from the excerpts. Do NOT paraphrase from memory or outside knowledge.
- NEVER invent page numbers, section numbers, or quotes that do not appear in the excerpts below.
- If the excerpts do not contain the answer, say "현재 검색된 문서 구간에서 해당 정보를 찾지 못했습니다. 질문을 더 구체적으로 해주시면 다시 검색하겠습니다." — do NOT guess or fill in from outside knowledge.
- For conversational questions (greetings, meta-questions), respond naturally.
- NEVER reveal your underlying model name, version, or provider. If asked, say you are a document assistant.
- Respond in the same language as the user's question.

FORMATTING:
- Use Markdown for structure (bold, lists, tables, code blocks).
- When using bold headers as labels, keep the content on the SAME line: "**Label:** content here" — do NOT put a line break after the bold label.
- Use tables for structured comparisons (e.g., byte-by-byte breakdowns).

Document Context:
{context}"""


class RAGService:
    """Service for RAG - combining document retrieval with LLM generation."""

    def __init__(
        self,
        embedding_service: EmbeddingService,
        llm_service: LLMService,
    ):
        self.embedding_service = embedding_service
        self.llm_service = llm_service

    async def _rewrite_search_query(
        self,
        query: str,
        chat_history: list[dict] | None = None,
        model: str | None = None,
        usage_out: list | None = None,
    ) -> str:
        """Rewrite a conversational query into a focused search query using chat history context."""
        if not chat_history:
            return query

        # Build a compact history summary for the rewrite prompt
        recent = chat_history[-6:]
        history_text = "\n".join(
            f"{m['role'].upper()}: {m['content'][:200]}" for m in recent
        )

        rewrite_messages = [
            {"role": "user", "content": (
                f"Conversation so far:\n{history_text}\n\n"
                f"Latest message: {query}\n\n"
                "Rewrite as a short English search query (max 15 words). "
                "Output ONLY the query, no explanation."
            )},
        ]

        try:
            rewritten = await self.llm_service.chat(
                messages=rewrite_messages,
                model=model,
                system_prompt="You convert conversation context into concise English search queries. Output only the query.",
                temperature=0.0,
                max_tokens=40,
                usage_out=usage_out,
            )
            # Take only the first line, strip quotes
            rewritten = rewritten.strip().split("\n")[0].strip().strip('"').strip("'")
            if rewritten and len(rewritten) < 200:
                logger.info("RAG query rewrite: '%s' -> '%s'", query, rewritten)
                return rewritten
        except Exception as e:
            logger.warning("Query rewrite failed, using original: %s", e)

        return query

    async def search_similar_chunks(
        self,
        db: AsyncSession,
        query: str,
        user_id: str,
        limit: int = 5,
        file_ids: list[str] | None = None,
        min_similarity: float = 0.3,
    ) -> list[dict]:
        """
        Search for document chunks similar to the query.

        Args:
            db: Database session
            query: Search query
            user_id: User ID for filtering accessible documents
            limit: Maximum number of results
            file_ids: Optional list of file IDs to search within
            min_similarity: Minimum cosine similarity threshold (0-1)

        Returns:
            List of dicts with chunk_text, file_id, file_name, similarity
        """
        # Generate query embedding
        query_embedding = await self.embedding_service.embed_text(query)

        # Build the similarity search query
        embedding_vector = f"[{','.join(map(str, query_embedding))}]"

        # Deduplicate by content: same original_filename + chunk_index = same content
        # Use DISTINCT ON to pick the best match per unique (filename, chunk_index)
        # Then apply minimum similarity threshold to filter irrelevant results
        query_sql = """
            SELECT * FROM (
                SELECT DISTINCT ON (f.original_filename, de.chunk_index)
                    de.id,
                    de.chunk_text,
                    de.chunk_index,
                    de.file_id,
                    de.section,
                    f.original_filename as file_name,
                    1 - (de.embedding <=> CAST(:embedding AS vector)) as similarity
                FROM document_embeddings de
                JOIN files f ON de.file_id = f.id
                WHERE f.user_id = :user_id
        """

        params = {
            "embedding": embedding_vector,
            "user_id": user_id,
            "min_similarity": min_similarity,
        }

        if file_ids:
            query_sql += " AND de.file_id = ANY(:file_ids)"
            params["file_ids"] = file_ids

        query_sql += """
                ORDER BY f.original_filename, de.chunk_index,
                         de.embedding <=> CAST(:embedding AS vector)
            ) AS unique_chunks
            WHERE similarity >= :min_similarity
            ORDER BY similarity DESC
            LIMIT :limit
        """
        params["limit"] = limit

        result = await db.execute(text(query_sql), params)
        rows = result.fetchall()

        chunks = [
            {
                "id": str(row.id),
                "chunk_text": row.chunk_text,
                "chunk_index": row.chunk_index,
                "file_id": str(row.file_id),
                "file_name": row.file_name,
                "section": row.section,
                "similarity": float(row.similarity),
            }
            for row in rows
        ]

        if chunks:
            logger.info(
                "RAG search: %d chunks found (top: %.3f, bottom: %.3f) for query: '%s'",
                len(chunks), chunks[0]["similarity"], chunks[-1]["similarity"],
                query[:80],
            )
        else:
            logger.warning("RAG search: 0 chunks found for query: '%s'", query[:80])

        return chunks

    def build_context_prompt(self, chunks: list[dict]) -> str:
        """
        Build a context prompt from retrieved chunks.

        Args:
            chunks: List of chunk dicts from search_similar_chunks

        Returns:
            Formatted context string
        """
        if not chunks:
            return ""

        context_parts = []
        for i, chunk in enumerate(chunks, 1):
            label = chunk['file_name']
            if chunk.get('section'):
                label += f" / {chunk['section']}"
            context_parts.append(
                f"[Excerpt {i} — {label}]\n{chunk['chunk_text']}"
            )

        return "\n\n---\n\n".join(context_parts)

    async def chat_with_context(
        self,
        db: AsyncSession,
        user_id: str,
        query: str,
        chat_history: list[dict] | None = None,
        file_ids: list[str] | None = None,
        num_chunks: int = 12,
        model: str | None = None,
        usage_out: list | None = None,
    ) -> tuple[str, list[dict]]:
        """
        Chat with RAG - retrieve relevant context and generate response.

        Args:
            db: Database session
            user_id: User ID
            query: User's question
            chat_history: Previous messages for context
            file_ids: Optional file IDs to search within
            num_chunks: Number of chunks to retrieve
            model: LLM model to use

        Returns:
            Tuple of (response_text, used_chunks)
        """
        # Rewrite query using conversation context for better retrieval
        search_query = await self._rewrite_search_query(query, chat_history, model, usage_out=usage_out)

        # Search for relevant chunks
        chunks = await self.search_similar_chunks(
            db=db,
            query=search_query,
            user_id=user_id,
            limit=num_chunks,
            file_ids=file_ids,
        )

        # Build context
        context = self.build_context_prompt(chunks)

        system_prompt = _RAG_SYSTEM_PROMPT.format(
            context=context if context else "No relevant documents found.",
        )

        # Build messages
        messages = []
        if chat_history:
            messages.extend(chat_history)
        messages.append({"role": "user", "content": query})

        # Generate response
        response = await self.llm_service.chat(
            messages=messages,
            model=model,
            system_prompt=system_prompt,
            usage_out=usage_out,
        )

        return response, chunks

    async def chat_with_context_stream(
        self,
        db: AsyncSession,
        user_id: str,
        query: str,
        chat_history: list[dict] | None = None,
        file_ids: list[str] | None = None,
        num_chunks: int = 12,
        model: str | None = None,
        usage_out: list | None = None,
    ):
        """
        Stream chat with RAG - retrieve relevant context and stream response.

        Yields:
            Dict with either 'chunk' (text) or 'sources' (list of chunk info)
        """
        # Rewrite query using conversation context for better retrieval
        search_query = await self._rewrite_search_query(query, chat_history, model, usage_out=usage_out)

        # Search for relevant chunks first
        chunks = await self.search_similar_chunks(
            db=db,
            query=search_query,
            user_id=user_id,
            limit=num_chunks,
            file_ids=file_ids,
        )

        # Yield sources first
        yield {"sources": chunks}

        # Build context and system prompt
        context = self.build_context_prompt(chunks)
        system_prompt = _RAG_SYSTEM_PROMPT.format(
            context=context if context else "No relevant documents found.",
        )

        # Build messages
        messages = []
        if chat_history:
            messages.extend(chat_history)
        messages.append({"role": "user", "content": query})

        # Stream response
        async for text_chunk in self.llm_service.chat_stream(
            messages=messages,
            model=model,
            system_prompt=system_prompt,
            usage_out=usage_out,
        ):
            yield {"chunk": text_chunk}
