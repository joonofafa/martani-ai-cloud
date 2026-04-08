"""LLM Tool definitions and executor for function calling."""

import json
import re as _re
import uuid
from datetime import datetime, timedelta
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession



# Tool labels are now loaded from DB via tool_registry_service.
# Import for backward compatibility and WS usage.
from app.services.tool_registry_service import get_tool_label

from app.models.file import File


# ── Agent file naming convention ──

AGENT_FOLDER = "/AI Agent"

_FILENAME_UNSAFE_RE = _re.compile(r'[^\w가-힣\s.-]')


def _agent_filename(prompt: str, ext: str) -> str:
    """Generate agent filename: {prompt_15chars}_{YYmmddhhmmss}.{ext}"""
    clean = _FILENAME_UNSAFE_RE.sub('', prompt).strip()
    prefix = clean[:15].strip() or "AI_task"
    ts = datetime.now().strftime("%y%m%d%H%M%S")
    ext = ext.lstrip('.')
    return f"{prefix}_{ts}.{ext}"


async def _ensure_agent_folder(user_id: uuid.UUID, db: AsyncSession) -> None:
    """Create /AI Agent folder if it doesn't exist."""
    result = await db.execute(
        select(File).where(
            File.user_id == user_id,
            File.folder == "/",
            File.original_filename == "AI Agent",
            File.mime_type == "application/x-folder",
            File.deleted_at.is_(None),
        )
    )
    if not result.scalar_one_or_none():
        db.add(File(
            user_id=user_id,
            filename=".folder",
            original_filename="AI Agent",
            mime_type="application/x-folder",
            size=0,
            storage_path="",
            folder="/",
        ))
        await db.flush()
from app.models.note import StickyNote
from app.models.mail import Mail
from app.models.user import User
from app.models.agent_memory import AgentMemory


def _human_size(size_bytes: int) -> str:
    """Convert bytes to human-readable string."""
    if size_bytes >= 1024 * 1024 * 1024:
        return f"{size_bytes / 1024 / 1024 / 1024:.1f} GB"
    elif size_bytes >= 1024 * 1024:
        return f"{size_bytes / 1024 / 1024:.1f} MB"
    elif size_bytes >= 1024:
        return f"{size_bytes / 1024:.1f} KB"
    return f"{size_bytes} B"

# ─── Tool Schema Definitions (OpenAI format) ───

FILE_READ_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": "Lists the user's files. You can view files in a specific folder. Results must be shown to the user inside a ```filelist code block as a raw JSON array.",
            "parameters": {
                "type": "object",
                "properties": {
                    "folder": {
                        "type": "string",
                        "description": "Folder path to list (default: /)",
                        "default": "/",
                    }
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file_info",
            "description": "Retrieves detailed information about a specific file (name, size, type, etc.). Results must be shown to the user inside a ```fileinfo code block as raw JSON.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_id": {
                        "type": "string",
                        "description": "File ID (UUID)",
                    }
                },
                "required": ["file_id"],
            },
        },
    },
]

FILE_READ_CONTENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file_content",
            "description": "Reads the actual text content of a file. Supports text-based files such as PDF, DOCX, TXT, JSON, CSV, HTML, XML, etc. Does not support image/audio/video files. Large files may return only the beginning portion.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_id": {
                        "type": "string",
                        "description": "File ID to read (UUID)",
                    },
                    "max_length": {
                        "type": "integer",
                        "description": "Maximum characters to return (default: 8000)",
                        "default": 8000,
                    },
                },
                "required": ["file_id"],
            },
        },
    },
]

FILE_SEARCH_NAME_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_files_by_name",
            "description": "Searches files by name. Results must be shown to the user inside a ```filelist code block as a raw JSON array.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "File name keyword to search for",
                    }
                },
                "required": ["query"],
            },
        },
    },
]

FILE_SEARCH_CONTENT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_files_by_content",
            "description": "Searches indexed file contents by keyword. Results must be shown to the user inside a ```filelist code block as a raw JSON array.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Content keyword to search for",
                    }
                },
                "required": ["query"],
            },
        },
    },
]

FILE_CREATE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_text_file",
            "description": "Creates a new text file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "filename": {
                        "type": "string",
                        "description": "File name (e.g., notes.txt)",
                    },
                    "content": {
                        "type": "string",
                        "description": "File content",
                    },
                    "folder": {
                        "type": "string",
                        "description": "Folder path to save to (default: /)",
                        "default": "/",
                    },
                },
                "required": ["filename", "content"],
            },
        },
    },
]

FILE_DELETE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "delete_file",
            "description": "Deletes a file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_id": {
                        "type": "string",
                        "description": "File ID to delete (UUID)",
                    }
                },
                "required": ["file_id"],
            },
        },
    },
]

FILE_MOVE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "move_file",
            "description": "Moves a file to another folder. You must use the folder value from list_files results as the path. Use actual paths (/folder), not breadcrumb format (Home>Folder).",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_id": {
                        "type": "string",
                        "description": "File ID to move (UUID)",
                    },
                    "target_folder": {
                        "type": "string",
                        "description": "Actual path of the target folder. Must start with / and must not contain >. (e.g., /, /documents, /CSY/source)",
                    },
                },
                "required": ["file_id", "target_folder"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "move_files_batch",
            "description": "Moves multiple files to the same folder at once. Use this tool instead of individual move_file calls when sorting/organizing files.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of file IDs to move (UUID array)",
                    },
                    "target_folder": {
                        "type": "string",
                        "description": "Actual path of the target folder. Must start with / and must not contain >. (e.g., /, /documents, /CSY/source)",
                    },
                },
                "required": ["file_ids", "target_folder"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_folder",
            "description": "Creates a new folder. You must use the folder value from list_files results as the path. Use actual paths (/folder), not breadcrumb format (Home>Folder).",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Folder name (cannot contain slash /)",
                    },
                    "parent_folder": {
                        "type": "string",
                        "description": "Actual path of the parent folder. Must start with / and must not contain >. (e.g., /, /CSY)",
                        "default": "/",
                    },
                },
                "required": ["name"],
            },
        },
    },
]

FILE_SHARE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "share_file",
            "description": "Generates a public sharing link for a file. The link is valid for 7 days. Use this when attaching files to emails.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_id": {
                        "type": "string",
                        "description": "File ID to share (UUID)",
                    },
                },
                "required": ["file_id"],
            },
        },
    },
]

FILE_COMPRESS_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "compress_files",
            "description": "Compresses multiple files into a single ZIP file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of file IDs to compress (UUID array)",
                    },
                    "zip_name": {
                        "type": "string",
                        "description": "Name for the ZIP file to create (e.g., archive.zip)",
                        "default": "archive.zip",
                    },
                    "folder": {
                        "type": "string",
                        "description": "Folder path to save the ZIP file (default: /)",
                        "default": "/",
                    },
                },
                "required": ["file_ids"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "decompress_file",
            "description": "Extracts a ZIP file. A subfolder with the same name as the archive will be created, and files will be extracted into it.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_id": {
                        "type": "string",
                        "description": "ZIP file ID to extract (UUID)",
                    },
                },
                "required": ["file_id"],
            },
        },
    },
]

NOTE_READ_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_notes",
            "description": "Lists the user's notes.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_note",
            "description": "Reads the content of a specific note.",
            "parameters": {
                "type": "object",
                "properties": {
                    "note_id": {
                        "type": "string",
                        "description": "Note ID (UUID)",
                    }
                },
                "required": ["note_id"],
            },
        },
    },
]

NOTE_CREATE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_note",
            "description": "Creates a new note.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Note title",
                    },
                    "content": {
                        "type": "string",
                        "description": "Note content",
                    },
                    "color": {
                        "type": "string",
                        "description": "Note color (yellow, green, pink, blue, purple, orange, gray)",
                        "default": "yellow",
                    },
                },
                "required": ["title", "content"],
            },
        },
    },
]

NOTE_DELETE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "delete_note",
            "description": "Deletes a note.",
            "parameters": {
                "type": "object",
                "properties": {
                    "note_id": {
                        "type": "string",
                        "description": "Note ID to delete (UUID)",
                    }
                },
                "required": ["note_id"],
            },
        },
    },
]

NOTE_UPDATE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "update_note",
            "description": "Updates the title, content, or color of an existing note.",
            "parameters": {
                "type": "object",
                "properties": {
                    "note_id": {
                        "type": "string",
                        "description": "Note ID to update (UUID)",
                    },
                    "title": {
                        "type": "string",
                        "description": "New title (omit to keep unchanged)",
                    },
                    "content": {
                        "type": "string",
                        "description": "New content (omit to keep unchanged)",
                    },
                    "color": {
                        "type": "string",
                        "description": "New color (yellow, green, pink, blue, purple, orange, gray)",
                    },
                },
                "required": ["note_id"],
            },
        },
    },
]

NOTE_SEARCH_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_notes",
            "description": "Searches notes by keyword (searches both title and content).",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search keyword",
                    }
                },
                "required": ["query"],
            },
        },
    },
]

# ─── Mail Tool Definitions ───

MAIL_SEND_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "send_mail",
            "description": "Sends an email. Delivers to platform users, and for external email addresses, sends an actual email. Cloud files can be attached.",
            "parameters": {
                "type": "object",
                "properties": {
                    "to_email": {
                        "type": "string",
                        "description": "Recipient email address",
                    },
                    "subject": {
                        "type": "string",
                        "description": "Email subject",
                    },
                    "body": {
                        "type": "string",
                        "description": "Email body",
                    },
                    "file_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of cloud file IDs to attach (optional)",
                    },
                },
                "required": ["to_email", "subject", "body"],
            },
        },
    },
]

MESSENGER_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "send_talk_message",
            "description": "Sends a message to the user's messenger (톡). Use this to deliver results, notifications, or reports to the user's messenger chat.",
            "parameters": {
                "type": "object",
                "properties": {
                    "message": {
                        "type": "string",
                        "description": "Message content to send",
                    },
                },
                "required": ["message"],
            },
        },
    },
]

MAIL_MANAGE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "update_mail",
            "description": "Updates an email's read/starred status or moves it to a different folder.",
            "parameters": {
                "type": "object",
                "properties": {
                    "mail_id": {
                        "type": "string",
                        "description": "Mail ID (UUID)",
                    },
                    "is_read": {
                        "type": "boolean",
                        "description": "Mark as read",
                    },
                    "is_starred": {
                        "type": "boolean",
                        "description": "Mark as starred",
                    },
                    "folder": {
                        "type": "string",
                        "description": "Folder to move to (inbox, sent, draft, starred)",
                    },
                },
                "required": ["mail_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_mail",
            "description": "Deletes an email. Non-trash emails are moved to trash, while emails already in trash are permanently deleted.",
            "parameters": {
                "type": "object",
                "properties": {
                    "mail_id": {
                        "type": "string",
                        "description": "Mail ID to delete (UUID)",
                    },
                },
                "required": ["mail_id"],
            },
        },
    },
]

# ─── Utility Tool Definitions ───

UTILITY_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_current_time",
            "description": "Gets the current date and time. Use before creating events or performing date-related tasks.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
]

# ─── Agent Memory Tool Definitions ───

MEMORY_SAVE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "save_memory",
            "description": "Saves important information about the user to long-term memory. Remember preferences, habits, recurring request patterns, important facts, etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": "string",
                        "description": "Memory category (preference, habit, fact, instruction, contact)",
                        "enum": ["preference", "habit", "fact", "instruction", "contact"],
                    },
                    "key": {
                        "type": "string",
                        "description": "Key/title of the memory (e.g., 'favorite drink', 'commute time', 'team lead name')",
                    },
                    "content": {
                        "type": "string",
                        "description": "Detailed content to remember",
                    },
                },
                "required": ["category", "key", "content"],
            },
        },
    },
]

MEMORY_READ_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "recall_memory",
            "description": "Searches long-term memory by keyword to recall stored information.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search keyword (leave empty to list all memories)",
                        "default": "",
                    },
                    "category": {
                        "type": "string",
                        "description": "Search specific category only (omit for all)",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_memory",
            "description": "Deletes a specific memory from long-term storage.",
            "parameters": {
                "type": "object",
                "properties": {
                    "memory_id": {
                        "type": "string",
                        "description": "Memory ID to delete (UUID)",
                    },
                },
                "required": ["memory_id"],
            },
        },
    },
]

# ─── Web Search Tool Definitions ───

WEB_SEARCH_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Searches the internet for up-to-date information. Use when real-time information is needed such as weather, news, fact-checking, product details, etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search keywords",
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Maximum number of results (default: 5)",
                        "default": 5,
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_fetch",
            "description": "Fetches and extracts text content from a web page. Given a URL, returns the page's body text. Use for reading search result details, summarizing specific web pages, etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "Web page URL to fetch (https:// or http://)",
                    },
                    "max_length": {
                        "type": "integer",
                        "description": "Maximum text length to extract (default: 3000 chars)",
                        "default": 3000,
                    },
                },
                "required": ["url"],
            },
        },
    },
]

# ─── Web Screenshot Tool Definitions ───

WEB_SCREENSHOT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "web_screenshot",
            "description": "Captures a screenshot of a web page and saves it as an image file. Given a URL, renders the page and captures it as a PNG image.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "Web page URL to screenshot (https:// or http://)",
                    },
                    "filename": {
                        "type": "string",
                        "description": "File name to save as (default: screenshot.png)",
                    },
                    "folder": {
                        "type": "string",
                        "description": "Folder path to save to (default: /)",
                    },
                    "full_page": {
                        "type": "boolean",
                        "description": "Whether to capture the full page (default: false, true captures with scrolling)",
                    },
                },
                "required": ["url"],
            },
        },
    },
]

# ─── Web Interaction (Browser Automation) Tool Definitions ───

VAULT_CREDENTIALS_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_vault_credentials",
            "description": "Lists site credentials stored in the vault. Passwords are displayed masked. Pass credential_id to browser_login when logging in.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
]

VAULT_FILES_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_vault_files",
            "description": "Lists encrypted files backed up in the file vault. Shows file name, original size, original folder, and backup date.",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
]

WEB_INTERACTION_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "browser_navigate",
            "description": "Navigates the browser to a specified URL. Use to open a new page or navigate to a different page.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "URL to navigate to (https:// or http://)",
                    },
                    "wait_for": {
                        "type": "string",
                        "description": "Wait condition (load, domcontentloaded, networkidle)",
                        "default": "load",
                    },
                },
                "required": ["url"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_read_page",
            "description": "Reads the text content, URL, and title of the current browser page. Specify a CSS selector to read only a specific element. Use mode='interactive' to get a list of clickable/input elements instead of text content.",
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector of the element to read (omit for full page)",
                    },
                    "max_length": {
                        "type": "integer",
                        "description": "Maximum text length (default: 3000 chars)",
                        "default": 3000,
                    },
                    "mode": {
                        "type": "string",
                        "enum": ["text", "interactive"],
                        "description": "text: page content, interactive: clickable/input elements only",
                        "default": "text",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_click",
            "description": "Clicks an element on the browser page. Specify the element using a CSS selector or visible text. Automatically uses JS click fallback for hidden elements.",
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector of the element to click",
                    },
                    "text": {
                        "type": "string",
                        "description": "Visible text of the element to click (use instead of selector)",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_fill",
            "description": "Types text into an input field on the browser page.",
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector of the input field",
                    },
                    "value": {
                        "type": "string",
                        "description": "Text to type",
                    },
                    "clear_first": {
                        "type": "boolean",
                        "description": "Whether to clear existing content before typing (default: true)",
                        "default": True,
                    },
                },
                "required": ["selector", "value"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_select",
            "description": "Selects an option from a dropdown (select element) on the browser page.",
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector of the dropdown",
                    },
                    "value": {
                        "type": "string",
                        "description": "Value attribute of the option to select",
                    },
                    "label": {
                        "type": "string",
                        "description": "Visible text of the option to select (can be used instead of value)",
                    },
                },
                "required": ["selector"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_screenshot",
            "description": "Captures a screenshot of the current browser page and analyzes it with an AI vision model. Visually identifies page layout, UI elements, buttons, links, etc. Use when understanding page structure or when text alone is insufficient.",
            "parameters": {
                "type": "object",
                "properties": {
                    "filename": {
                        "type": "string",
                        "description": "File name to save as (default: screenshot.png)",
                        "default": "screenshot.png",
                    },
                    "full_page": {
                        "type": "boolean",
                        "description": "Whether to capture the full page (default: false)",
                        "default": False,
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_login",
            "description": "Automatically logs into a website using vault credentials. If MFA (2-factor auth) is required, prompts the user for a verification code. Check credentials with list_vault_credentials first.",
            "parameters": {
                "type": "object",
                "properties": {
                    "credential_id": {
                        "type": "string",
                        "description": "Vault credential ID (UUID). Get from list_vault_credentials results.",
                    },
                    "login_url": {
                        "type": "string",
                        "description": "Login page URL. If omitted, attempts login on the current browser page.",
                    },
                },
                "required": ["credential_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_scroll",
            "description": "Scrolls the page. Specify a direction/amount or scroll until a specific element is visible. Use to access off-screen content like comment sections or bottom menus.",
            "parameters": {
                "type": "object",
                "properties": {
                    "direction": {
                        "type": "string",
                        "description": "Scroll direction (up or down)",
                        "default": "down",
                    },
                    "amount": {
                        "type": "integer",
                        "description": "Scroll amount in pixels (default: 500)",
                        "default": 500,
                    },
                    "selector": {
                        "type": "string",
                        "description": "Scroll until this CSS selector's element is visible (overrides direction/amount)",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_execute_js",
            "description": "Executes JavaScript on the current page. Use for complex dynamic page manipulation or SPA interactions.",
            "parameters": {
                "type": "object",
                "properties": {
                    "script": {
                        "type": "string",
                        "description": "JavaScript code to execute",
                    },
                },
                "required": ["script"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_wait",
            "description": "Waits until a specific element appears. Use to find elements after AJAX loading. Also searches inside iframes.",
            "parameters": {
                "type": "object",
                "properties": {
                    "selector": {
                        "type": "string",
                        "description": "CSS selector of the element to wait for",
                    },
                    "timeout": {
                        "type": "integer",
                        "description": "Maximum wait time in milliseconds (default: 10000)",
                        "default": 10000,
                    },
                    "state": {
                        "type": "string",
                        "description": "State to wait for (visible, attached, hidden)",
                        "default": "visible",
                    },
                },
                "required": ["selector"],
            },
        },
    },
]

BROWSER_COOKIE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "browser_save_cookies",
            "description": "Saves the current browser session's cookies. Use to persist login sessions.",
            "parameters": {
                "type": "object",
                "properties": {
                    "domain": {
                        "type": "string",
                        "description": "Domain to save cookies for (e.g. '.naver.com')",
                    },
                    "label": {
                        "type": "string",
                        "description": "Name for the cookie set (e.g. 'Naver login')",
                    },
                },
                "required": ["domain"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_load_cookies",
            "description": "Loads saved cookies into the browser. Use before visiting a site to restore login sessions.",
            "parameters": {
                "type": "object",
                "properties": {
                    "domain": {
                        "type": "string",
                        "description": "Domain to load cookies for (e.g. '.naver.com')",
                    },
                },
                "required": ["domain"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_list_cookies",
            "description": "Lists saved cookie domains.",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_import_cookies",
            "description": "Saves user-provided cookie JSON. Use to import cookies exported from browser extensions.",
            "parameters": {
                "type": "object",
                "properties": {
                    "domain": {
                        "type": "string",
                        "description": "Cookie domain (e.g. '.naver.com')",
                    },
                    "label": {
                        "type": "string",
                        "description": "Cookie set name (e.g. 'Naver login')",
                    },
                    "cookies_json": {
                        "type": "string",
                        "description": "Cookie JSON array string",
                    },
                },
                "required": ["domain", "cookies_json"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "browser_delete_cookies",
            "description": "Deletes saved cookies. Use to remove cookies for a specific domain.",
            "parameters": {
                "type": "object",
                "properties": {
                    "domain": {
                        "type": "string",
                        "description": "Domain of cookies to delete (e.g. '.naver.com')",
                    },
                },
                "required": ["domain"],
            },
        },
    },
]

# ─── Python Execution Tool Definitions ───

PYTHON_EXEC_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "execute_python",
            "description": "Execute a Python code snippet. Use for data processing, text parsing, calculations, JSON transformation. The code runs in a sandboxed environment with access to standard library modules (json, re, math, datetime, collections, itertools, urllib.parse, csv, html). Print results to stdout. Max execution time: 10 seconds.",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {
                        "type": "string",
                        "description": "Python code to execute. Use print() to output results.",
                    },
                },
                "required": ["code"],
            },
        },
    },
]

JAVASCRIPT_EXEC_TOOLS = []

# ─── Collection Task Tool Definitions ───

COLLECTION_READ_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_collection_tasks",
            "description": "Lists the user's data collection tasks. Shows task name, status, schedule, run count, and last run info.",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_collection_results",
            "description": "Gets the most recent results from a data collection task. Returns parsed data from the latest runs.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {
                        "type": "string",
                        "description": "Collection task ID",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Max number of results to return (default: 10)",
                        "default": 10,
                    },
                },
                "required": ["task_id"],
            },
        },
    },
]

COLLECTION_CREATE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_collection_task",
            "description": "Creates a data collection task for structured web scraping. The system will design a schema, scrape target URLs, parse the data, and save results. Use this for price monitoring, catalog scraping, competitor analysis, etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Short name for the task (e.g. 'Coupang laptop prices')",
                    },
                    "description": {
                        "type": "string",
                        "description": "Detailed description of what data to collect (e.g. 'Collect laptop product names, prices, ratings from Coupang search results')",
                    },
                    "target_urls": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "URLs to scrape. If omitted, the system will suggest URLs based on the description.",
                    },
                    "schedule_cron": {
                        "type": "string",
                        "description": "Cron expression for recurring runs (e.g. '0 9 * * *' for daily at 9 AM). Omit for one-time tasks.",
                    },
                    "post_actions": {
                        "type": "object",
                        "description": "Post-processing actions after data collection.",
                        "properties": {
                            "csv_output": {
                                "type": "boolean",
                                "description": "Generate a CSV file from results",
                            },
                            "compare_previous": {
                                "type": "boolean",
                                "description": "Compare with previous run results to detect changes",
                            },
                            "email_notify": {
                                "type": "object",
                                "description": "Send email notification after collection",
                                "properties": {
                                    "to": {
                                        "type": "string",
                                        "description": "Recipient email address",
                                    },
                                    "include_csv": {
                                        "type": "boolean",
                                        "description": "Attach CSV file to email",
                                    },
                                    "only_on_changes": {
                                        "type": "boolean",
                                        "description": "Only send email when changes are detected (requires compare_previous)",
                                    },
                                },
                                "required": ["to"],
                            },
                        },
                    },
                },
                "required": ["name", "description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_collection_task",
            "description": "Immediately runs a data collection task. The task runs in the background and results can be retrieved later with get_collection_results.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {
                        "type": "string",
                        "description": "Collection task ID to run",
                    },
                },
                "required": ["task_id"],
            },
        },
    },
]

# ─── Schedule Task Tool Definitions ───

SCHEDULE_READ_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_schedule_tasks",
            "description": "Lists the user's scheduled tasks. Returns tasks within a date range.",
            "parameters": {
                "type": "object",
                "properties": {
                    "days_ahead": {
                        "type": "integer",
                        "description": "Number of days ahead to look (default 7, max 30)",
                        "default": 7,
                    },
                },
                "required": [],
            },
        },
    },
]

SCHEDULE_CREATE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_schedule_task",
            "description": (
                "Creates a scheduled task that an AI agent will execute at the specified time. "
                "For one-time tasks, just set scheduled_at. "
                "For recurring tasks, set repeat_type. Use interval_minutes for minute/hour-level repeats."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Short task name (max 200 chars)",
                    },
                    "prompt": {
                        "type": "string",
                        "description": "Detailed instructions for what the AI agent should do when executing this task",
                    },
                    "scheduled_at": {
                        "type": "string",
                        "description": "First execution time in ISO 8601 format (e.g. 2026-02-22T14:30:00)",
                    },
                    "repeat_type": {
                        "type": "string",
                        "description": "Repeat cycle: 'hourly', 'daily', 'weekly', or 'monthly'. Omit for one-time tasks.",
                        "enum": ["hourly", "daily", "weekly", "monthly"],
                    },
                    "interval_minutes": {
                        "type": "integer",
                        "description": "Repeat every N minutes (e.g. 5 = every 5 minutes, 30 = every 30 minutes). Takes priority over repeat_type.",
                    },
                },
                "required": ["name", "prompt", "scheduled_at"],
            },
        },
    },
]

SCHEDULE_MANAGE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "update_schedule_task",
            "description": "Updates an existing scheduled task. Can change name, prompt, schedule, or enable/disable it.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {
                        "type": "string",
                        "description": "Schedule task ID (UUID)",
                    },
                    "name": {
                        "type": "string",
                        "description": "New task name",
                    },
                    "prompt": {
                        "type": "string",
                        "description": "New task instructions",
                    },
                    "scheduled_at": {
                        "type": "string",
                        "description": "New execution time (ISO 8601)",
                    },
                    "repeat_type": {
                        "type": "string",
                        "description": "New repeat type: 'hourly', 'daily', 'weekly', 'monthly', or empty string to clear",
                    },
                    "interval_minutes": {
                        "type": "integer",
                        "description": "Repeat every N minutes. Set 0 to clear.",
                    },
                    "is_enabled": {
                        "type": "boolean",
                        "description": "Enable or disable the task",
                    },
                },
                "required": ["task_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_schedule_task",
            "description": "Deletes a scheduled task.",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {
                        "type": "string",
                        "description": "Schedule task ID to delete (UUID)",
                    },
                },
                "required": ["task_id"],
            },
        },
    },
]

# Mapping from config key to tool definitions
TOOL_GROUPS = {
    "file_read": FILE_READ_TOOLS,
    "file_read_content": FILE_READ_CONTENT_TOOLS,
    "file_create": FILE_CREATE_TOOLS,
    "file_delete": FILE_DELETE_TOOLS,
    "file_move": FILE_MOVE_TOOLS,
    "file_share": FILE_SHARE_TOOLS,
    "file_compress": FILE_COMPRESS_TOOLS,
    "file_search_name": FILE_SEARCH_NAME_TOOLS,
    "file_search_content": FILE_SEARCH_CONTENT_TOOLS,
    "note_read": NOTE_READ_TOOLS,
    "note_create": NOTE_CREATE_TOOLS,
    "note_delete": NOTE_DELETE_TOOLS,
    "note_update": NOTE_UPDATE_TOOLS,
    "note_search": NOTE_SEARCH_TOOLS,
    "mail_send": MAIL_SEND_TOOLS,
    "mail_manage": MAIL_MANAGE_TOOLS,
    "messenger_send": MESSENGER_TOOLS,
    "utility": UTILITY_TOOLS,
    "memory_save": MEMORY_SAVE_TOOLS,
    "memory_read": MEMORY_READ_TOOLS,
    "web_search": WEB_SEARCH_TOOLS,
    "web_screenshot": WEB_SCREENSHOT_TOOLS,
    "web_interaction": WEB_INTERACTION_TOOLS,
    "browser_cookie": BROWSER_COOKIE_TOOLS,
    "vault_credentials": VAULT_CREDENTIALS_TOOLS,
    "vault_files": VAULT_FILES_TOOLS,
    "python_exec": PYTHON_EXEC_TOOLS,
    "collection_read": COLLECTION_READ_TOOLS,
    "collection_create": COLLECTION_CREATE_TOOLS,
    "schedule_read": SCHEDULE_READ_TOOLS,
    "schedule_create": SCHEDULE_CREATE_TOOLS,
    "schedule_manage": SCHEDULE_MANAGE_TOOLS,
}


def get_enabled_tools(config_json: str | None = None, *, enabled_keys: set[str] | None = None) -> list[dict]:
    """Build list of enabled tool definitions.

    Supports two modes:
    - Legacy: pass config_json like '{"file_read":true,...}'
    - New (DB): pass enabled_keys as a set of group keys

    Returns:
        List of OpenAI tool definition dicts.
    """
    if enabled_keys is not None:
        # DB-driven mode
        tools: list[dict] = []
        for key in enabled_keys:
            if key in TOOL_GROUPS:
                tools.extend(TOOL_GROUPS[key])
        return tools

    # Legacy JSON config mode
    if not config_json:
        return []

    try:
        config = json.loads(config_json)
    except (json.JSONDecodeError, TypeError):
        return []

    tools = []
    for key, enabled in config.items():
        if enabled and key in TOOL_GROUPS:
            tools.extend(TOOL_GROUPS[key])
    return tools


# ─── Tool Execution ───

from typing import Callable, Optional


async def execute_tool(
    name: str,
    arguments: dict,
    user_id: uuid.UUID,
    db: AsyncSession,
    execution_id: str | None = None,
    request_user_input: Optional[Callable] = None,
    prompt: str = "",
) -> str:
    """Execute a tool call and return JSON result string."""
    try:
        if name == "list_files":
            return await _list_files(user_id, arguments.get("folder", "/"), db)
        elif name == "read_file_info":
            return await _read_file_info(user_id, arguments["file_id"], db)
        elif name == "read_file_content":
            return await _read_file_content(user_id, arguments["file_id"], arguments.get("max_length", 8000), db)
        elif name == "search_files_by_name":
            return await _search_files_by_name(user_id, arguments["query"], db)
        elif name == "search_files_by_content":
            return await _search_files_by_content(user_id, arguments["query"], db)
        elif name == "create_text_file":
            ext = arguments["filename"].rsplit(".", 1)[-1] if "." in arguments["filename"] else "txt"
            agent_name = _agent_filename(prompt, ext)
            await _ensure_agent_folder(user_id, db)
            return await _create_text_file(
                user_id,
                agent_name,
                arguments["content"],
                AGENT_FOLDER,
                db,
            )
        elif name == "delete_file":
            return await _delete_file(user_id, arguments["file_id"], db)
        elif name == "move_file":
            return await _move_file(user_id, arguments["file_id"], arguments["target_folder"], db)
        elif name == "move_files_batch":
            return await _move_files_batch(user_id, arguments["file_ids"], arguments["target_folder"], db)
        elif name == "create_folder":
            return await _create_folder(user_id, arguments["name"], arguments.get("parent_folder", "/"), db)
        elif name == "share_file":
            return await _share_file(user_id, arguments["file_id"], db)
        elif name == "compress_files":
            agent_zip = _agent_filename(prompt, "zip")
            await _ensure_agent_folder(user_id, db)
            return await _compress_files(
                user_id,
                arguments["file_ids"],
                agent_zip,
                AGENT_FOLDER,
                db,
            )
        elif name == "decompress_file":
            return await _decompress_file(user_id, arguments["file_id"], db)
        elif name == "list_notes":
            return await _list_notes(user_id, db)
        elif name == "read_note":
            return await _read_note(user_id, arguments["note_id"], db)
        elif name == "create_note":
            return await _create_note(
                user_id,
                arguments["title"],
                arguments["content"],
                arguments.get("color", "yellow"),
                db,
            )
        elif name == "delete_note":
            return await _delete_note(user_id, arguments["note_id"], db)
        elif name == "update_note":
            return await _update_note(user_id, arguments["note_id"], arguments, db)
        elif name == "search_notes":
            return await _search_notes(user_id, arguments["query"], db)
        # Mail tools
        elif name == "send_mail":
            return await _send_mail(
                user_id, arguments["to_email"], arguments["subject"], arguments["body"], db,
                file_ids=arguments.get("file_ids"),
            )
        elif name == "update_mail":
            return await _update_mail(user_id, arguments["mail_id"], arguments, db)
        elif name == "delete_mail":
            return await _delete_mail(user_id, arguments["mail_id"], db)
        # Messenger tools
        elif name == "send_talk_message":
            return await _send_talk_message(user_id, arguments["message"], db)
        # Utility tools
        elif name == "get_current_time":
            return _get_current_time()
        # Memory tools
        elif name == "save_memory":
            return await _save_memory(user_id, arguments["category"], arguments["key"], arguments["content"], db)
        elif name == "recall_memory":
            return await _recall_memory(user_id, arguments.get("query", ""), arguments.get("category"), db)
        elif name == "delete_memory":
            return await _delete_memory(user_id, arguments["memory_id"], db)
        # Web search
        elif name == "web_search":
            return await _web_search(arguments["query"], arguments.get("max_results", 5))
        elif name == "web_fetch":
            return await _web_fetch(arguments["url"], arguments.get("max_length", 3000))
        elif name == "web_screenshot":
            agent_png = _agent_filename(prompt, "png")
            await _ensure_agent_folder(user_id, db)
            return await _web_screenshot(
                url=arguments["url"],
                filename=agent_png,
                folder=AGENT_FOLDER,
                full_page=arguments.get("full_page", False),
                user_id=user_id,
                db=db,
            )
        # VAULT TOOLS
        elif name == "list_vault_credentials":
            from app.services.ai.browser_tools import list_vault_credentials
            return await list_vault_credentials(user_id, db)
        elif name == "list_vault_files":
            return await _list_vault_files(user_id, db)
        # Web interaction (browser automation) tools
        elif name == "browser_navigate":
            from app.services.ai.browser_tools import browser_navigate
            return await browser_navigate(execution_id or "", arguments["url"], arguments.get("wait_for", "load"), db, user_id)
        elif name == "browser_read_page":
            from app.services.ai.browser_tools import browser_read_page
            return await browser_read_page(execution_id or "", arguments.get("selector"), arguments.get("max_length", 3000), arguments.get("mode", "text"))
        elif name == "browser_click":
            from app.services.ai.browser_tools import browser_click
            return await browser_click(execution_id or "", arguments.get("selector"), arguments.get("text"))
        elif name == "browser_fill":
            from app.services.ai.browser_tools import browser_fill
            return await browser_fill(execution_id or "", arguments["selector"], arguments["value"], arguments.get("clear_first", True))
        elif name == "browser_select":
            from app.services.ai.browser_tools import browser_select
            return await browser_select(execution_id or "", arguments["selector"], arguments.get("value"), arguments.get("label"))
        elif name == "browser_screenshot":
            from app.services.ai.browser_tools import browser_screenshot
            agent_png = _agent_filename(prompt, "png")
            await _ensure_agent_folder(user_id, db)
            return await browser_screenshot(execution_id or "", user_id, db, agent_png, arguments.get("full_page", False), AGENT_FOLDER)
        elif name == "browser_login":
            from app.services.ai.browser_tools import browser_login
            return await browser_login(execution_id or "", arguments["credential_id"], user_id, db, arguments.get("login_url"), request_user_input)
        elif name == "browser_scroll":
            from app.services.ai.browser_tools import browser_scroll
            return await browser_scroll(execution_id or "", arguments.get("direction", "down"), arguments.get("amount", 500), arguments.get("selector"))
        elif name == "browser_execute_js":
            from app.services.ai.browser_tools import browser_execute_js
            return await browser_execute_js(execution_id or "", arguments["script"])
        elif name == "browser_wait":
            from app.services.ai.browser_tools import browser_wait
            return await browser_wait(execution_id or "", arguments["selector"], arguments.get("timeout", 10000), arguments.get("state", "visible"))
        # Browser cookie tools
        elif name == "browser_save_cookies":
            from app.services.ai.browser_tools import browser_save_cookies
            return await browser_save_cookies(execution_id or "", arguments["domain"], arguments.get("label"), db, user_id)
        elif name == "browser_load_cookies":
            from app.services.ai.browser_tools import browser_load_cookies
            return await browser_load_cookies(execution_id or "", arguments["domain"], db, user_id)
        elif name == "browser_list_cookies":
            from app.services.ai.browser_tools import browser_list_cookies
            return await browser_list_cookies(db, user_id)
        elif name == "browser_import_cookies":
            from app.services.ai.browser_tools import browser_import_cookies
            return await browser_import_cookies(arguments["domain"], arguments.get("label"), arguments["cookies_json"], db, user_id)
        elif name == "browser_delete_cookies":
            from app.services.ai.browser_tools import browser_delete_cookies
            return await browser_delete_cookies(arguments["domain"], db, user_id)
        # Python execution
        elif name == "execute_python":
            from app.services.ai.python_executor import execute_python_code
            return await execute_python_code(arguments.get("code", ""))
        # JavaScript execution
        elif name == "execute_javascript":
            return json.dumps({
                "error": "execute_javascript tool is disabled for security reasons.",
                "success": False,
            }, ensure_ascii=False)
        # Collection tools
        elif name == "create_collection_task":
            return await _create_collection_task(user_id, arguments, db)
        elif name == "list_collection_tasks":
            return await _list_collection_tasks(user_id, db)
        elif name == "run_collection_task":
            return await _run_collection_task(user_id, arguments["task_id"], db)
        elif name == "get_collection_results":
            return await _get_collection_results(user_id, arguments["task_id"], arguments.get("limit", 10), db)
        # Schedule task tools
        elif name == "list_schedule_tasks":
            return await _list_schedule_tasks(user_id, arguments.get("days_ahead", 7), db)
        elif name == "create_schedule_task":
            return await _create_schedule_task(user_id, arguments, db)
        elif name == "update_schedule_task":
            return await _update_schedule_task(user_id, arguments["task_id"], arguments, db)
        elif name == "delete_schedule_task":
            return await _delete_schedule_task(user_id, arguments["task_id"], db)
        else:
            return json.dumps({"error": f"Unknown tool: {name}"})
    except Exception as e:
        await db.rollback()
        return json.dumps({"error": str(e)})


# ─── Tool Implementations ───

async def _list_files(user_id: uuid.UUID, folder: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(File).where(
            File.user_id == user_id,
            File.folder == folder,
            File.deleted_at.is_(None),
        ).order_by(File.original_filename)
    )
    files = result.scalars().all()
    data = json.dumps([
        {
            "id": str(f.id),
            "name": f.original_filename,
            "size": f.size,
            "size_display": _human_size(f.size),
            "type": f.mime_type,
            "folder": f.folder,
            "indexed": f.is_indexed,
            "index_status": f.index_status.value if f.index_status else None,
        }
        for f in files
    ], ensure_ascii=False)
    return f"```filelist\n{data}\n```\nInclude the filelist block above in your response as-is. This block will be rendered as a file explorer UI. Do not repeat the same file information again."


async def _read_file_info(user_id: uuid.UUID, file_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(File).where(
            File.id == uuid.UUID(file_id),
            File.user_id == user_id,
            File.deleted_at.is_(None),
        )
    )
    f = result.scalar_one_or_none()
    if not f:
        return json.dumps({"error": "File not found."})

    # If DB shows 0 bytes but file exists in storage, try to get actual size
    actual_size = f.size
    if actual_size == 0 and f.storage_path:
        try:
            from app.services.storage.minio_service import get_minio_service
            minio = get_minio_service()
            stat = minio.client.stat_object(minio.bucket, f.storage_path)
            actual_size = stat.size or 0
            if actual_size > 0:
                f.size = actual_size
                await db.flush()
        except Exception:
            pass

    data = json.dumps({
        "id": str(f.id),
        "name": f.original_filename,
        "size": actual_size,
        "size_display": _human_size(actual_size),
        "type": f.mime_type,
        "folder": f.folder,
        "indexed": f.is_indexed,
        "created_at": f.created_at.isoformat(),
    }, ensure_ascii=False)
    return f"```fileinfo\n{data}\n```\nInclude the fileinfo block above in your response as-is. This block will be rendered as a file info card UI."


async def _read_file_content(user_id: uuid.UUID, file_id: str, max_length: int, db: AsyncSession) -> str:
    """Read actual file content from MinIO and extract text."""
    result = await db.execute(
        select(File).where(
            File.id == uuid.UUID(file_id),
            File.user_id == user_id,
            File.deleted_at.is_(None),
        )
    )
    f = result.scalar_one_or_none()
    if not f:
        return json.dumps({"error": "File not found."}, ensure_ascii=False)

    if not f.storage_path:
        return json.dumps({"error": "Cannot read file content (it is a folder or has no storage path)."}, ensure_ascii=False)

    mime = f.mime_type or ""

    # Check if file type is supported for text extraction
    from app.services.document.parser_service import DocumentParser
    parser = DocumentParser()

    # Direct text read for plain-text-like types
    TEXT_MIMES = {
        "text/plain", "text/csv", "text/markdown", "text/html", "text/css",
        "text/javascript", "text/xml", "application/json", "application/xml",
        "application/x-sh",
    }
    is_text = mime in TEXT_MIMES
    is_parseable = mime in parser.SUPPORTED_TYPES and parser.SUPPORTED_TYPES[mime] in ("pdf", "docx", "html", "xml", "txt")

    if not is_text and not is_parseable:
        return json.dumps({
            "error": f"This file type ({mime}) does not support text extraction. "
                     "Only text-based files such as PDF, DOCX, TXT, JSON, CSV, HTML, XML are supported."
        }, ensure_ascii=False)

    # Size guard: skip very large files (>20MB)
    if f.size > 20 * 1024 * 1024:
        return json.dumps({
            "error": f"File is too large ({_human_size(f.size)}). Only files up to 20MB can be read."
        }, ensure_ascii=False)

    try:
        from app.services.storage.minio_service import get_minio_service
        minio = get_minio_service()
        file_bytes = minio.download_file(f.storage_path)
        if file_bytes is None:
            return json.dumps({"error": "Cannot download file from storage."}, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": f"File download error: {str(e)}"}, ensure_ascii=False)

    try:
        if is_text:
            # Decode raw text
            for enc in ("utf-8", "cp949", "euc-kr", "latin-1"):
                try:
                    text = file_bytes.decode(enc)
                    break
                except (UnicodeDecodeError, LookupError):
                    continue
            else:
                text = file_bytes.decode("utf-8", errors="replace")
        else:
            # Use parser for PDF, DOCX, HTML, XML
            text = parser.parse(file_bytes, mime)
    except Exception as e:
        return json.dumps({"error": f"File content extraction error: {str(e)}"}, ensure_ascii=False)

    if not text or not text.strip():
        return json.dumps({
            "file_name": f.original_filename,
            "content": "(File content is empty)",
        }, ensure_ascii=False)

    # Truncate if too long
    truncated = len(text) > max_length
    content = text[:max_length]

    result_data = {
        "file_name": f.original_filename,
        "file_type": mime,
        "content": content,
    }
    if truncated:
        result_data["truncated"] = True
        result_data["total_length"] = len(text)
        result_data["note"] = f"File content truncated to {max_length} chars. Total length: {len(text)} chars"

    return json.dumps(result_data, ensure_ascii=False)


async def _search_files_by_name(user_id: uuid.UUID, query: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(File).where(
            File.user_id == user_id,
            File.deleted_at.is_(None),
            File.original_filename.ilike(f"%{query}%"),
        ).limit(20)
    )
    files = result.scalars().all()
    data = json.dumps([
        {
            "id": str(f.id),
            "name": f.original_filename,
            "size": f.size,
            "size_display": _human_size(f.size),
            "type": f.mime_type,
            "folder": f.folder,
            "indexed": f.is_indexed,
            "index_status": f.index_status.value if f.index_status else None,
        }
        for f in files
    ], ensure_ascii=False)
    return f"```filelist\n{data}\n```\nInclude the filelist block above in your response as-is. This block will be rendered as a file explorer UI. Do not repeat the same file information again."


async def _search_files_by_content(user_id: uuid.UUID, query: str, db: AsyncSession) -> str:
    """Semantic content search using embeddings. Falls back to filename search on error."""
    try:
        from app.services.ai.embedding_service import EmbeddingService
        from app.core.settings_manager import load_settings_from_db
        from app.models.embedding import DocumentEmbedding
        from sqlalchemy import text as sa_text

        settings = await load_settings_from_db(db)
        embedding_svc = EmbeddingService(settings)
        query_embedding = await embedding_svc.embed_text(query)

        embedding_vector = f"[{','.join(map(str, query_embedding))}]"

        search_sql = """
            SELECT * FROM (
                SELECT DISTINCT ON (f.id)
                    f.id AS file_id,
                    f.original_filename AS file_name,
                    f.folder,
                    f.size,
                    f.mime_type,
                    f.is_indexed,
                    de.chunk_text,
                    1 - (de.embedding <=> CAST(:embedding AS vector)) as similarity
                FROM document_embeddings de
                JOIN files f ON de.file_id = f.id
                WHERE f.user_id = :user_id
                  AND f.deleted_at IS NULL
                ORDER BY f.id, de.embedding <=> CAST(:embedding AS vector)
            ) AS unique_files
            WHERE similarity >= 0.3
            ORDER BY similarity DESC
            LIMIT 10
        """

        result = await db.execute(sa_text(search_sql), {
            "embedding": embedding_vector,
            "user_id": str(user_id),
        })
        rows = result.fetchall()

        if not rows:
            # No semantic results — fall back to filename search
            return await _search_files_by_name(user_id, query, db)

        items = []
        for row in rows:
            items.append({
                "id": str(row.file_id),
                "name": row.file_name,
                "folder": row.folder,
                "size": row.size,
                "size_display": _human_size(row.size),
                "type": row.mime_type,
                "indexed": row.is_indexed,
                "similarity": round(float(row.similarity), 3),
                "matched_text": row.chunk_text[:200] if row.chunk_text else "",
            })

        data = json.dumps(items, ensure_ascii=False)
        return f"```filelist\n{data}\n```\nInclude the above filelist block as-is in your response. This block will be rendered as a file explorer UI. Do not repeat the same file information.\n\nEach file's matched_text is the document content most similar to the search query. Use this content to answer the user."
    except Exception:
        # Embedding service unavailable — fall back to filename search
        return await _search_files_by_name(user_id, query, db)


async def _create_text_file(
    user_id: uuid.UUID, filename: str, content: str, folder: str, db: AsyncSession
) -> str:
    from app.services.storage.minio_service import get_minio_service
    import io

    minio = get_minio_service()
    file_bytes = content.encode("utf-8")
    storage_filename = f"{uuid.uuid4()}_{filename}"
    storage_path = f"{user_id}/{storage_filename}"

    minio.client.put_object(
        minio.bucket,
        storage_path,
        io.BytesIO(file_bytes),
        len(file_bytes),
        content_type="text/plain",
    )

    new_file = File(
        user_id=user_id,
        filename=storage_filename,
        original_filename=filename,
        mime_type="text/plain",
        size=len(file_bytes),
        storage_path=storage_path,
        folder=folder,
    )
    db.add(new_file)
    await db.flush()

    return json.dumps({
        "id": str(new_file.id),
        "name": filename,
        "size": len(file_bytes),
        "message": f"File '{filename}' has been created.",
    }, ensure_ascii=False)


async def _delete_file(user_id: uuid.UUID, file_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(File).where(
            File.id == uuid.UUID(file_id),
            File.user_id == user_id,
            File.deleted_at.is_(None),
        )
    )
    f = result.scalar_one_or_none()
    if not f:
        return json.dumps({"error": "File not found."})

    f.deleted_at = datetime.utcnow()
    await db.flush()
    return json.dumps({"message": f"File '{f.original_filename}' has been deleted."}, ensure_ascii=False)


async def _move_file(user_id: uuid.UUID, file_id: str, target_folder: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(File).where(
            File.id == uuid.UUID(file_id),
            File.user_id == user_id,
            File.deleted_at.is_(None),
        )
    )
    f = result.scalar_one_or_none()
    if not f:
        return json.dumps({"error": "File not found."})

    old_folder = f.folder
    # Normalize target folder (match REST API behavior)
    target_folder = target_folder.strip()
    if ">" in target_folder:
        return json.dumps({"error": "Cannot use '>' in path. Use actual paths, not breadcrumb format. (e.g., /CSY/source)"})
    if not target_folder.startswith("/"):
        target_folder = "/" + target_folder
    target_folder = target_folder.rstrip("/") or "/"

    # If moving a folder, also update children paths
    if f.mime_type == "application/x-folder":
        old_path = f"{old_folder.rstrip('/')}/{f.original_filename}"
        new_path = f"{target_folder.rstrip('/')}/{f.original_filename}"

        # Update direct children
        await db.execute(
            update(File)
            .where(
                File.user_id == user_id,
                File.deleted_at.is_(None),
                File.folder == old_path,
            )
            .values(folder=new_path)
        )

        # Update deeper descendants
        descendants_result = await db.execute(
            select(File).where(
                File.user_id == user_id,
                File.deleted_at.is_(None),
                File.folder.like(f"{old_path}/%"),
            )
        )
        for desc in descendants_result.scalars().all():
            desc.folder = new_path + desc.folder[len(old_path):]

    f.folder = target_folder
    await db.flush()
    return json.dumps({
        "message": f"File '{f.original_filename}' moved from '{old_folder}' to '{target_folder}'.",
    }, ensure_ascii=False)


async def _move_files_batch(
    user_id: uuid.UUID, file_ids: list[str], target_folder: str, db: AsyncSession
) -> str:
    if not file_ids:
        return json.dumps({"error": "Please select files to move."})
    if len(file_ids) > 50:
        return json.dumps({"error": "Maximum 50 files can be moved at once."})

    # Normalize target folder
    target_folder = target_folder.strip()
    if ">" in target_folder:
        return json.dumps({"error": "Cannot use '>' in path. Use actual paths, not breadcrumb format. (e.g., /CSY/source)"})
    if not target_folder.startswith("/"):
        target_folder = "/" + target_folder
    target_folder = target_folder.rstrip("/") or "/"

    moved = []
    failed = []

    for fid in file_ids:
        try:
            result = await db.execute(
                select(File).where(
                    File.id == uuid.UUID(fid),
                    File.user_id == user_id,
                    File.deleted_at.is_(None),
                )
            )
            f = result.scalar_one_or_none()
            if not f:
                failed.append({"id": fid, "error": "File not found."})
                continue

            old_folder = f.folder

            # If moving a folder, also update children paths
            if f.mime_type == "application/x-folder":
                old_path = f"{old_folder.rstrip('/')}/{f.original_filename}"
                new_path = f"{target_folder.rstrip('/')}/{f.original_filename}"

                await db.execute(
                    update(File)
                    .where(
                        File.user_id == user_id,
                        File.deleted_at.is_(None),
                        File.folder == old_path,
                    )
                    .values(folder=new_path)
                )

                descendants_result = await db.execute(
                    select(File).where(
                        File.user_id == user_id,
                        File.deleted_at.is_(None),
                        File.folder.like(f"{old_path}/%"),
                    )
                )
                for desc in descendants_result.scalars().all():
                    desc.folder = new_path + desc.folder[len(old_path):]

            f.folder = target_folder
            moved.append({"id": fid, "name": f.original_filename})
        except Exception as e:
            failed.append({"id": fid, "error": str(e)})

    await db.flush()

    return json.dumps({
        "moved": len(moved),
        "failed": len(failed),
        "target_folder": target_folder,
        "details": moved,
        "errors": failed if failed else [],
        "message": f"{len(moved)} file(s) moved to '{target_folder}'." + (f" ({len(failed)} failed)" if failed else ""),
    }, ensure_ascii=False)


async def _create_folder(user_id: uuid.UUID, name: str, parent_folder: str, db: AsyncSession) -> str:
    if not name or "/" in name:
        return json.dumps({"error": "Invalid folder name."})

    parent_folder = parent_folder.strip()
    if ">" in parent_folder:
        return json.dumps({"error": "Cannot use '>' in path. Use actual paths, not breadcrumb format. (e.g., /CSY)"})
    if not parent_folder.startswith("/"):
        parent_folder = "/" + parent_folder

    # Check if folder already exists
    existing = await db.execute(
        select(File).where(
            File.user_id == user_id,
            File.mime_type == "application/x-folder",
            File.original_filename == name,
            File.folder == parent_folder,
            File.deleted_at.is_(None),
        )
    )
    if existing.scalar_one_or_none():
        return json.dumps({"error": f"Folder '{name}' already exists."})

    folder_record = File(
        user_id=user_id,
        filename=".folder",
        original_filename=name,
        mime_type="application/x-folder",
        size=0,
        storage_path="",
        folder=parent_folder,
    )
    db.add(folder_record)
    await db.flush()

    folder_path = f"{parent_folder.rstrip('/')}/{name}"
    return json.dumps({
        "message": f"Folder '{name}' created in '{parent_folder}'.",
        "path": folder_path,
    }, ensure_ascii=False)


async def _share_file(user_id: uuid.UUID, file_id: str, db: AsyncSession) -> str:
    import secrets
    from app.models.file_share import FileShare
    from app.core.config import get_settings

    result = await db.execute(
        select(File).where(
            File.id == uuid.UUID(file_id),
            File.user_id == user_id,
            File.deleted_at.is_(None),
        )
    )
    f = result.scalar_one_or_none()
    if not f:
        return json.dumps({"error": "File not found."})
    if f.mime_type == "application/x-folder":
        return json.dumps({"error": "Folders cannot be shared."})

    try:
        share = FileShare(
            file_id=f.id,
            user_id=user_id,
            token=secrets.token_urlsafe(8)[:10],
            expires_at=datetime.utcnow() + timedelta(days=7),
        )
        db.add(share)
        await db.flush()

        settings = get_settings()
        url = f"{settings.frontend_url}/s/{share.token}"

        return json.dumps({
            "message": f"Sharing link created for '{f.original_filename}' (valid for 7 days).",
            "url": url,
            "token": share.token,
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": f"Failed to create sharing link: {str(e)}"})


async def _compress_files(
    user_id: uuid.UUID, file_ids: list[str], zip_name: str, folder: str, db: AsyncSession
) -> str:
    import io
    import zipfile
    from app.services.storage.minio_service import get_minio_service

    if not file_ids:
        return json.dumps({"error": "Please select files to compress."})
    if len(file_ids) > 50:
        return json.dumps({"error": "Maximum 50 files can be compressed at once."})

    minio = get_minio_service()
    buf = io.BytesIO()
    compressed_count = 0

    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for fid in file_ids:
            try:
                result = await db.execute(
                    select(File).where(
                        File.id == uuid.UUID(fid),
                        File.user_id == user_id,
                        File.deleted_at.is_(None),
                    )
                )
                f = result.scalar_one_or_none()
                if not f or f.mime_type == "application/x-folder":
                    continue
                data = minio.download_file(f.storage_path)
                zf.writestr(f.original_filename, data)
                compressed_count += 1
            except Exception:
                continue

    if compressed_count == 0:
        return json.dumps({"error": "No files available to compress."})

    zip_bytes = buf.getvalue()
    if not zip_name.endswith(".zip"):
        zip_name += ".zip"
    storage_filename = f"{uuid.uuid4()}_{zip_name}"
    storage_path = f"{user_id}/{storage_filename}"

    minio.client.put_object(
        minio.bucket,
        storage_path,
        io.BytesIO(zip_bytes),
        len(zip_bytes),
        content_type="application/zip",
    )

    new_file = File(
        user_id=user_id,
        filename=storage_filename,
        original_filename=zip_name,
        mime_type="application/zip",
        size=len(zip_bytes),
        storage_path=storage_path,
        folder=folder,
    )
    db.add(new_file)
    await db.flush()

    return json.dumps({
        "id": str(new_file.id),
        "name": zip_name,
        "size": len(zip_bytes),
        "size_display": _human_size(len(zip_bytes)),
        "message": f"{compressed_count} file(s) compressed into '{zip_name}'.",
    }, ensure_ascii=False)


async def _decompress_file(user_id: uuid.UUID, file_id: str, db: AsyncSession) -> str:
    import io
    import zipfile
    from app.services.storage.minio_service import get_minio_service

    result = await db.execute(
        select(File).where(
            File.id == uuid.UUID(file_id),
            File.user_id == user_id,
            File.deleted_at.is_(None),
        )
    )
    f = result.scalar_one_or_none()
    if not f:
        return json.dumps({"error": "File not found."})

    if f.mime_type not in ("application/zip", "application/x-zip-compressed"):
        return json.dumps({"error": "Only ZIP files can be extracted."})

    minio = get_minio_service()
    zip_data = minio.download_file(f.storage_path)

    try:
        zf = zipfile.ZipFile(io.BytesIO(zip_data))
    except zipfile.BadZipFile:
        return json.dumps({"error": "Invalid ZIP file."})

    # Create subfolder named after the ZIP file (without .zip extension)
    zip_basename = f.original_filename
    if zip_basename.lower().endswith(".zip"):
        zip_basename = zip_basename[:-4]

    parent_folder = f.folder
    target_folder = f"{parent_folder.rstrip('/')}/{zip_basename}"

    # Create folder record if it doesn't exist
    existing_folder = await db.execute(
        select(File).where(
            File.user_id == user_id,
            File.mime_type == "application/x-folder",
            File.original_filename == zip_basename,
            File.folder == parent_folder,
            File.deleted_at.is_(None),
        )
    )
    if not existing_folder.scalar_one_or_none():
        folder_record = File(
            user_id=user_id,
            filename=".folder",
            original_filename=zip_basename,
            mime_type="application/x-folder",
            size=0,
            storage_path="",
            folder=parent_folder,
        )
        db.add(folder_record)

    extracted = []
    for info in zf.infolist():
        if info.is_dir() or info.file_size == 0:
            continue
        if len(extracted) >= 100:
            break

        name = info.filename.split("/")[-1]  # flatten paths
        if not name:
            continue

        content = zf.read(info.filename)
        storage_filename = f"{uuid.uuid4()}_{name}"
        storage_path = f"{user_id}/{storage_filename}"

        # Guess content type
        ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
        mime_map = {
            "txt": "text/plain", "md": "text/markdown", "pdf": "application/pdf",
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
            "gif": "image/gif", "webp": "image/webp",
            "mp3": "audio/mpeg", "wav": "audio/wav", "mp4": "video/mp4",
            "zip": "application/zip", "json": "application/json",
            "csv": "text/csv", "html": "text/html",
        }
        content_type = mime_map.get(ext, "application/octet-stream")

        minio.client.put_object(
            minio.bucket, storage_path, io.BytesIO(content), len(content),
            content_type=content_type,
        )

        new_file = File(
            user_id=user_id,
            filename=storage_filename,
            original_filename=name,
            mime_type=content_type,
            size=len(content),
            storage_path=storage_path,
            folder=target_folder,
        )
        db.add(new_file)
        extracted.append({"name": name, "size_display": _human_size(len(content))})

    zf.close()
    await db.flush()

    if not extracted:
        return json.dumps({"error": "ZIP file is empty."})

    return json.dumps({
        "message": f"Extracted {len(extracted)} file(s) from '{f.original_filename}' to '{target_folder}'.",
        "folder": target_folder,
        "files": extracted,
    }, ensure_ascii=False)


async def _list_notes(user_id: uuid.UUID, db: AsyncSession) -> str:
    result = await db.execute(
        select(StickyNote).where(
            StickyNote.user_id == user_id,
            StickyNote.deleted_at.is_(None),
        ).order_by(StickyNote.updated_at.desc())
    )
    notes = result.scalars().all()
    return json.dumps([
        {
            "id": str(n.id),
            "title": n.title,
            "content": n.content[:100],
            "color": n.color,
        }
        for n in notes
    ], ensure_ascii=False)


async def _read_note(user_id: uuid.UUID, note_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(StickyNote).where(
            StickyNote.id == uuid.UUID(note_id),
            StickyNote.user_id == user_id,
            StickyNote.deleted_at.is_(None),
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        return json.dumps({"error": "Note not found."})
    return json.dumps({
        "id": str(note.id),
        "title": note.title,
        "content": note.content,
        "color": note.color,
        "created_at": note.created_at.isoformat(),
    }, ensure_ascii=False)


async def _create_note(
    user_id: uuid.UUID, title: str, content: str, color: str, db: AsyncSession
) -> str:
    note = StickyNote(
        user_id=user_id,
        title=title,
        content=content,
        color=color if color in ("yellow", "green", "pink", "blue", "purple", "orange", "gray") else "yellow",
    )
    db.add(note)
    await db.flush()
    return json.dumps({
        "id": str(note.id),
        "title": title,
        "message": f"Note '{title}' has been created.",
    }, ensure_ascii=False)


async def _delete_note(user_id: uuid.UUID, note_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(StickyNote).where(
            StickyNote.id == uuid.UUID(note_id),
            StickyNote.user_id == user_id,
            StickyNote.deleted_at.is_(None),
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        return json.dumps({"error": "Note not found."})

    note.deleted_at = datetime.utcnow()
    await db.flush()
    return json.dumps({"message": f"Note '{note.title}' has been deleted."}, ensure_ascii=False)


async def _update_note(user_id: uuid.UUID, note_id: str, args: dict, db: AsyncSession) -> str:
    result = await db.execute(
        select(StickyNote).where(
            StickyNote.id == uuid.UUID(note_id),
            StickyNote.user_id == user_id,
            StickyNote.deleted_at.is_(None),
        )
    )
    note = result.scalar_one_or_none()
    if not note:
        return json.dumps({"error": "Note not found."})

    valid_colors = ("yellow", "green", "pink", "blue", "purple", "orange", "gray")
    if "title" in args and args["title"] is not None:
        note.title = args["title"]
    if "content" in args and args["content"] is not None:
        note.content = args["content"]
    if "color" in args and args["color"] in valid_colors:
        note.color = args["color"]

    note.updated_at = datetime.utcnow()
    await db.flush()
    return json.dumps({
        "id": str(note.id),
        "title": note.title,
        "message": f"Note '{note.title}' has been updated.",
    }, ensure_ascii=False)


async def _search_notes(user_id: uuid.UUID, query: str, db: AsyncSession) -> str:
    pattern = f"%{query}%"
    result = await db.execute(
        select(StickyNote).where(
            StickyNote.user_id == user_id,
            StickyNote.deleted_at.is_(None),
            (StickyNote.title.ilike(pattern)) | (StickyNote.content.ilike(pattern)),
        ).order_by(StickyNote.updated_at.desc()).limit(20)
    )
    notes = result.scalars().all()
    return json.dumps([
        {
            "id": str(n.id),
            "title": n.title,
            "content": n.content[:100],
            "color": n.color,
        }
        for n in notes
    ], ensure_ascii=False)




# ─── Mail Tool Implementations ───

async def _send_mail(
    user_id: uuid.UUID, to_email: str, subject: str, body: str, db: AsyncSession,
    file_ids: list[str] | None = None,
) -> str:
    # Get sender info
    sender_result = await db.execute(select(User).where(User.id == user_id))
    sender = sender_result.scalar_one_or_none()
    if not sender:
        return json.dumps({"error": "User information not found."})

    sender_name = sender.name or sender.email
    sender_email = sender.email
    now = datetime.utcnow()

    # Create sender copy (sent folder)
    sender_mail = Mail(
        user_id=user_id,
        from_name=sender_name,
        from_email=sender_email,
        to_email=to_email,
        subject=subject,
        body=body,
        folder="sent",
        is_read=True,
        created_at=now,
    )
    db.add(sender_mail)
    await db.flush()

    # Attach cloud files if file_ids provided
    if file_ids:
        from app.models.file import File
        from app.models.mail_attachment import MailAttachment

        for fid in file_ids:
            try:
                file_result = await db.execute(
                    select(File).where(File.id == uuid.UUID(fid), File.user_id == user_id)
                )
                cloud_file = file_result.scalar_one_or_none()
                if cloud_file:
                    attachment = MailAttachment(
                        mail_id=sender_mail.id,
                        file_name=cloud_file.original_filename,
                        file_size=cloud_file.size,
                        mime_type=cloud_file.mime_type or "application/octet-stream",
                        storage_path=cloud_file.filename,  # reuse cloud storage path
                    )
                    db.add(attachment)
            except Exception:
                pass

    # Deliver to recipient if they exist on the platform
    recipient_result = await db.execute(select(User).where(User.email == to_email))
    recipient = recipient_result.scalar_one_or_none()
    delivered = False
    external_sent = False
    if recipient:
        inbox_mail = Mail(
            user_id=recipient.id,
            from_name=sender_name,
            from_email=sender_email,
            to_email=to_email,
            subject=subject,
            body=body,
            folder="inbox",
            is_read=False,
            created_at=now,
        )
        db.add(inbox_mail)
        await db.flush()
        delivered = True

        # Copy attachments to recipient's mail
        if file_ids:
            from app.models.mail_attachment import MailAttachment as MA
            att_result = await db.execute(
                select(MA).where(MA.mail_id == sender_mail.id)
            )
            for att in att_result.scalars().all():
                recipient_att = MA(
                    mail_id=inbox_mail.id,
                    file_name=att.file_name,
                    file_size=att.file_size,
                    mime_type=att.mime_type,
                    storage_path=att.storage_path,
                )
                db.add(recipient_att)

    # Create share links for attached files (always, for reliable access)
    share_links: list[dict] = []
    if file_ids:
        import secrets
        from app.models.file_share import FileShare
        from app.core.config import get_settings
        _settings = get_settings()
        for fid in file_ids:
            try:
                file_result2 = await db.execute(
                    select(File).where(File.id == uuid.UUID(fid), File.user_id == user_id, File.deleted_at.is_(None))
                )
                cloud_file2 = file_result2.scalar_one_or_none()
                if cloud_file2 and cloud_file2.mime_type != "application/x-folder":
                    share = FileShare(
                        file_id=cloud_file2.id,
                        user_id=user_id,
                        token=secrets.token_urlsafe(8)[:10],
                        expires_at=datetime.utcnow() + timedelta(days=7),
                    )
                    db.add(share)
                    await db.flush()
                    share_links.append({
                        "filename": cloud_file2.original_filename,
                        "url": f"{_settings.frontend_url}/s/{share.token}",
                        "size": cloud_file2.size,
                    })
            except Exception:
                pass

    # Always try external email via Resend (with attachments if any)
    try:
        from app.services.email_service import send_email
        from app.services.storage.minio_service import get_minio_service

        resend_attachments = None
        MAX_ATTACH_SIZE = 10 * 1024 * 1024  # 10MB per file
        MAX_TOTAL_SIZE = 25 * 1024 * 1024   # 25MB total

        if file_ids:
            resend_attachments = []
            total_size = 0
            from app.models.mail_attachment import MailAttachment as MA2
            att_q = await db.execute(select(MA2).where(MA2.mail_id == sender_mail.id))
            minio = get_minio_service()
            for att in att_q.scalars().all():
                try:
                    if att.file_size > MAX_ATTACH_SIZE or total_size + att.file_size > MAX_TOTAL_SIZE:
                        pass  # Skip large files — share links already created above
                    else:
                        file_data = minio.download_file(att.storage_path)
                        resend_attachments.append({"filename": att.file_name, "content": file_data})
                        total_size += len(file_data)
                except Exception:
                    pass

        # Append share links to email body (always include for reliable access)
        email_body = body
        if share_links:
            email_body += "\n\n📎 File download links (valid for 7 days):\n"
            for sl in share_links:
                size_mb = sl["size"] / (1024 * 1024)
                email_body += f"• {sl['filename']} ({size_mb:.1f}MB): {sl['url']}\n"

        external_sent = await send_email(
            to=to_email, subject=subject, body=email_body,
            from_name=sender_name, db=db,
            attachments=resend_attachments if resend_attachments else None,
        )
    except Exception:
        pass

    await db.flush()

    msg = f"Email '{subject}' sent to {to_email}."
    if external_sent:
        msg += " (Also sent as an external email.)"
    elif not delivered:
        msg += " (External delivery failed, saved to sent folder only.)"
    if share_links:
        msg += f" {len(share_links)} file share link(s) included in the email body."

    return json.dumps({
        "id": str(sender_mail.id),
        "subject": subject,
        "to_email": to_email,
        "delivered": delivered,
        "external_sent": external_sent,
        "share_links": [{"filename": sl["filename"], "url": sl["url"]} for sl in share_links],
        "message": msg,
    }, ensure_ascii=False)


async def _send_talk_message(user_id: uuid.UUID, message: str, db: AsyncSession) -> str:
    """Send a message to the user's messenger — add to the existing agent session + WS notification."""
    from app.models.chat import ChatSession, ChatMessage

    # 1. Find the user's existing file-manager agent session (same logic as the API endpoint)
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.user_id == user_id,
            ChatSession.agent_type == "file-manager",
            ChatSession.deleted_at.is_(None),
        ).order_by(ChatSession.created_at.desc())
    )
    session = result.scalars().first()

    if not session:
        # No agent session exists — create one
        session = ChatSession(
            user_id=user_id,
            title="비서 AI",
            model="system",
            agent_type="file-manager",
        )
        db.add(session)
        await db.flush()

    # 2. Add assistant message to the agent session
    msg = ChatMessage(
        session_id=session.id,
        role="assistant",
        content=message,
        source="agent",
    )
    db.add(msg)
    session.updated_at = datetime.utcnow()
    await db.flush()

    session_id_str = str(session.id)

    # 3. WebSocket notification via Redis pub/sub (best-effort, don't fail the tool)
    try:
        import redis.asyncio as aioredis
        from app.core.config import get_settings
        settings = get_settings()
        r = aioredis.from_url(settings.redis_url)
        try:
            await r.publish(f"user:{user_id}:notifications", json.dumps({
                "type": "notification",
                "source": "messenger",
                "name": message[:50],
                "status": "new_message",
                "session_id": session_id_str,
                "timestamp": datetime.utcnow().isoformat(),
            }))
        finally:
            await r.close()
    except Exception:
        pass  # WS notification is best-effort; DB data already flushed

    return json.dumps({
        "success": True,
        "session_id": session_id_str,
        "message": "메시지가 메신저에 전송되었습니다.",
    }, ensure_ascii=False)


async def _update_mail(user_id: uuid.UUID, mail_id: str, args: dict, db: AsyncSession) -> str:
    result = await db.execute(
        select(Mail).where(
            Mail.id == uuid.UUID(mail_id),
            Mail.user_id == user_id,
            Mail.deleted_at.is_(None),
        )
    )
    mail = result.scalar_one_or_none()
    if not mail:
        return json.dumps({"error": "Email not found."})

    changes = []
    if "is_read" in args and args["is_read"] is not None:
        mail.is_read = args["is_read"]
        changes.append("read" if args["is_read"] else "unread")
    if "is_starred" in args and args["is_starred"] is not None:
        mail.is_starred = args["is_starred"]
        changes.append("starred" if args["is_starred"] else "unstarred")
    if "folder" in args and args["folder"] is not None:
        mail.folder = args["folder"]
        changes.append(f"moved to '{args['folder']}'")

    await db.flush()
    return json.dumps({
        "id": str(mail.id),
        "message": f"Email '{mail.subject}': {', '.join(changes) if changes else 'no changes'}",
    }, ensure_ascii=False)


async def _delete_mail(user_id: uuid.UUID, mail_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(Mail).where(
            Mail.id == uuid.UUID(mail_id),
            Mail.user_id == user_id,
            Mail.deleted_at.is_(None),
        )
    )
    mail = result.scalar_one_or_none()
    if not mail:
        return json.dumps({"error": "Email not found."})

    if mail.folder == "trash":
        # Already in trash — permanently delete
        mail.deleted_at = datetime.utcnow()
        await db.flush()
        return json.dumps({"message": f"Email '{mail.subject}' has been permanently deleted."}, ensure_ascii=False)
    else:
        # Move to trash
        mail.folder = "trash"
        await db.flush()
        return json.dumps({"message": f"Email '{mail.subject}' moved to trash."}, ensure_ascii=False)


# ─── Utility Tool Implementations ───

def _get_current_time() -> str:
    now = datetime.now()
    weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    return json.dumps({
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M:%S"),
        "weekday": weekdays[now.weekday()],
        "iso": now.isoformat(),
    }, ensure_ascii=False)


# ─── Agent Memory Tool Implementations ───

async def _save_memory(
    user_id: uuid.UUID, category: str, key: str, content: str, db: AsyncSession
) -> str:
    valid_categories = ("preference", "habit", "fact", "instruction", "contact")
    if category not in valid_categories:
        category = "general"

    # Check if same key exists — update instead of duplicate
    result = await db.execute(
        select(AgentMemory).where(
            AgentMemory.user_id == user_id,
            AgentMemory.category == category,
            AgentMemory.key == key,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.content = content
        existing.updated_at = datetime.utcnow()
        await db.flush()
        return json.dumps({
            "id": str(existing.id),
            "message": f"Memory updated: [{category}] {key}",
        }, ensure_ascii=False)

    memory = AgentMemory(
        user_id=user_id,
        category=category,
        key=key,
        content=content,
    )
    db.add(memory)
    await db.flush()

    return json.dumps({
        "id": str(memory.id),
        "message": f"New memory saved: [{category}] {key}",
    }, ensure_ascii=False)


async def _recall_memory(
    user_id: uuid.UUID, query: str, category: str | None, db: AsyncSession
) -> str:
    stmt = select(AgentMemory).where(AgentMemory.user_id == user_id)

    if category:
        stmt = stmt.where(AgentMemory.category == category)

    if query:
        pattern = f"%{query}%"
        stmt = stmt.where(
            (AgentMemory.key.ilike(pattern)) | (AgentMemory.content.ilike(pattern))
        )

    result = await db.execute(
        stmt.order_by(AgentMemory.updated_at.desc()).limit(30)
    )
    memories = result.scalars().all()

    if not memories:
        return json.dumps({"message": "No related memories found.", "memories": []}, ensure_ascii=False)

    return json.dumps({
        "message": f"{len(memories)} memory(ies) found",
        "memories": [
            {
                "id": str(m.id),
                "category": m.category,
                "key": m.key,
                "content": m.content,
                "updated_at": m.updated_at.isoformat(),
            }
            for m in memories
        ],
    }, ensure_ascii=False)


async def _delete_memory(user_id: uuid.UUID, memory_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(AgentMemory).where(
            AgentMemory.id == uuid.UUID(memory_id),
            AgentMemory.user_id == user_id,
        )
    )
    memory = result.scalar_one_or_none()
    if not memory:
        return json.dumps({"error": "Memory not found."})

    await db.delete(memory)
    await db.flush()
    return json.dumps({
        "message": f"Memory deleted: [{memory.category}] {memory.key}",
    }, ensure_ascii=False)


# ─── Web Search / Fetch Tool Implementations ───

async def _web_search(query: str, max_results: int = 5) -> str:
    """Search the web using SearXNG (self-hosted meta search engine).

    Falls back to duckduckgo-search if SearXNG is unavailable.
    """
    import os
    import httpx

    searxng_url = os.environ.get("SEARXNG_URL", "http://searxng:8080")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{searxng_url}/search", params={
                "q": query,
                "format": "json",
                "language": "ko-KR",
                "pageno": 1,
            })
            resp.raise_for_status()
            data = resp.json()

        results = []
        for r in data.get("results", [])[:max_results]:
            results.append({
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "snippet": r.get("content", ""),
            })

        if not results:
            return json.dumps({
                "message": f"No search results for '{query}'.",
                "results": [],
            }, ensure_ascii=False)

        return json.dumps({
            "message": f"{len(results)} result(s) for '{query}'",
            "results": results,
        }, ensure_ascii=False)

    except Exception as e:
        # Fallback to DuckDuckGo if SearXNG is down
        try:
            from duckduckgo_search import DDGS
            ddgs = DDGS()
            raw_results = ddgs.text(query, max_results=max_results)
            results = []
            for r in raw_results:
                results.append({
                    "title": r.get("title", ""),
                    "url": r.get("href", ""),
                    "snippet": r.get("body", ""),
                })
            return json.dumps({
                "message": f"{len(results)} result(s) for '{query}' (fallback)",
                "results": results,
            }, ensure_ascii=False)
        except Exception as e2:
            return json.dumps({
                "error": f"Web search error: SearXNG={str(e)}, DDG={str(e2)}",
            }, ensure_ascii=False)


import ipaddress
import re as _re
import socket
from urllib.parse import urlparse

_BLOCKED_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "[::1]"}
_PRIVATE_NETS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]


def _is_blocked_ip(addr: ipaddress._BaseAddress) -> bool:
    return (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_multicast
        or addr.is_reserved
        or addr.is_unspecified
    )


def _is_private_url(url: str) -> bool:
    """Check if URL points to a private/internal network address."""
    try:
        parsed = urlparse(url)
        host = parsed.hostname or ""
        if not host:
            return True
        if host in _BLOCKED_HOSTS:
            return True
        try:
            addr = ipaddress.ip_address(host)
            return any(addr in net for net in _PRIVATE_NETS) or _is_blocked_ip(addr)
        except ValueError:
            try:
                infos = socket.getaddrinfo(host, None)
            except socket.gaierror:
                return True
            for info in infos:
                raw_ip = info[4][0]
                try:
                    resolved = ipaddress.ip_address(raw_ip)
                except ValueError:
                    continue
                if any(resolved in net for net in _PRIVATE_NETS) or _is_blocked_ip(resolved):
                    return True
            return False
    except Exception:
        return False


async def _web_fetch(url: str, max_length: int = 3000) -> str:
    """Fetch a web page and extract its text content."""
    import httpx
    from bs4 import BeautifulSoup

    try:
        # Validate URL scheme
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return json.dumps({
                "error": "Only http or https URLs are supported.",
            }, ensure_ascii=False)

        # Block internal network access
        if _is_private_url(url):
            return json.dumps({
                "error": "Cannot access internal network addresses.",
            }, ensure_ascii=False)

        async with httpx.AsyncClient(
            timeout=15.0,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; MartaniBot/1.0)"},
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()

        content_type = resp.headers.get("content-type", "")
        if "text/html" not in content_type and "text/plain" not in content_type:
            return json.dumps({
                "error": f"Non-HTML/text content type: {content_type}",
            }, ensure_ascii=False)

        soup = BeautifulSoup(resp.text, "html.parser")

        # Remove non-content elements
        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "noscript"]):
            tag.decompose()

        # Extract page title
        title = soup.title.string.strip() if soup.title and soup.title.string else ""

        # Extract text
        text = soup.get_text(separator="\n", strip=True)
        # Collapse multiple blank lines
        text = _re.sub(r"\n{3,}", "\n\n", text)

        if len(text) > max_length:
            text = text[:max_length] + f"\n\n... (showing {max_length} of {len(soup.get_text())} total characters)"

        return json.dumps({
            "title": title,
            "url": str(resp.url),
            "content": text,
        }, ensure_ascii=False)

    except httpx.HTTPStatusError as e:
        return json.dumps({
            "error": f"HTTP error {e.response.status_code}: {url}",
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({
            "error": f"Failed to fetch web page: {str(e)}",
        }, ensure_ascii=False)


async def _web_screenshot(
    url: str,
    filename: str,
    folder: str,
    full_page: bool,
    user_id: uuid.UUID,
    db: AsyncSession,
) -> str:
    """Capture a web page screenshot and save to user's storage."""
    import io
    from app.services.storage.minio_service import get_minio_service

    try:
        # Validate URL scheme
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return json.dumps({
                "error": "Only http or https URLs are supported.",
            }, ensure_ascii=False)

        # Block internal network access (SSRF prevention)
        if _is_private_url(url):
            return json.dumps({
                "error": "Cannot access internal network addresses.",
            }, ensure_ascii=False)

        # Ensure filename ends with .png
        if not filename.lower().endswith(".png"):
            filename += ".png"

        # Capture screenshot using Playwright
        from patchright.async_api import async_playwright

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page(viewport={"width": 1280, "height": 720})
            await page.goto(url, wait_until="networkidle", timeout=30000)
            screenshot_bytes = await page.screenshot(full_page=full_page)
            await browser.close()

        # Save to MinIO
        minio = get_minio_service()
        storage_filename = f"{uuid.uuid4()}_{filename}"
        storage_path = f"{user_id}/{storage_filename}"

        minio.client.put_object(
            minio.bucket,
            storage_path,
            io.BytesIO(screenshot_bytes),
            len(screenshot_bytes),
            content_type="image/png",
        )

        # Create File record
        new_file = File(
            user_id=user_id,
            filename=storage_filename,
            original_filename=filename,
            mime_type="image/png",
            size=len(screenshot_bytes),
            storage_path=storage_path,
            folder=folder,
        )
        db.add(new_file)
        await db.flush()

        return json.dumps({
            "__image_block__": True,
            "id": str(new_file.id),
            "name": filename,
            "url": url,
            "message": f"Screenshot captured and saved as '{filename}'.",
        }, ensure_ascii=False)

    except Exception as e:
        return json.dumps({
            "error": f"Screenshot capture failed: {str(e)}",
        }, ensure_ascii=False)


# ─── JavaScript Execution ───

async def _execute_javascript(code: str) -> str:
    """JavaScript execution is intentionally disabled."""
    _ = code
    return json.dumps({
        "error": "execute_javascript tool is disabled for security reasons.",
        "success": False,
    }, ensure_ascii=False)


async def _list_vault_files(user_id: uuid.UUID, db: AsyncSession) -> str:
    from app.models.vault import FileVault

    result = await db.execute(
        select(FileVault).where(
            FileVault.user_id == user_id,
        ).order_by(FileVault.created_at.desc())
    )
    files = result.scalars().all()

    if not files:
        return json.dumps({
            "message": "No files backed up in the file vault.",
            "files": [],
        }, ensure_ascii=False)

    items = []
    for f in files:
        items.append({
            "id": str(f.id),
            "filename": f.original_filename,
            "size": f.original_size,
            "size_display": _human_size(f.original_size),
            "mime_type": f.original_mime_type,
            "original_folder": f.original_folder,
            "backup_date": f.created_at.isoformat(),
        })

    data = json.dumps({
        "message": f"{len(items)} file(s) backed up in the file vault.",
        "files": items,
    }, ensure_ascii=False)
    return f"{data}\n\nDo not show the raw JSON above. Summarize in a user-friendly format. Naturally describe file names, sizes, original folders, backup dates, etc."


# ─── Collection Task Tool Implementations ───

async def _create_collection_task(
    user_id: uuid.UUID, arguments: dict, db: AsyncSession
) -> str:
    from sqlalchemy import func as sa_func
    from app.models.collection_task import CollectionTask

    name = arguments.get("name", "")
    description = arguments.get("description", "")
    target_urls = arguments.get("target_urls")
    schedule_cron = arguments.get("schedule_cron")
    post_actions = arguments.get("post_actions")

    if not name or not description:
        return json.dumps({"error": "name and description are required."})

    # Validate cron if provided
    if schedule_cron:
        try:
            from croniter import croniter
            croniter(schedule_cron)
        except (ValueError, KeyError):
            return json.dumps({"error": f"Invalid cron expression: {schedule_cron}"})

    # Limit per user
    count_result = await db.execute(
        select(sa_func.count()).select_from(CollectionTask).where(
            CollectionTask.user_id == user_id,
            CollectionTask.status != "deleted",
        )
    )
    if count_result.scalar() >= 20:
        return json.dumps({"error": "Maximum 20 collection tasks allowed per user."})

    task = CollectionTask(
        user_id=user_id,
        name=name[:200],
        description=description,
        target_urls=target_urls,
        schedule_cron=schedule_cron,
        post_actions=post_actions,
    )
    db.add(task)
    await db.flush()
    await db.commit()

    result = {
        "status": "created",
        "task_id": str(task.id),
        "name": task.name,
        "message": f"Collection task '{task.name}' created successfully.",
    }
    if schedule_cron:
        result["schedule"] = schedule_cron
    if post_actions:
        result["post_actions"] = post_actions

    return json.dumps(result, ensure_ascii=False)


async def _list_collection_tasks(user_id: uuid.UUID, db: AsyncSession) -> str:
    from app.models.collection_task import CollectionTask

    result = await db.execute(
        select(CollectionTask).where(
            CollectionTask.user_id == user_id,
            CollectionTask.status != "deleted",
        ).order_by(CollectionTask.created_at.desc())
    )
    tasks = result.scalars().all()

    items = []
    for t in tasks:
        item = {
            "id": str(t.id),
            "name": t.name,
            "status": t.status,
            "schedule_cron": t.schedule_cron,
            "run_count": t.run_count,
            "last_run_at": t.last_run_at.isoformat() if t.last_run_at else None,
            "last_run_status": t.last_run_status,
            "target_urls_count": len(t.target_urls) if t.target_urls else 0,
        }
        items.append(item)

    return json.dumps({
        "tasks": items,
        "total": len(items),
    }, ensure_ascii=False)


async def _run_collection_task(
    user_id: uuid.UUID, task_id: str, db: AsyncSession
) -> str:
    from app.models.collection_task import CollectionTask

    result = await db.execute(
        select(CollectionTask).where(
            CollectionTask.id == uuid.UUID(task_id),
            CollectionTask.user_id == user_id,
            CollectionTask.status != "deleted",
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        return json.dumps({"error": "Collection task not found."})

    from app.tasks.collection import execute_collection_task
    celery_task = execute_collection_task.delay(str(task.id))

    return json.dumps({
        "status": "dispatched",
        "task_id": str(task.id),
        "celery_task_id": celery_task.id,
        "message": f"Collection task '{task.name}' has been dispatched for execution.",
    }, ensure_ascii=False)


async def _get_collection_results(
    user_id: uuid.UUID, task_id: str, limit: int, db: AsyncSession
) -> str:
    from app.models.collection_task import CollectionTask, CollectionResult

    # Verify ownership
    task_result = await db.execute(
        select(CollectionTask).where(
            CollectionTask.id == uuid.UUID(task_id),
            CollectionTask.user_id == user_id,
        )
    )
    task = task_result.scalar_one_or_none()
    if not task:
        return json.dumps({"error": "Collection task not found."})

    # Fetch results
    limit = min(limit, 50)
    result = await db.execute(
        select(CollectionResult).where(
            CollectionResult.task_id == uuid.UUID(task_id),
        ).order_by(CollectionResult.created_at.desc()).limit(limit)
    )
    results = result.scalars().all()

    items = []
    for r in results:
        items.append({
            "id": str(r.id),
            "source_url": r.source_url,
            "parsed_data": r.parsed_data,
            "created_at": r.created_at.isoformat(),
        })

    return json.dumps({
        "task_name": task.name,
        "results": items,
        "total_returned": len(items),
    }, ensure_ascii=False)


# ─── Schedule Task Tool Implementations ───

async def _list_schedule_tasks(user_id: uuid.UUID, days_ahead: int, db: AsyncSession) -> str:
    from app.models.schedule_task import ScheduleTask

    days_ahead = min(max(days_ahead, 1), 30)
    now = datetime.utcnow()
    end = now + timedelta(days=days_ahead)

    result = await db.execute(
        select(ScheduleTask).where(
            ScheduleTask.user_id == user_id,
            ScheduleTask.scheduled_at <= end,
        ).order_by(ScheduleTask.scheduled_at.asc()).limit(50)
    )
    tasks = result.scalars().all()

    if not tasks:
        return json.dumps({"message": "No scheduled tasks found.", "tasks": []}, ensure_ascii=False)

    items = []
    for t in tasks:
        item = {
            "id": str(t.id),
            "name": t.name,
            "prompt": t.prompt[:200],
            "scheduled_at": t.scheduled_at.isoformat() if t.scheduled_at else None,
            "status": t.status,
            "is_enabled": t.is_enabled,
        }
        if t.repeat_type:
            item["repeat_type"] = t.repeat_type
        if t.cron_expression:
            item["cron_expression"] = t.cron_expression
        if t.last_run_at:
            item["last_run_at"] = t.last_run_at.isoformat()
        items.append(item)

    return json.dumps({
        "message": f"{len(items)} scheduled task(s) found.",
        "tasks": items,
    }, ensure_ascii=False)


def _interval_to_cron(interval_minutes: int) -> str:
    """Convert interval_minutes to a cron expression."""
    if interval_minutes <= 0:
        return ""
    if interval_minutes < 60:
        return f"*/{interval_minutes} * * * *"
    hours = interval_minutes // 60
    if hours < 24:
        return f"0 */{hours} * * *"
    return f"0 0 */{hours // 24} * *"


async def _create_schedule_task(user_id: uuid.UUID, args: dict, db: AsyncSession) -> str:
    from app.models.schedule_task import ScheduleTask

    try:
        scheduled_at = datetime.fromisoformat(args["scheduled_at"])
    except (ValueError, KeyError):
        scheduled_at = datetime.now()

    # If scheduled_at is in the past, use current time
    if scheduled_at < datetime.now() - timedelta(hours=1):
        scheduled_at = datetime.now()

    # Convert interval_minutes → cron_expression internally
    interval_minutes = args.get("interval_minutes")
    cron_expression = None
    repeat_type = args.get("repeat_type")

    if interval_minutes and int(interval_minutes) > 0:
        cron_expression = _interval_to_cron(int(interval_minutes))
        repeat_type = None  # cron takes priority
    elif repeat_type == "hourly":
        cron_expression = f"0 * * * *"
        repeat_type = None

    task = ScheduleTask(
        user_id=user_id,
        name=args.get("name", "Untitled Task"),
        prompt=args["prompt"],
        scheduled_at=scheduled_at,
        repeat_type=repeat_type,
        cron_expression=cron_expression,
    )
    db.add(task)
    await db.flush()

    result = {
        "id": str(task.id),
        "name": task.name,
        "scheduled_at": task.scheduled_at.isoformat(),
        "message": f"Schedule task '{task.name}' has been created.",
    }
    if task.repeat_type:
        result["repeat_type"] = task.repeat_type
    if task.cron_expression:
        result["repeat_interval"] = task.cron_expression

    return json.dumps(result, ensure_ascii=False)


async def _update_schedule_task(user_id: uuid.UUID, task_id: str, args: dict, db: AsyncSession) -> str:
    from app.models.schedule_task import ScheduleTask

    result = await db.execute(
        select(ScheduleTask).where(
            ScheduleTask.id == uuid.UUID(task_id),
            ScheduleTask.user_id == user_id,
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        return json.dumps({"error": "Schedule task not found."})

    if "name" in args and args["name"] is not None:
        task.name = args["name"]
    if "prompt" in args and args["prompt"] is not None:
        task.prompt = args["prompt"]
    if "scheduled_at" in args and args["scheduled_at"] is not None:
        try:
            task.scheduled_at = datetime.fromisoformat(args["scheduled_at"])
        except ValueError:
            return json.dumps({"error": "Invalid scheduled_at format."})
    if "interval_minutes" in args:
        mins = int(args["interval_minutes"]) if args["interval_minutes"] else 0
        if mins > 0:
            task.cron_expression = _interval_to_cron(mins)
            task.repeat_type = None
        else:
            task.cron_expression = None
    if "repeat_type" in args:
        rt = args["repeat_type"]
        if rt == "hourly":
            task.cron_expression = "0 * * * *"
            task.repeat_type = None
        elif rt:
            task.repeat_type = rt
            if "interval_minutes" not in args:
                task.cron_expression = None
        else:
            task.repeat_type = None
    if "is_enabled" in args and args["is_enabled"] is not None:
        task.is_enabled = args["is_enabled"]

    task.updated_at = datetime.utcnow()
    await db.flush()

    return json.dumps({
        "id": str(task.id),
        "name": task.name,
        "message": f"Schedule task '{task.name}' has been updated.",
    }, ensure_ascii=False)


async def _delete_schedule_task(user_id: uuid.UUID, task_id: str, db: AsyncSession) -> str:
    from app.models.schedule_task import ScheduleTask

    result = await db.execute(
        select(ScheduleTask).where(
            ScheduleTask.id == uuid.UUID(task_id),
            ScheduleTask.user_id == user_id,
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        return json.dumps({"error": "Schedule task not found."})

    name = task.name
    await db.delete(task)
    await db.flush()

    return json.dumps({"message": f"Schedule task '{name}' has been deleted."}, ensure_ascii=False)
