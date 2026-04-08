from pydantic import model_validator
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Application
    app_name: str = "Martani"
    debug: bool = False
    """development | production — production enforces non-default secrets and stricter webhook rules."""
    environment: str = "development"
    secret_key: str = "CHANGE_ME_IN_PRODUCTION"

    # Database
    database_url: str = "postgresql+asyncpg://martani:CHANGE_ME_DB_PASSWORD@localhost:5432/martani"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # MinIO
    minio_endpoint: str = "localhost:9000"
    minio_public_endpoint: str = "https://your-domain.example"
    minio_access_key: str = "CHANGE_ME_MINIO_ACCESS_KEY"
    minio_secret_key: str = "CHANGE_ME_MINIO_SECRET_KEY"
    minio_bucket: str = "martani-storage"
    minio_secure: bool = False

    # Ollama (legacy fallback)
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "zai-org/glm-4.7"

    # JWT
    jwt_secret: str = "CHANGE_ME_IN_PRODUCTION"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # Frontend
    frontend_url: str = "http://localhost:3001"

    # CORS (explicit lists; avoid "*" for methods/headers when credentials are used)
    cors_allow_methods: str = "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    cors_allow_headers: str = (
        "Authorization,Content-Type,Accept,X-Requested-With,X-CSRF-Token"
    )

    # File Upload
    max_file_size: int = 104857600  # 100MB
    allowed_extensions: str = "pdf,docx,doc,txt,md,csv,json,png,jpg,jpeg,gif,webp,svg,mp3,wav,ogg,flac,m4a,mp4,avi,mkv,webm"

    # Embedding
    embedding_model: str = "nomic-embed-text"
    embedding_dimension: int = 1024

    # LLM Provider (ollama or openrouter)
    llm_provider: str = "openrouter"

    # OpenRouter
    openrouter_api_key: str = ""
    openrouter_model: str = "openai/gpt-4o-mini"
    openrouter_vision_api_key: str = ""
    openrouter_vision_model: str = "google/gemini-2.5-flash"

    # Chat processing mode
    chat_use_celery: bool = False  # True: Celery background task, False: inline WS

    # Turnstile (Cloudflare CAPTCHA)
    turnstile_secret_key: str = ""  # empty = skip verification (dev)

    # Rate Limiting
    rate_limit_register: str = "3/minute"
    rate_limit_login: str = "10/minute"
    rate_limit_resend: str = "2/minute"
    rate_limit_public_share_download: str = "30/minute"

    # Login Lockout
    max_login_failures: int = 5
    login_lockout_minutes: int = 15

    @property
    def allowed_extensions_list(self) -> list[str]:
        return [ext.strip() for ext in self.allowed_extensions.split(",")]

    @property
    def cors_allow_methods_list(self) -> list[str]:
        return [m.strip() for m in self.cors_allow_methods.split(",") if m.strip()]

    @property
    def cors_allow_headers_list(self) -> list[str]:
        return [h.strip() for h in self.cors_allow_headers.split(",") if h.strip()]

    @model_validator(mode="after")
    def _reject_default_secrets_in_production(self) -> "Settings":
        env = (self.environment or "").lower()
        if env in ("production", "prod"):
            if not (self.jwt_secret or "").strip() or not (self.secret_key or "").strip():
                raise ValueError(
                    "environment=production requires JWT_SECRET and SECRET_KEY to be set and non-empty"
                )
            if self.jwt_secret == "CHANGE_ME_IN_PRODUCTION" or self.secret_key == "CHANGE_ME_IN_PRODUCTION":
                raise ValueError(
                    "environment=production requires JWT_SECRET and SECRET_KEY "
                    "to be set to non-default values (remove CHANGE_ME_IN_PRODUCTION)"
                )
        return self

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()
