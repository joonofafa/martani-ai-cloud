"""Settings Manager - Load settings from database with fallback to environment variables."""

from typing import Any
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings as get_env_settings
from app.models.settings import SystemSettings, SettingsKeys


class DynamicSettings:
    """Runtime settings loaded from database with environment variable fallback."""

    def __init__(self):
        # Load environment variables as defaults
        env_settings = get_env_settings()

        # LLM Settings
        self.llm_provider = env_settings.llm_provider
        self.llm_endpoint = env_settings.ollama_url
        self.llm_api_key = ""
        self.llm_model = env_settings.ollama_model

        # OpenRouter Settings
        self.openrouter_api_key = env_settings.openrouter_api_key
        self.openrouter_model = env_settings.openrouter_model
        self.openrouter_vision_api_key = env_settings.openrouter_vision_api_key
        self.openrouter_vision_model = env_settings.openrouter_vision_model

        # Embedding Settings
        self.embedding_provider = env_settings.llm_provider
        self.embedding_endpoint = env_settings.ollama_url
        self.embedding_api_key = ""
        self.embedding_model = env_settings.embedding_model
        self.embedding_dimension = env_settings.embedding_dimension

        # Ollama
        self.ollama_url = env_settings.ollama_url
        self.ollama_model = env_settings.ollama_model

        # LLM Tools & System Prompt
        self.llm_system_prompt = ""
        self.llm_tools_config = ""

        # Multi-model collection pipeline defaults
        self.agent_orchestrator_model = ""  # falls back to openrouter_model
        self.agent_worker_model = "meta-llama/llama-3.1-8b-instruct"
        self.agent_parser_model = "anthropic/claude-3.5-haiku"


async def load_settings_from_db(db: AsyncSession) -> DynamicSettings:
    """
    Load settings from database and override environment variables.

    Priority:
    1. Database (SystemSettings table) - highest priority
    2. Environment variables - fallback
    """
    settings = DynamicSettings()

    try:
        # Fetch all settings from database
        result = await db.execute(select(SystemSettings))
        db_settings = result.scalars().all()

        # Create a dict for easy lookup
        settings_dict = {s.key: s.value for s in db_settings}

        # Override with database values if they exist
        if SettingsKeys.LLM_PROVIDER in settings_dict:
            settings.llm_provider = settings_dict[SettingsKeys.LLM_PROVIDER] or settings.llm_provider

        if SettingsKeys.LLM_ENDPOINT in settings_dict:
            settings.llm_endpoint = settings_dict[SettingsKeys.LLM_ENDPOINT] or settings.llm_endpoint

        if SettingsKeys.LLM_API_KEY in settings_dict:
            settings.llm_api_key = settings_dict[SettingsKeys.LLM_API_KEY] or settings.llm_api_key

        if SettingsKeys.LLM_MODEL in settings_dict:
            settings.llm_model = settings_dict[SettingsKeys.LLM_MODEL] or settings.llm_model

        # OpenRouter settings
        if SettingsKeys.OPENROUTER_API_KEY in settings_dict:
            settings.openrouter_api_key = settings_dict[SettingsKeys.OPENROUTER_API_KEY] or settings.openrouter_api_key

        if SettingsKeys.OPENROUTER_MODEL in settings_dict:
            settings.openrouter_model = settings_dict[SettingsKeys.OPENROUTER_MODEL] or settings.openrouter_model

        if SettingsKeys.OPENROUTER_VISION_API_KEY in settings_dict:
            settings.openrouter_vision_api_key = settings_dict[SettingsKeys.OPENROUTER_VISION_API_KEY] or settings.openrouter_vision_api_key

        if SettingsKeys.OPENROUTER_VISION_MODEL in settings_dict:
            settings.openrouter_vision_model = settings_dict[SettingsKeys.OPENROUTER_VISION_MODEL] or settings.openrouter_vision_model

        # Embedding settings
        if SettingsKeys.EMBEDDING_PROVIDER in settings_dict:
            settings.embedding_provider = settings_dict[SettingsKeys.EMBEDDING_PROVIDER] or settings.embedding_provider

        if SettingsKeys.EMBEDDING_ENDPOINT in settings_dict:
            settings.embedding_endpoint = settings_dict[SettingsKeys.EMBEDDING_ENDPOINT] or settings.embedding_endpoint

        if SettingsKeys.EMBEDDING_API_KEY in settings_dict:
            settings.embedding_api_key = settings_dict[SettingsKeys.EMBEDDING_API_KEY] or settings.embedding_api_key

        if SettingsKeys.EMBEDDING_MODEL in settings_dict:
            settings.embedding_model = settings_dict[SettingsKeys.EMBEDDING_MODEL] or settings.embedding_model

        if SettingsKeys.EMBEDDING_DIMENSION in settings_dict:
            dim_str = settings_dict[SettingsKeys.EMBEDDING_DIMENSION]
            if dim_str:
                try:
                    settings.embedding_dimension = int(dim_str)
                except ValueError:
                    pass  # Keep default

        # LLM Tools & System Prompt
        if SettingsKeys.LLM_SYSTEM_PROMPT in settings_dict:
            settings.llm_system_prompt = settings_dict[SettingsKeys.LLM_SYSTEM_PROMPT] or ""

        if SettingsKeys.LLM_TOOLS_CONFIG in settings_dict:
            settings.llm_tools_config = settings_dict[SettingsKeys.LLM_TOOLS_CONFIG] or ""

        # Multi-model collection pipeline
        if SettingsKeys.AGENT_ORCHESTRATOR_MODEL in settings_dict:
            settings.agent_orchestrator_model = settings_dict[SettingsKeys.AGENT_ORCHESTRATOR_MODEL] or settings.agent_orchestrator_model

        if SettingsKeys.AGENT_WORKER_MODEL in settings_dict:
            settings.agent_worker_model = settings_dict[SettingsKeys.AGENT_WORKER_MODEL] or settings.agent_worker_model

        if SettingsKeys.AGENT_PARSER_MODEL in settings_dict:
            settings.agent_parser_model = settings_dict[SettingsKeys.AGENT_PARSER_MODEL] or settings.agent_parser_model

    except Exception as e:
        # If database fails, use environment variables
        print(f"Warning: Failed to load settings from database: {e}")
        print("Using environment variable defaults")

    return settings


async def get_setting_value(db: AsyncSession, key: str, default: Any = None) -> Any:
    """Get a single setting value from database."""
    try:
        result = await db.execute(
            select(SystemSettings).where(SystemSettings.key == key)
        )
        setting = result.scalar_one_or_none()
        return setting.value if setting else default
    except Exception:
        return default
