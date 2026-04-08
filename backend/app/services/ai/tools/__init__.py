"""LLM Tool definitions and executor for function calling.

This package replaces the monolithic tools.py module.
Re-exports everything needed by external consumers.
"""

from app.services.ai.tools.schemas import TOOL_GROUPS, get_enabled_tools
from app.services.ai.tools.dispatcher import execute_tool
from app.services.ai.tools.web_tools import _web_search

# Schema arrays - re-export for backward compat
from app.services.ai.tools.schemas import (
    FILE_READ_TOOLS, FILE_READ_CONTENT_TOOLS, FILE_CREATE_TOOLS,
    FILE_DELETE_TOOLS, FILE_MOVE_TOOLS, FILE_SHARE_TOOLS, FILE_COMPRESS_TOOLS,
    FILE_SEARCH_NAME_TOOLS, FILE_SEARCH_CONTENT_TOOLS,
    NOTE_READ_TOOLS, NOTE_CREATE_TOOLS, NOTE_DELETE_TOOLS, NOTE_UPDATE_TOOLS, NOTE_SEARCH_TOOLS,
    MAIL_SEND_TOOLS, MAIL_MANAGE_TOOLS, MESSENGER_TOOLS,
    UTILITY_TOOLS, MEMORY_SAVE_TOOLS, MEMORY_READ_TOOLS,
    WEB_SEARCH_TOOLS, WEB_SCREENSHOT_TOOLS, WEB_INTERACTION_TOOLS, BROWSER_COOKIE_TOOLS,
    VAULT_CREDENTIALS_TOOLS, VAULT_FILES_TOOLS,
    PYTHON_EXEC_TOOLS, JAVASCRIPT_EXEC_TOOLS,
    COLLECTION_READ_TOOLS, COLLECTION_CREATE_TOOLS,
    SCHEDULE_READ_TOOLS, SCHEDULE_CREATE_TOOLS, SCHEDULE_MANAGE_TOOLS,
)

# Core utilities - re-export for backward compat
from app.services.ai.tools.core import (
    AGENT_FOLDER, _agent_filename, _ensure_agent_folder, _human_size,
    get_tool_label,
)

__all__ = [
    # Primary exports (used by agent_executor.py, collection_pipeline.py)
    "get_enabled_tools",
    "execute_tool",
    "_web_search",
    "TOOL_GROUPS",
    # Core utilities
    "AGENT_FOLDER",
    "_agent_filename",
    "_ensure_agent_folder",
    "_human_size",
    "get_tool_label",
    # Schema arrays
    "FILE_READ_TOOLS", "FILE_READ_CONTENT_TOOLS", "FILE_CREATE_TOOLS",
    "FILE_DELETE_TOOLS", "FILE_MOVE_TOOLS", "FILE_SHARE_TOOLS", "FILE_COMPRESS_TOOLS",
    "FILE_SEARCH_NAME_TOOLS", "FILE_SEARCH_CONTENT_TOOLS",
    "NOTE_READ_TOOLS", "NOTE_CREATE_TOOLS", "NOTE_DELETE_TOOLS", "NOTE_UPDATE_TOOLS", "NOTE_SEARCH_TOOLS",
    "MAIL_SEND_TOOLS", "MAIL_MANAGE_TOOLS", "MESSENGER_TOOLS",
    "UTILITY_TOOLS", "MEMORY_SAVE_TOOLS", "MEMORY_READ_TOOLS",
    "WEB_SEARCH_TOOLS", "WEB_SCREENSHOT_TOOLS", "WEB_INTERACTION_TOOLS", "BROWSER_COOKIE_TOOLS",
    "VAULT_CREDENTIALS_TOOLS", "VAULT_FILES_TOOLS",
    "PYTHON_EXEC_TOOLS", "JAVASCRIPT_EXEC_TOOLS",
    "COLLECTION_READ_TOOLS", "COLLECTION_CREATE_TOOLS",
    "SCHEDULE_READ_TOOLS", "SCHEDULE_CREATE_TOOLS", "SCHEDULE_MANAGE_TOOLS",
]
