import uuid
from datetime import datetime
from sqlalchemy import Index, String, DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from ..core.database import Base


class IndexCategory(Base):
    __tablename__ = "index_categories"
    __table_args__ = (
        Index("ix_index_categories_user", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(100))
    color: Mapped[str] = mapped_column(String(20), default="blue")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )

    # Relationships
    file_categories: Mapped[list["FileCategory"]] = relationship(
        "FileCategory", back_populates="category", cascade="all, delete-orphan"
    )


class FileCategory(Base):
    __tablename__ = "file_categories"
    __table_args__ = (
        UniqueConstraint("file_id", "category_id", name="uq_file_category"),
        Index("ix_file_categories_category", "category_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    file_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("files.id", ondelete="CASCADE")
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("index_categories.id", ondelete="CASCADE")
    )

    # Relationships
    category: Mapped["IndexCategory"] = relationship(
        "IndexCategory", back_populates="file_categories"
    )
