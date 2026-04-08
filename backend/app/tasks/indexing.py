"""Celery tasks for file indexing."""

import asyncio
import logging
from datetime import datetime

from celery.exceptions import SoftTimeLimitExceeded
from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)

# Time limits (seconds)
INDEX_SOFT_LIMIT = 540   # 9 min — raises SoftTimeLimitExceeded
INDEX_HARD_LIMIT = 600   # 10 min — SIGKILL (last resort)
AUDIO_SOFT_LIMIT = 600   # 10 min — audio transcription is slower
AUDIO_HARD_LIMIT = 660   # 11 min


def _run_async(coro):
    """Run an async coroutine in a sync context (Celery worker)."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


async def _index_file_async(file_id: str, task=None):
    """Core indexing logic shared by text/image/video tasks."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
    from app.models.file import File, IndexStatus
    from app.models.embedding import DocumentEmbedding
    from app.services.document.parser_service import get_document_parser
    from app.services.storage.minio_service import get_minio_service
    from app.services.ai.embedding_service import EmbeddingService
    from app.core.settings_manager import load_settings_from_db
    from app.core.database import create_task_engine

    engine = create_task_engine()
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with session_factory() as db:
            try:
                # Load file
                result = await db.execute(select(File).where(File.id == file_id))
                file = result.scalar_one_or_none()
                if not file:
                    raise ValueError(f"File {file_id} not found")

                # Update status → processing
                file.index_status = IndexStatus.processing
                file.index_progress = 0
                file.index_error = None
                await db.commit()

                # Load runtime settings from DB
                db_settings = await load_settings_from_db(db)

                # Download from MinIO
                minio = get_minio_service()
                content = minio.download_file(file.storage_path)

                parser = get_document_parser()
                mime = file.mime_type or ""
                category = parser.get_file_category(mime)

                # Skip non-indexable files (folders, etc.)
                if category is None:
                    file.index_status = IndexStatus.completed
                    file.index_progress = 100
                    file.index_error = f"Skipped: unsupported type ({mime})"
                    await db.commit()
                    return {"status": "skipped", "file_id": str(file_id), "reason": f"unsupported type: {mime}"}

                # Parse based on category
                doc_type = parser.SUPPORTED_TYPES.get(mime, "")
                sections = None  # list[str|None] or None

                if doc_type == "spreadsheet":
                    chunk_pairs = parser.parse_and_chunk(content, mime)
                    chunks = [t for t, _ in chunk_pairs]
                    sections = [s for _, s in chunk_pairs]
                elif category == "text":
                    text = parser.parse(content, mime)
                    chunks = parser.chunk_text(text)
                elif category == "image":
                    from app.services.document.image_parser import ImageParser
                    from app.services.ai.token_accounting import record_usage
                    img_usage: list = []
                    img_parser = ImageParser(db_settings)
                    text = await img_parser.parse(content, mime, usage_out=img_usage)
                    chunks = parser.chunk_text(text)
                    # Record vision API token usage
                    img_input = sum(u.get("prompt_tokens", 0) for u in img_usage)
                    img_output = sum(u.get("completion_tokens", 0) for u in img_usage)
                    if img_input or img_output:
                        await record_usage(db, file.user_id, img_input, img_output, source="vision")
                elif category == "video":
                    from app.services.document.video_parser import VideoParser
                    vid_parser = VideoParser()
                    text = vid_parser.parse(content, mime)
                    chunks = parser.chunk_text(text)
                else:
                    raise ValueError(f"Unsupported category for indexing: {category}")

                # Update progress
                file.index_progress = 30
                await db.commit()

                if not chunks:
                    raise ValueError("No text content extracted from file")

                # Generate embeddings
                embedding_service = EmbeddingService(db_settings)

                # Delete existing embeddings
                await db.execute(
                    DocumentEmbedding.__table__.delete().where(
                        DocumentEmbedding.file_id == file_id
                    )
                )

                total_chunks = len(chunks)
                batch_size = 10
                all_embeddings = []

                for i in range(0, total_chunks, batch_size):
                    batch = chunks[i:i + batch_size]
                    batch_embeddings = await embedding_service.embed_texts(batch)
                    all_embeddings.extend(batch_embeddings)

                    # Update progress (30% → 90%)
                    progress = 30 + int(60 * min(i + batch_size, total_chunks) / total_chunks)
                    file.index_progress = progress
                    await db.commit()

                    if task:
                        task.update_state(state="PROGRESS", meta={"progress": progress})

                # Store embeddings
                for i, (chunk, embedding) in enumerate(zip(chunks, all_embeddings)):
                    doc_embedding = DocumentEmbedding(
                        file_id=file.id,
                        chunk_index=i,
                        chunk_text=chunk,
                        embedding=embedding,
                        section=sections[i] if sections else None,
                    )
                    db.add(doc_embedding)

                # Mark completed
                file.is_indexed = True
                file.index_status = IndexStatus.completed
                file.index_progress = 100
                file.indexed_at = datetime.utcnow()
                file.index_error = None
                await db.commit()

                return {"status": "completed", "file_id": str(file_id), "chunks": total_chunks}

            except SoftTimeLimitExceeded:
                logger.warning("index_file_task timed out for file_id=%s", file_id)
                try:
                    result = await db.execute(select(File).where(File.id == file_id))
                    file = result.scalar_one_or_none()
                    if file:
                        file.index_status = IndexStatus.failed
                        file.index_error = "Timeout: indexing took too long"
                        file.index_progress = 0
                        await db.commit()
                except Exception:
                    pass
                return {"status": "failed", "file_id": str(file_id), "reason": "timeout"}

            except Exception as e:
                # Mark failed
                try:
                    result = await db.execute(select(File).where(File.id == file_id))
                    file = result.scalar_one_or_none()
                    if file:
                        file.index_status = IndexStatus.failed
                        file.index_error = str(e)
                        file.index_progress = 0
                        await db.commit()
                except Exception:
                    pass
                raise
    finally:
        await engine.dispose()


async def _submit_audio_batch_async(file_id: str):
    """Submit audio file to Fireworks Batch API for transcription."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
    from app.models.file import File, IndexStatus
    from app.services.document.audio_parser import AudioParser
    from app.services.storage.minio_service import get_minio_service
    from app.core.database import create_task_engine

    engine = create_task_engine()
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with session_factory() as db:
            try:
                result = await db.execute(select(File).where(File.id == file_id))
                file = result.scalar_one_or_none()
                if not file:
                    raise ValueError(f"File {file_id} not found")

                file.index_status = IndexStatus.processing
                file.index_progress = 10
                file.index_error = None
                await db.commit()

                # Download from MinIO
                minio = get_minio_service()
                content = minio.download_file(file.storage_path)

                # Submit to batch API
                audio_parser = AudioParser()
                batch_id = audio_parser.submit_batch(content, file.mime_type, custom_id=str(file.id))

                file.batch_job_id = batch_id
                file.index_progress = 20
                await db.commit()

                logger.info("Audio batch submitted: file_id=%s, batch_id=%s", file_id, batch_id)
                return {"status": "submitted", "file_id": str(file_id), "batch_id": batch_id}

            except Exception as e:
                try:
                    result = await db.execute(select(File).where(File.id == file_id))
                    file = result.scalar_one_or_none()
                    if file:
                        file.index_status = IndexStatus.failed
                        file.index_error = f"Batch submit failed: {e}"
                        file.index_progress = 0
                        file.batch_job_id = None
                        await db.commit()
                except Exception:
                    pass
                raise
    finally:
        await engine.dispose()


async def _check_audio_batch_jobs_async():
    """Poll all pending audio batch jobs and complete indexing for finished ones."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
    from app.models.file import File, IndexStatus
    from app.models.embedding import DocumentEmbedding
    from app.services.document.parser_service import get_document_parser
    from app.services.document.audio_parser import AudioParser
    from app.services.ai.embedding_service import EmbeddingService
    from app.services.ai.token_accounting import record_usage, estimate_audio_tokens
    from app.core.settings_manager import load_settings_from_db
    from app.core.database import create_task_engine

    engine = create_task_engine()
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    audio_parser = AudioParser()

    try:
        async with session_factory() as db:
            # Find all files with batch_job_id that are still processing
            result = await db.execute(
                select(File).where(
                    File.index_status == IndexStatus.processing,
                    File.batch_job_id.isnot(None),
                )
            )
            files = result.scalars().all()

            if not files:
                return {"checked": 0, "completed": 0}

            completed_count = 0
            for file in files:
                try:
                    status, text = audio_parser.poll_batch(file.batch_job_id)

                    if status == "completed" and text:
                        # Chunk and embed
                        parser = get_document_parser()
                        full_text = f"Audio Transcription:\n{text}"
                        chunks = parser.chunk_text(full_text)

                        if not chunks:
                            file.index_status = IndexStatus.failed
                            file.index_error = "No text from audio transcription"
                            file.batch_job_id = None
                            await db.commit()
                            continue

                        file.index_progress = 50
                        await db.commit()

                        db_settings = await load_settings_from_db(db)
                        embedding_service = EmbeddingService(db_settings)

                        await db.execute(
                            DocumentEmbedding.__table__.delete().where(
                                DocumentEmbedding.file_id == file.id
                            )
                        )

                        total_chunks = len(chunks)
                        batch_size = 10
                        all_embeddings = []

                        for i in range(0, total_chunks, batch_size):
                            batch = chunks[i:i + batch_size]
                            batch_embeddings = await embedding_service.embed_texts(batch)
                            all_embeddings.extend(batch_embeddings)

                            progress = 50 + int(40 * min(i + batch_size, total_chunks) / total_chunks)
                            file.index_progress = progress
                            await db.commit()

                        for i, (chunk, embedding) in enumerate(zip(chunks, all_embeddings)):
                            db.add(DocumentEmbedding(
                                file_id=file.id,
                                chunk_index=i,
                                chunk_text=chunk,
                                embedding=embedding,
                            ))

                        # Estimate audio duration from file size (m4a ~64kbps)
                        duration_sec = file.size * 8 / 64000
                        audio_tokens = estimate_audio_tokens(duration_sec)
                        await record_usage(db, file.user_id, audio_tokens, 0, source="audio")

                        file.is_indexed = True
                        file.index_status = IndexStatus.completed
                        file.index_progress = 100
                        file.indexed_at = datetime.utcnow()
                        file.index_error = None
                        file.batch_job_id = None
                        await db.commit()

                        completed_count += 1
                        logger.info("Audio batch completed: file_id=%s, chunks=%d", file.id, total_chunks)

                    elif status == "error":
                        file.index_status = IndexStatus.failed
                        file.index_error = "Batch processing error"
                        file.batch_job_id = None
                        await db.commit()

                    # else: still processing, skip

                except Exception as e:
                    logger.error("Error processing batch result for file %s: %s", file.id, e)
                    try:
                        file.index_status = IndexStatus.failed
                        file.index_error = f"Batch completion error: {e}"
                        file.batch_job_id = None
                        await db.commit()
                    except Exception:
                        pass

            return {"checked": len(files), "completed": completed_count}
    finally:
        await engine.dispose()


@celery_app.task(
    bind=True,
    name="app.tasks.indexing.index_file_task",
    soft_time_limit=INDEX_SOFT_LIMIT,
    time_limit=INDEX_HARD_LIMIT,
)
def index_file_task(self, file_id: str):
    """Celery task: index text/image/video files (general worker)."""
    return _run_async(_index_file_async(file_id, task=self))


@celery_app.task(
    bind=True,
    name="app.tasks.indexing.index_audio_file_task",
    soft_time_limit=60,
    time_limit=120,
)
def index_audio_file_task(self, file_id: str):
    """Celery task: submit audio file to Fireworks Batch API."""
    return _run_async(_submit_audio_batch_async(file_id))


@celery_app.task(
    name="app.tasks.indexing.check_audio_batch_jobs_task",
    soft_time_limit=300,
    time_limit=360,
)
def check_audio_batch_jobs_task():
    """Celery beat task: poll Fireworks batch jobs and complete audio indexing."""
    return _run_async(_check_audio_batch_jobs_async())


@celery_app.task(name="app.tasks.indexing.schedule_pending_indexing_task")
def schedule_pending_indexing_task():
    """Periodic task: find pending files and dispatch indexing (runs every 5 min)."""
    return _run_async(_schedule_pending_indexing())


async def _schedule_pending_indexing():
    """Auto-dispatch pending files for indexing."""
    from datetime import timedelta
    from sqlalchemy import select, update
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
    from app.models.file import File, IndexStatus
    from app.services.document.parser_service import get_document_parser
    from app.core.database import create_task_engine

    parser = get_document_parser()

    engine = create_task_engine()
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with session_factory() as db:
            # 0. Auto-reset stuck "processing" files (>30 min) back to pending
            stuck_cutoff = datetime.utcnow() - timedelta(minutes=30)
            stuck_result = await db.execute(
                update(File)
                .where(
                    File.index_status == IndexStatus.processing,
                    File.updated_at < stuck_cutoff,
                    File.deleted_at.is_(None),
                )
                .values(
                    index_status=IndexStatus.pending,
                    index_progress=0,
                    index_error=None,
                    celery_task_id=None,
                )
            )
            stuck_count = stuck_result.rowcount
            if stuck_count:
                await db.commit()
                logger.warning("Auto-reset %d stuck processing files to pending", stuck_count)

            # 1. Bulk-skip non-indexable types
            skip_types = list(parser.SKIP_TYPES)
            if skip_types:
                await db.execute(
                    update(File)
                    .where(
                        File.index_status == IndexStatus.pending,
                        File.deleted_at.is_(None),
                        File.mime_type.in_(skip_types),
                    )
                    .values(
                        index_status=IndexStatus.completed,
                        index_progress=100,
                        index_error="Skipped: non-indexable file type",
                    )
                )
                await db.commit()

            # 2. Fetch pending files with supported MIME types (batch of 200)
            supported_types = list(parser.SUPPORTED_TYPES.keys())
            result = await db.execute(
                select(File.id, File.mime_type)
                .where(
                    File.index_status == IndexStatus.pending,
                    File.deleted_at.is_(None),
                    File.mime_type.in_(supported_types),
                )
                .limit(200)
            )
            pending_files = result.all()

            dispatched = 0
            for file_row in pending_files:
                fid, mime = str(file_row.id), file_row.mime_type or ""
                category = parser.get_file_category(mime)

                if category == "audio":
                    index_audio_file_task.delay(fid)
                elif category is not None:
                    index_file_task.delay(fid)
                else:
                    continue
                dispatched += 1
    finally:
        await engine.dispose()

    return {"dispatched": dispatched, "total_pending_checked": len(pending_files)}
