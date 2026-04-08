import io
import uuid
from datetime import timedelta
from minio import Minio
from minio.error import S3Error
from fastapi import UploadFile, HTTPException, status

from ...core.config import get_settings

settings = get_settings()


class MinioService:
    def __init__(self):
        self.client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
        self.bucket = settings.minio_bucket
        self._ensure_bucket()

    def _ensure_bucket(self):
        """Ensure the bucket exists, create if not."""
        try:
            if not self.client.bucket_exists(self.bucket):
                self.client.make_bucket(self.bucket)
        except S3Error as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to initialize storage: {str(e)}",
            )

    async def upload_file(
        self,
        file: UploadFile,
        user_id: str,
        folder: str = "/",
    ) -> tuple[str, int]:
        """
        Upload a file to MinIO.
        Returns (storage_path, file_size)
        """
        # Generate unique filename
        file_ext = file.filename.split(".")[-1] if "." in file.filename else ""
        unique_filename = f"{uuid.uuid4()}.{file_ext}" if file_ext else str(uuid.uuid4())

        # Create storage path: user_id/folder/unique_filename
        folder = folder.strip("/")
        storage_path = f"{user_id}/{folder}/{unique_filename}" if folder else f"{user_id}/{unique_filename}"

        # Read with hard cap to avoid unbounded memory (DoS)
        max_size = settings.max_file_size
        chunks: list[bytes] = []
        total = 0
        chunk_size = 1024 * 1024  # 1 MiB
        while True:
            chunk = await file.read(chunk_size)
            if not chunk:
                break
            total += len(chunk)
            if total > max_size:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File exceeds maximum size of {max_size} bytes",
                )
            chunks.append(chunk)
        content = b"".join(chunks)
        file_size = len(content)

        # Upload to MinIO
        try:
            self.client.put_object(
                self.bucket,
                storage_path,
                io.BytesIO(content),
                file_size,
                content_type=file.content_type or "application/octet-stream",
            )
        except S3Error as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to upload file: {str(e)}",
            )

        return storage_path, file_size

    def download_file(self, storage_path: str) -> bytes:
        """Download a file from MinIO."""
        response = None
        try:
            response = self.client.get_object(self.bucket, storage_path)
            return response.read()
        except S3Error as e:
            if e.code == "NoSuchKey":
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="File not found",
                )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to download file: {str(e)}",
            )
        finally:
            if response is not None:
                response.close()
                response.release_conn()

    def delete_file(self, storage_path: str) -> bool:
        """Delete a file from MinIO."""
        try:
            self.client.remove_object(self.bucket, storage_path)
            return True
        except S3Error as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to delete file: {str(e)}",
            )

    def get_presigned_url(
        self,
        storage_path: str,
        expires: timedelta = timedelta(hours=1),
        use_public_endpoint: bool = False,
    ) -> str:
        """Get a presigned URL for file download.
        
        Args:
            storage_path: Path to the file in MinIO
            expires: Expiration time for the URL
            use_public_endpoint: If True, replace endpoint with minio_public_endpoint
        """
        try:
            url = self.client.presigned_get_object(
                self.bucket,
                storage_path,
                expires=expires,
            )
            
            # Replace internal endpoint with public endpoint for sharing
            if use_public_endpoint and settings.minio_public_endpoint:
                # Parse the URL and replace the host
                from urllib.parse import urlparse, urlunparse
                parsed = urlparse(url)
                public_parsed = urlparse(settings.minio_public_endpoint)
                
                # Reconstruct URL with public endpoint
                public_url = urlunparse((
                    public_parsed.scheme,
                    public_parsed.netloc,
                    parsed.path,
                    parsed.params,
                    parsed.query,
                    parsed.fragment,
                ))
                return public_url
            
            return url
        except S3Error as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to generate download URL: {str(e)}",
            )

    def get_file_stream(self, storage_path: str):
        """Get file as a stream for large files."""
        try:
            response = self.client.get_object(self.bucket, storage_path)
            return response
        except S3Error as e:
            if e.code == "NoSuchKey":
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="File not found",
                )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to stream file: {str(e)}",
            )

    def get_file_partial(self, storage_path: str, offset: int, length: int):
        """Get a partial file range from MinIO (for HTTP Range requests)."""
        try:
            response = self.client.get_object(
                self.bucket, storage_path, offset=offset, length=length,
            )
            return response
        except S3Error as e:
            if e.code == "NoSuchKey":
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="File not found",
                )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to read file range: {str(e)}",
            )

    def get_file_stat(self, storage_path: str):
        """Get file metadata (size, etag, etc.) from MinIO."""
        try:
            return self.client.stat_object(self.bucket, storage_path)
        except S3Error as e:
            if e.code == "NoSuchKey":
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="File not found",
                )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to stat file: {str(e)}",
            )


# Singleton instance
_minio_service: MinioService | None = None


def get_minio_service() -> MinioService:
    global _minio_service
    if _minio_service is None:
        _minio_service = MinioService()
    return _minio_service
