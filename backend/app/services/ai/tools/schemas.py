"""LLM Tool schema definitions (OpenAI format) and tool group configuration."""

import json


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

# ─── Category Management ───

CATEGORY_READ_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_categories",
            "description": "List all indexing categories for the user. Returns category names, colors, and file counts.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_indexing_stats",
            "description": "Get file indexing statistics for the current user. Returns counts of total files, completed, pending, processing, failed, and skipped. Use this when the user asks about indexing status or how many files are indexed.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]

CATEGORY_CREATE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "create_category",
            "description": "Create a new indexing category. Categories are used to organize indexed files for RAG search scoping.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Name of the category (e.g., 'Development Docs', 'Meeting Notes')",
                    },
                    "color": {
                        "type": "string",
                        "description": "Color for the category badge. One of: blue, green, red, yellow, purple, pink, orange, cyan, gray",
                        "default": "blue",
                    },
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_category",
            "description": "Delete an indexing category by its ID. This removes the category label from all associated files.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category_id": {
                        "type": "string",
                        "description": "UUID of the category to delete",
                    },
                },
                "required": ["category_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "assign_files_to_category",
            "description": "Assign files to an indexing category. Use this to organize files into categories for scoped RAG search. Get file IDs from search_files_by_name or search_files_by_content results.",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of file UUIDs to assign to the category",
                    },
                    "category_id": {
                        "type": "string",
                        "description": "UUID of the target category",
                    },
                },
                "required": ["file_ids", "category_id"],
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
    "category_read": CATEGORY_READ_TOOLS,
    "category_create": CATEGORY_CREATE_TOOLS,
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
