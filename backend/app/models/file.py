import enum
import uuid
from datetime import datetime
from sqlalchemy import String, BigInteger, DateTime, ForeignKey, Boolean, Text, Integer, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from ..core.database import Base


class IndexStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    completed = "completed"
    failed = "failed"
    skipped = "skipped"


class File(Base):
    __tablename__ = "files"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )

    # File info
    filename: Mapped[str] = mapped_column(String(255))
    original_filename: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    size: Mapped[int] = mapped_column(BigInteger)

    # Storage path in MinIO
    storage_path: Mapped[str] = mapped_column(String(500))

    # Folder structure
    folder: Mapped[str] = mapped_column(String(500), default="/")

    # Processing status (legacy)
    is_indexed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    index_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    # New indexing status
    index_status: Mapped[IndexStatus] = mapped_column(
        SAEnum(IndexStatus, name="indexstatus"),
        default=IndexStatus.pending,
        server_default="pending",
    )
    index_progress: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    celery_task_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    batch_job_id: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # System folders (AI Workspace etc.) — cannot be deleted/renamed/moved
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="files")
    embeddings: Mapped[list["DocumentEmbedding"]] = relationship(
        "DocumentEmbedding", back_populates="file", cascade="all, delete-orphan"
    )
    shares: Mapped[list["FileShare"]] = relationship(
        "FileShare", back_populates="file", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<File {self.original_filename}>"


from .user import User
from .embedding import DocumentEmbedding
from .file_share import FileShare
