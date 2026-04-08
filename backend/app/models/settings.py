import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID

from ..core.database import Base


class SystemSettings(Base):
    """System-wide settings stored in database."""
    __tablename__ = "system_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    key: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_secret: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    def __repr__(self) -> str:
        return f"<SystemSettings {self.key}>"


# Default settings keys
class SettingsKeys:
    # LLM Settings
    LLM_PROVIDER = "llm_provider"  # ollama, openrouter
    LLM_ENDPOINT = "llm_endpoint"
    LLM_API_KEY = "llm_api_key"
    LLM_MODEL = "llm_model"

    # OpenRouter specific
    OPENROUTER_API_KEY = "openrouter_api_key"
    OPENROUTER_MODEL = "openrouter_model"
    OPENROUTER_VISION_API_KEY = "openrouter_vision_api_key"
    OPENROUTER_VISION_MODEL = "openrouter_vision_model"

    # Embedding Settings
    EMBEDDING_PROVIDER = "embedding_provider"
    EMBEDDING_ENDPOINT = "embedding_endpoint"
    EMBEDDING_API_KEY = "embedding_api_key"
    EMBEDDING_MODEL = "embedding_model"
    EMBEDDING_DIMENSION = "embedding_dimension"

    # LLM Tools & System Prompt
    LLM_SYSTEM_PROMPT = "llm_system_prompt"
    LLM_TOOLS_CONFIG = "llm_tools_config"

    # Per-agent prompts (falls back to agent_types.py default_prompt if not set)
    AGENT_PROMPT_FILE_MANAGER = "agent_prompt_file_manager"

    # Per-agent tools config (JSON, same format: {"file_read":true,...})
    AGENT_TOOLS_FILE_MANAGER = "agent_tools_file_manager"

    # Email
    RESEND_API_KEY = "resend_api_key"
    EMAIL_FROM_ADDRESS = "email_from_address"

    # System Settings
    DEFAULT_USER_QUOTA = "default_user_quota"  # in bytes (legacy)
    MAX_UPLOAD_SIZE = "max_upload_size"  # in bytes
    ALLOW_REGISTRATION = "allow_registration"

    # Per-tier quotas
    FREE_STORAGE_QUOTA = "free_storage_quota"     # bytes, default 1GB
    FREE_TOKEN_QUOTA = "free_token_quota"         # tokens/month, default 500K
    BASIC_STORAGE_QUOTA = "basic_storage_quota"   # bytes, default 10GB
    PRO_STORAGE_QUOTA = "pro_storage_quota"       # bytes, default 100GB
    BASIC_TOKEN_QUOTA = "basic_token_quota"       # tokens/month, default 5M
    PRO_TOKEN_QUOTA = "pro_token_quota"           # tokens/month, default 50M
    TOKEN_PRICE_PER_MILLION = "token_price_per_million"  # USD per 1M tokens

    # Multi-model collection pipeline
    AGENT_ORCHESTRATOR_MODEL = "agent_orchestrator_model"
    AGENT_WORKER_MODEL = "agent_worker_model"
    AGENT_PARSER_MODEL = "agent_parser_model"
