"""Indexing management endpoints."""

import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case, or_
from pydantic import BaseModel

from sqlalchemy import delete as sa_delete

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.file import File as FileModel, IndexStatus
from app.models.embedding import DocumentEmbedding
from app.models.index_category import IndexCategory, FileCategory
from app.services.document.parser_service import get_document_parser
from app.services.ai.embedding_service import EmbeddingService, get_embedding_service

router = APIRouter()


# ============== Schemas ==============

class IndexingStatsResponse(BaseModel):
    total: int
    indexed: int
    processing: int
    failed: int
    pending: int
    skipped: int = 0


class IndexingFileResponse(BaseModel):
    id: str
    original_filename: str
    mime_type: str | None
    size: int
    folder: str
    index_status: str
    index_progress: int
    index_error: str | None
    indexed_at: str | None
    created_at: str

    class Config:
        from_attributes = True


class SearchRequest(BaseModel):
    query: str
    limit: int = 10
    file_type: str | None = None


class SearchResultItem(BaseModel):
    file_id: str
    filename: str
    folder: str
    chunk_text: str
    similarity: float


class CategoryCreate(BaseModel):
    name: str
    color: str = "blue"


class CategoryUpdate(BaseModel):
    name: str | None = None
    color: str | None = None


class CategoryResponse(BaseModel):
    id: str
    name: str
    color: str
    file_count: int = 0
    created_at: str


class FileCategoryUpdate(BaseModel):
    category_ids: list[str]


class BulkFileCategoryUpdate(BaseModel):
    file_ids: list[str]
    category_ids: list[str]


# ============== Endpoints ==============

@router.get("/stats", response_model=IndexingStatsResponse)
async def get_indexing_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get indexing statistics for current user."""
    result = await db.execute(
        select(
            func.count(FileModel.id).label("total"),
            func.count(case((FileModel.index_status == IndexStatus.completed, 1))).label("indexed"),
            func.count(case((FileModel.index_status == IndexStatus.processing, 1))).label("processing"),
            func.count(case((FileModel.index_status == IndexStatus.failed, 1))).label("failed"),
            func.count(case((FileModel.index_status == IndexStatus.pending, 1))).label("pending"),
            func.count(case((FileModel.index_status == IndexStatus.skipped, 1))).label("skipped"),
        ).where(
            FileModel.user_id == current_user.id,
            FileModel.deleted_at.is_(None),
            FileModel.mime_type != "application/x-folder",
        )
    )
    row = result.one()
    return IndexingStatsResponse(
        total=row.total,
        indexed=row.indexed,
        processing=row.processing,
        failed=row.failed,
        pending=row.pending,
        skipped=row.skipped,
    )


@router.get("/files")
async def list_indexing_files(
    status_filter: str | None = Query(default=None, alias="status"),
    type_filter: str | None = Query(default=None, alias="type"),
    search: str | None = Query(default=None),
    category_id: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List files with indexing status, filters, and pagination."""
    parser = get_document_parser()
    query = select(FileModel).where(
        FileModel.user_id == current_user.id,
        FileModel.deleted_at.is_(None),
        FileModel.mime_type != "application/x-folder",
    )

    # Status filter
    if status_filter:
        try:
            idx_status = IndexStatus(status_filter)
            query = query.where(FileModel.index_status == idx_status)
        except ValueError:
            pass

    # Type filter (text/image/audio/video)
    if type_filter:
        mime_types = [
            mt for mt, dt in parser.SUPPORTED_TYPES.items()
            if parser.get_file_category(mt) == type_filter
        ]
        if mime_types:
            query = query.where(FileModel.mime_type.in_(mime_types))

    # Search by filename
    if search:
        query = query.where(FileModel.original_filename.ilike(f"%{search}%"))

    # Filter by category
    if category_id:
        cat_file_ids = select(FileCategory.file_id).where(
            FileCategory.category_id == uuid.UUID(category_id)
        )
        query = query.where(FileModel.id.in_(cat_file_ids))

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    # Paginate
    offset = (page - 1) * limit
    query = query.order_by(FileModel.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    files = result.scalars().all()

    items = []
    for f in files:
        items.append({
            "id": str(f.id),
            "original_filename": f.original_filename,
            "mime_type": f.mime_type,
            "size": f.size,
            "folder": f.folder,
            "index_status": f.index_status.value if isinstance(f.index_status, IndexStatus) else str(f.index_status),
            "index_progress": f.index_progress,
            "index_error": f.index_error,
            "indexed_at": f.indexed_at.isoformat() if f.indexed_at else None,
            "created_at": f.created_at.isoformat(),
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
    }


@router.post("/search")
async def semantic_search(
    request: SearchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    embedding_service: EmbeddingService = Depends(get_embedding_service),
):
    """Semantic search across indexed files."""
    try:
        query_embedding = await embedding_service.embed_text(request.query)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Embedding service error: {e}",
        )

    # Build base query with file join
    base = (
        select(
            DocumentEmbedding.file_id,
            DocumentEmbedding.chunk_text,
            DocumentEmbedding.embedding.cosine_distance(query_embedding).label("distance"),
            FileModel.original_filename,
            FileModel.folder,
        )
        .join(FileModel, DocumentEmbedding.file_id == FileModel.id)
        .where(
            FileModel.user_id == current_user.id,
            FileModel.deleted_at.is_(None),
        )
    )

    # Filter by file type
    if request.file_type:
        type_mime_map = {
            "text": ["text/%", "application/pdf",
                      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                      "application/msword", "application/vnd.ms-excel",
                      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
            "image": ["image/%"],
            "audio": ["audio/%"],
            "video": ["video/%"],
        }
        mime_patterns = type_mime_map.get(request.file_type, [])
        if mime_patterns:
            conditions = [FileModel.mime_type.like(p) for p in mime_patterns]
            base = base.where(or_(*conditions))

    # DISTINCT ON file_id: picks best (lowest distance) chunk per file
    inner = base.distinct(DocumentEmbedding.file_id).order_by(
        DocumentEmbedding.file_id, "distance"
    ).subquery()

    # Re-order by distance and apply limit
    search_query = select(inner).order_by(inner.c.distance).limit(request.limit)

    results = await db.execute(search_query)

    items = []
    for row in results:
        items.append(SearchResultItem(
            file_id=str(row.file_id),
            filename=row.original_filename,
            folder=row.folder,
            chunk_text=row.chunk_text[:300],
            similarity=round(1 - row.distance, 4),
        ))

    return {"results": items}


@router.post("/index-all")
async def index_all_pending(
    batch_size: int = Query(default=100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Dispatch indexing for all pending files that have supported MIME types.
    Non-indexable files (folders, zips, binaries) are auto-skipped.
    """
    from app.tasks.indexing import index_file_task, index_audio_file_task

    parser = get_document_parser()

    # First, bulk-skip non-indexable files
    skip_types = list(parser.SKIP_TYPES)
    if skip_types:
        await db.execute(
            FileModel.__table__.update()
            .where(
                FileModel.user_id == current_user.id,
                FileModel.deleted_at.is_(None),
                FileModel.index_status == IndexStatus.pending,
                FileModel.mime_type.in_(skip_types),
            )
            .values(
                index_status=IndexStatus.skipped,
                index_progress=0,
                index_error="Not indexable",
            )
        )
        await db.commit()

    # Fetch all remaining pending files with supported MIME types
    supported_types = list(parser.SUPPORTED_TYPES.keys())
    result = await db.execute(
        select(FileModel.id, FileModel.mime_type)
        .where(
            FileModel.user_id == current_user.id,
            FileModel.deleted_at.is_(None),
            FileModel.index_status == IndexStatus.pending,
            FileModel.mime_type.in_(supported_types),
        )
        .limit(batch_size)
    )
    pending_files = result.all()

    dispatched = 0
    skipped = 0
    for file_row in pending_files:
        fid, mime = str(file_row.id), file_row.mime_type or ""
        category = parser.get_file_category(mime)

        if category == "audio":
            task_result = index_audio_file_task.delay(fid)
        elif category is not None:
            task_result = index_file_task.delay(fid)
        else:
            skipped += 1
            continue

        dispatched += 1

    # Count remaining pending
    remaining_result = await db.execute(
        select(func.count(FileModel.id)).where(
            FileModel.user_id == current_user.id,
            FileModel.deleted_at.is_(None),
            FileModel.index_status == IndexStatus.pending,
        )
    )
    remaining = remaining_result.scalar()

    return {
        "dispatched": dispatched,
        "skipped": skipped,
        "remaining_pending": remaining,
        "message": f"Dispatched {dispatched} files for indexing. {remaining} still pending.",
    }


@router.post("/{file_id}/retry")
async def retry_indexing(
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retry indexing a failed file."""
    from app.tasks.indexing import index_file_task, index_audio_file_task

    result = await db.execute(
        select(FileModel).where(
            FileModel.id == file_id,
            FileModel.user_id == current_user.id,
            FileModel.deleted_at.is_(None),
        )
    )
    file = result.scalar_one_or_none()

    if not file:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )

    parser = get_document_parser()
    category = parser.get_file_category(file.mime_type or "")

    if category == "audio":
        task_result = index_audio_file_task.delay(str(file_id))
    else:
        task_result = index_file_task.delay(str(file_id))

    file.index_status = IndexStatus.pending
    file.index_error = None
    file.index_progress = 0
    file.celery_task_id = task_result.id
    await db.commit()

    return {
        "id": str(file.id),
        "index_status": "pending",
        "task_id": task_result.id,
        "message": "Indexing retry queued",
    }


# ============== Category Endpoints ==============

@router.get("/categories")
async def list_categories(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all categories with file counts."""
    result = await db.execute(
        select(
            IndexCategory,
            func.count(FileCategory.id).label("file_count"),
        )
        .outerjoin(FileCategory, FileCategory.category_id == IndexCategory.id)
        .where(IndexCategory.user_id == current_user.id)
        .group_by(IndexCategory.id)
        .order_by(IndexCategory.created_at)
    )
    rows = result.all()
    return [
        CategoryResponse(
            id=str(cat.id),
            name=cat.name,
            color=cat.color,
            file_count=count,
            created_at=cat.created_at.isoformat(),
        )
        for cat, count in rows
    ]


@router.post("/categories", status_code=status.HTTP_201_CREATED)
async def create_category(
    data: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new category."""
    cat = IndexCategory(
        user_id=current_user.id,
        name=data.name,
        color=data.color,
    )
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return CategoryResponse(
        id=str(cat.id),
        name=cat.name,
        color=cat.color,
        file_count=0,
        created_at=cat.created_at.isoformat(),
    )


@router.put("/categories/{category_id}")
async def update_category(
    category_id: uuid.UUID,
    data: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a category."""
    result = await db.execute(
        select(IndexCategory).where(
            IndexCategory.id == category_id,
            IndexCategory.user_id == current_user.id,
        )
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    if data.name is not None:
        cat.name = data.name
    if data.color is not None:
        cat.color = data.color
    await db.commit()

    # Get file count
    count_result = await db.execute(
        select(func.count()).select_from(FileCategory).where(
            FileCategory.category_id == category_id
        )
    )
    file_count = count_result.scalar() or 0

    return CategoryResponse(
        id=str(cat.id),
        name=cat.name,
        color=cat.color,
        file_count=file_count,
        created_at=cat.created_at.isoformat(),
    )


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a category (cascades to file_categories)."""
    result = await db.execute(
        select(IndexCategory).where(
            IndexCategory.id == category_id,
            IndexCategory.user_id == current_user.id,
        )
    )
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")

    await db.delete(cat)
    await db.commit()


async def _assert_categories_owned(
    db: AsyncSession,
    user_id,
    category_ids: list[str],
) -> None:
    if not category_ids:
        return
    cat_uuids = [uuid.UUID(cid) for cid in category_ids]
    cnt = await db.execute(
        select(func.count()).where(
            IndexCategory.id.in_(cat_uuids),
            IndexCategory.user_id == user_id,
        )
    )
    if cnt.scalar() != len(cat_uuids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or unauthorized category",
        )


@router.put("/files/bulk-categories")
async def bulk_set_file_categories(
    data: BulkFileCategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Set categories for multiple files at once (replaces existing assignments)."""
    file_uuids = [uuid.UUID(fid) for fid in data.file_ids]

    await _assert_categories_owned(db, current_user.id, data.category_ids)

    # Verify all files belong to user
    result = await db.execute(
        select(func.count()).where(
            FileModel.id.in_(file_uuids),
            FileModel.user_id == current_user.id,
            FileModel.deleted_at.is_(None),
        )
    )
    if result.scalar() != len(file_uuids):
        raise HTTPException(status_code=404, detail="Some files not found")

    # Remove existing assignments for all files
    await db.execute(
        sa_delete(FileCategory).where(FileCategory.file_id.in_(file_uuids))
    )

    # Add new assignments
    for fid in file_uuids:
        for cid in data.category_ids:
            db.add(FileCategory(file_id=fid, category_id=uuid.UUID(cid)))

    await db.commit()
    return {"status": "ok", "file_count": len(file_uuids), "category_count": len(data.category_ids)}


@router.put("/files/{file_id}/categories")
async def set_file_categories(
    file_id: uuid.UUID,
    data: FileCategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Set categories for a file (replaces existing assignments)."""
    # Verify file belongs to user
    file_result = await db.execute(
        select(FileModel).where(
            FileModel.id == file_id,
            FileModel.user_id == current_user.id,
            FileModel.deleted_at.is_(None),
        )
    )
    if not file_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="File not found")

    await _assert_categories_owned(db, current_user.id, data.category_ids)

    # Remove existing assignments
    await db.execute(
        sa_delete(FileCategory).where(FileCategory.file_id == file_id)
    )

    # Add new assignments
    for cid in data.category_ids:
        fc = FileCategory(
            file_id=file_id,
            category_id=uuid.UUID(cid),
        )
        db.add(fc)

    await db.commit()
    return {"status": "ok", "category_count": len(data.category_ids)}


@router.delete("/categories/{category_id}/files/{file_id}")
async def remove_file_from_category(
    category_id: uuid.UUID,
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove a file from a specific category."""
    # Verify category belongs to user
    cat_result = await db.execute(
        select(IndexCategory).where(
            IndexCategory.id == category_id,
            IndexCategory.user_id == current_user.id,
        )
    )
    if not cat_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Category not found")

    await db.execute(
        sa_delete(FileCategory).where(
            FileCategory.category_id == category_id,
            FileCategory.file_id == file_id,
        )
    )
    await db.commit()
    return {"status": "ok"}
