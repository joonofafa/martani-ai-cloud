import uuid
from datetime import date, datetime
from sqlalchemy import String, Boolean, BigInteger, Integer, Date, DateTime, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
import enum

from ..core.database import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    USER = "user"


class UserPlan(str, enum.Enum):
    BASIC = "basic"
    PRO = "pro"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[UserRole] = mapped_column(
        SQLEnum(UserRole, values_callable=lambda x: [e.value for e in x]),
        default=UserRole.USER
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Email verification
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verification_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verification_token_expires: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Terms agreement
    terms_agreed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Storage quota (bytes)
    storage_quota: Mapped[int] = mapped_column(
        BigInteger, default=1073741824  # 1GB (free tier)
    )
    storage_used: Mapped[int] = mapped_column(BigInteger, default=0)

    # Login lockout
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Plan & token tracking
    plan: Mapped[str] = mapped_column(String(20), default="free")
    token_quota: Mapped[int] = mapped_column(BigInteger, default=500_000)
    tokens_used_month: Mapped[int] = mapped_column(BigInteger, default=0)
    token_reset_date: Mapped[date] = mapped_column(Date, default=lambda: date.today().replace(day=1))

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    files: Mapped[list["File"]] = relationship(
        "File", back_populates="user", cascade="all, delete-orphan"
    )
    chat_sessions: Mapped[list["ChatSession"]] = relationship(
        "ChatSession", back_populates="user", cascade="all, delete-orphan"
    )
    sticky_notes: Mapped[list["StickyNote"]] = relationship(
        "StickyNote", back_populates="user", cascade="all, delete-orphan"
    )
    mails: Mapped[list["Mail"]] = relationship(
        "Mail", back_populates="user", cascade="all, delete-orphan"
    )
    agent_memories: Mapped[list["AgentMemory"]] = relationship(
        "AgentMemory", back_populates="user", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<User {self.email}>"


from .file import File
from .chat import ChatSession
from .note import StickyNote
from .mail import Mail
from .agent_memory import AgentMemory
