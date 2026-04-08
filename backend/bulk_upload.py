"""
Bulk upload script - Direct MinIO upload + DB sync

Usage (from outside Docker container):
  1. Prepare the directory with files to upload
  2. Run with the following command:

  docker run --rm -it \
    --network docker_martani-network \
    -v /path/to/source:/source:ro \
    -v $(pwd)/backend:/app \
    -w /app \
    python:3.12-slim \
    bash -c "pip install -q minio asyncpg sqlalchemy[asyncio] && python bulk_upload.py /source --folder /target_folder"

  Or from inside the backend container:
  docker exec martani-backend python bulk_upload.py /source --folder /target_folder

Examples:
  # Upload entire /home/user/documents folder to cloud root /
  docker cp /home/user/documents martani-backend:/tmp/upload_source
  docker exec martani-backend python bulk_upload.py /tmp/upload_source --folder /

  # Upload to a specific folder
  docker cp /home/user/photos martani-backend:/tmp/upload_source
  docker exec martani-backend python bulk_upload.py /tmp/upload_source --folder /photos
"""

import os
import sys
import uuid
import mimetypes
import argparse
import asyncio
from pathlib import Path
from datetime import datetime

from minio import Minio
from minio.error import S3Error

# DB imports
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, text


# Configuration (inside Docker)
MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.environ.get("MINIO_ACCESS_KEY", "CHANGE_ME_MINIO_ACCESS_KEY")
MINIO_SECRET_KEY = os.environ.get("MINIO_SECRET_KEY", "CHANGE_ME_MINIO_SECRET_KEY")
MINIO_BUCKET = os.environ.get("MINIO_BUCKET", "martani-storage")
MINIO_SECURE = os.environ.get("MINIO_SECURE", "false").lower() == "true"
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://cloudai:CHANGE_ME_DB_PASSWORD@postgres:5432/cloudai"
)


def get_minio_client():
    client = Minio(
        MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=MINIO_SECURE,
    )
    if not client.bucket_exists(MINIO_BUCKET):
        client.make_bucket(MINIO_BUCKET)
    return client


async def get_user_id(session: AsyncSession, email: str = None):
    """Get user ID by email or first user."""
    if email:
        result = await session.execute(
            text("SELECT id FROM users WHERE email = :email"),
            {"email": email}
        )
    else:
        result = await session.execute(
            text("SELECT id FROM users ORDER BY created_at LIMIT 1")
        )
    row = result.fetchone()
    if not row:
        print("ERROR: User not found")
        sys.exit(1)
    return row[0]


async def create_folder_if_needed(session: AsyncSession, user_id, folder_path: str):
    """Create DB folder records for each segment of the folder path."""
    if folder_path == "/":
        return

    parts = folder_path.strip("/").split("/")
    for i, part in enumerate(parts):
        parent = "/" if i == 0 else "/" + "/".join(parts[:i])

        # Check if already exists
        result = await session.execute(
            text("""
                SELECT id FROM files
                WHERE user_id = :user_id
                AND mime_type = 'application/x-folder'
                AND original_filename = :name
                AND folder = :parent
                AND deleted_at IS NULL
            """),
            {"user_id": user_id, "name": part, "parent": parent}
        )
        if result.fetchone():
            continue

        # Create folder record
        await session.execute(
            text("""
                INSERT INTO files (id, user_id, filename, original_filename, mime_type, size, storage_path, folder, is_indexed, created_at, updated_at)
                VALUES (:id, :user_id, '.folder', :name, 'application/x-folder', 0, '', :parent, false, :now, :now)
            """),
            {
                "id": uuid.uuid4(),
                "user_id": user_id,
                "name": part,
                "parent": parent,
                "now": datetime.utcnow(),
            }
        )
        await session.commit()
        print(f"  [folder created] {parent}/{part}")


async def bulk_upload(source_dir: str, target_folder: str, user_email: str = None, recursive: bool = True):
    source = Path(source_dir)
    if not source.exists():
        print(f"ERROR: Source directory not found: {source_dir}")
        sys.exit(1)

    # MinIO client
    minio_client = get_minio_client()

    # DB connection
    engine = create_async_engine(DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        user_id = await get_user_id(session, user_email)
        print(f"User ID: {user_id}")

        # Create target folder
        await create_folder_if_needed(session, user_id, target_folder)

        # Collect file list
        if recursive:
            files = [f for f in source.rglob("*") if f.is_file()]
        else:
            files = [f for f in source.iterdir() if f.is_file()]

        # Exclude hidden files
        files = [f for f in files if not any(p.startswith(".") for p in f.relative_to(source).parts)]

        total = len(files)
        print(f"\nStarting upload of {total} files\n")

        success = 0
        failed = 0

        for idx, filepath in enumerate(files, 1):
            rel_path = filepath.relative_to(source)
            filename = filepath.name
            file_size = filepath.stat().st_size

            # Calculate subfolder path
            if len(rel_path.parts) > 1:
                sub_folder = "/" + "/".join(rel_path.parts[:-1])
                full_folder = target_folder.rstrip("/") + sub_folder if target_folder != "/" else sub_folder
            else:
                full_folder = target_folder

            # Guess MIME type
            mime_type, _ = mimetypes.guess_type(str(filepath))
            mime_type = mime_type or "application/octet-stream"

            # Generate unique filename
            ext = filepath.suffix
            unique_name = f"{uuid.uuid4()}{ext}"

            # MinIO storage path
            folder_clean = full_folder.strip("/")
            if folder_clean:
                storage_path = f"{user_id}/{folder_clean}/{unique_name}"
            else:
                storage_path = f"{user_id}/{unique_name}"

            try:
                # Create subfolder in DB if needed
                if len(rel_path.parts) > 1:
                    await create_folder_if_needed(session, user_id, full_folder)

                # Upload to MinIO
                minio_client.fput_object(
                    MINIO_BUCKET,
                    storage_path,
                    str(filepath),
                    content_type=mime_type,
                )

                # Create file record in DB
                await session.execute(
                    text("""
                        INSERT INTO files (id, user_id, filename, original_filename, mime_type, size, storage_path, folder, is_indexed, created_at, updated_at)
                        VALUES (:id, :user_id, :filename, :original_filename, :mime_type, :size, :storage_path, :folder, false, :now, :now)
                    """),
                    {
                        "id": uuid.uuid4(),
                        "user_id": user_id,
                        "filename": unique_name,
                        "original_filename": filename,
                        "mime_type": mime_type,
                        "size": file_size,
                        "storage_path": storage_path,
                        "folder": full_folder,
                        "now": datetime.utcnow(),
                    }
                )
                await session.commit()

                # Update user storage usage
                await session.execute(
                    text("UPDATE users SET storage_used = storage_used + :size WHERE id = :user_id"),
                    {"size": file_size, "user_id": user_id}
                )
                await session.commit()

                success += 1
                print(f"  [{idx}/{total}] OK  {rel_path} ({file_size:,} bytes)")

            except Exception as e:
                failed += 1
                print(f"  [{idx}/{total}] ERR {rel_path} - {e}")

        print(f"\nDone: {success} succeeded, {failed} failed, {total} total")

    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Martani cloud bulk upload")
    parser.add_argument("source", help="Source directory path to upload")
    parser.add_argument("--folder", default="/", help="Target folder path (default: /)")
    parser.add_argument("--email", default=None, help="User email (default: first user)")
    parser.add_argument("--no-recursive", action="store_true", help="Ignore subdirectories")

    args = parser.parse_args()
    asyncio.run(bulk_upload(args.source, args.folder, args.email, not args.no_recursive))
