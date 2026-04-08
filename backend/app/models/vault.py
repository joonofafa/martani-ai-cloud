import uuid
from datetime import datetime
from sqlalchemy import String, BigInteger, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID

from ..core.database import Base


class CredentialVault(Base):
    __tablename__ = "credential_vault"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )

    site_name: Mapped[str] = mapped_column(String(500))
    username: Mapped[str] = mapped_column(Text)  # AES256 encrypted
    password: Mapped[str] = mapped_column(Text)  # AES256 encrypted
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)  # AES256 encrypted

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<CredentialVault {self.site_name}>"


class FileVault(Base):
    __tablename__ = "file_vault"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )

    original_filename: Mapped[str] = mapped_column(String(255))
    original_mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    original_size: Mapped[int] = mapped_column(BigInteger)
    original_folder: Mapped[str] = mapped_column(String(500))
    encrypted_storage_path: Mapped[str] = mapped_column(String(500))
    encrypted_size: Mapped[int] = mapped_column(BigInteger)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )

    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<FileVault {self.original_filename}>"


class ApiKeyVault(Base):
    __tablename__ = "api_key_vault"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )

    site_name: Mapped[str] = mapped_column(String(500))
    api_key: Mapped[str] = mapped_column(Text)  # AES256 encrypted
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user: Mapped["User"] = relationship("User")

    def __repr__(self) -> str:
        return f"<ApiKeyVault {self.site_name}>"


from .user import User
