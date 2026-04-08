"""Category tools — manage indexing categories for the AI agent."""

import json
import uuid
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import delete as sa_delete
from app.models.index_category import IndexCategory, FileCategory
from app.models.file import File as FileModel


async def _list_categories(user_id: uuid.UUID, db: AsyncSession) -> str:
    result = await db.execute(
        select(
            IndexCategory,
            func.count(FileCategory.id).label("file_count"),
        )
        .outerjoin(FileCategory, FileCategory.category_id == IndexCategory.id)
        .where(IndexCategory.user_id == user_id)
        .group_by(IndexCategory.id)
        .order_by(IndexCategory.created_at)
    )
    rows = result.all()
    categories = [
        {"id": str(cat.id), "name": cat.name, "color": cat.color, "file_count": count}
        for cat, count in rows
    ]
    return json.dumps({"success": True, "categories": categories, "count": len(categories)}, ensure_ascii=False)


async def _create_category(
    user_id: uuid.UUID, name: str, color: str, db: AsyncSession
) -> str:
    cat = IndexCategory(user_id=user_id, name=name, color=color)
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return json.dumps({
        "success": True,
        "message": f"Category '{name}' created.",
        "category": {"id": str(cat.id), "name": cat.name, "color": cat.color},
    }, ensure_ascii=False)


async def _delete_category(
    user_id: uuid.UUID, category_id: str, db: AsyncSession
) -> str:
    result = await db.execute(
        select(IndexCategory).where(
            IndexCategory.id == uuid.UUID(category_id),
            IndexCategory.user_id == user_id,
        )
    )
    cat = result.scalar_one_or_none()
    if not cat:
        return json.dumps({"success": False, "message": "Category not found."}, ensure_ascii=False)
    name = cat.name
    await db.delete(cat)
    await db.commit()
    return json.dumps({"success": True, "message": f"Category '{name}' deleted."}, ensure_ascii=False)


async def _assign_files_to_category(
    user_id: uuid.UUID, file_ids: list[str], category_id: str, db: AsyncSession
) -> str:
    # Verify category belongs to user
    cat_result = await db.execute(
        select(IndexCategory).where(
            IndexCategory.id == uuid.UUID(category_id),
            IndexCategory.user_id == user_id,
        )
    )
    cat = cat_result.scalar_one_or_none()
    if not cat:
        return json.dumps({"success": False, "message": "Category not found."}, ensure_ascii=False)

    file_uuids = [uuid.UUID(fid) for fid in file_ids]

    # Verify files belong to user
    result = await db.execute(
        select(func.count()).where(
            FileModel.id.in_(file_uuids),
            FileModel.user_id == user_id,
            FileModel.deleted_at.is_(None),
        )
    )
    found = result.scalar() or 0
    if found == 0:
        return json.dumps({"success": False, "message": "No matching files found."}, ensure_ascii=False)

    # Remove existing assignments for these files to this category, then add
    cat_uuid = uuid.UUID(category_id)
    await db.execute(
        sa_delete(FileCategory).where(
            FileCategory.file_id.in_(file_uuids),
            FileCategory.category_id == cat_uuid,
        )
    )
    for fid in file_uuids:
        db.add(FileCategory(file_id=fid, category_id=cat_uuid))

    await db.commit()
    return json.dumps({
        "success": True,
        "message": f"{found} file(s) assigned to category '{cat.name}'.",
    }, ensure_ascii=False)


async def _get_indexing_stats(user_id: uuid.UUID, db: AsyncSession) -> str:
    from app.models.file import IndexStatus
    result = await db.execute(
        select(FileModel.index_status, func.count(FileModel.id))
        .where(FileModel.user_id == user_id, FileModel.deleted_at.is_(None))
        .group_by(FileModel.index_status)
    )
    stats = {row[0].value if row[0] else "unknown": row[1] for row in result.all()}
    total = sum(stats.values())
    return json.dumps({
        "success": True,
        "total_files": total,
        "completed": stats.get("completed", 0),
        "pending": stats.get("pending", 0),
        "processing": stats.get("processing", 0),
        "failed": stats.get("failed", 0),
        "skipped": stats.get("skipped", 0),
    }, ensure_ascii=False)
