"""Tool dispatcher — routes tool calls to implementation functions."""

import json
import uuid
from typing import Callable, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.ai.tools.core import AGENT_FOLDER, _agent_filename, _ensure_agent_folder

from app.services.ai.tools.file_tools import (
    _list_files, _read_file_info, _read_file_content,
    _search_files_by_name, _search_files_by_content,
    _create_text_file, _delete_file, _move_file, _move_files_batch,
    _create_folder, _share_file, _compress_files, _decompress_file,
)
from app.services.ai.tools.note_tools import (
    _list_notes, _read_note, _create_note, _delete_note,
    _update_note, _search_notes,
)
from app.services.ai.tools.mail_tools import (
    _send_mail, _send_talk_message, _update_mail, _delete_mail,
)
from app.services.ai.tools.memory_tools import (
    _save_memory, _recall_memory, _delete_memory,
)
from app.services.ai.tools.web_tools import (
    _web_search, _web_fetch, _web_screenshot,
)
from app.services.ai.tools.vault_tools import _list_vault_files
from app.services.ai.tools.collection_tools import (
    _create_collection_task, _list_collection_tasks,
    _run_collection_task, _get_collection_results,
)
from app.services.ai.tools.schedule_tools import (
    _list_schedule_tasks, _create_schedule_task,
    _update_schedule_task, _delete_schedule_task,
)
from app.services.ai.tools.utility_tools import _get_current_time
from app.services.ai.tools.category_tools import (
    _list_categories, _create_category, _delete_category, _assign_files_to_category,
    _get_indexing_stats,
)


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
        # Category tools
        elif name == "list_categories":
            return await _list_categories(user_id, db)
        elif name == "create_category":
            return await _create_category(user_id, arguments["name"], arguments.get("color", "blue"), db)
        elif name == "delete_category":
            return await _delete_category(user_id, arguments["category_id"], db)
        elif name == "assign_files_to_category":
            return await _assign_files_to_category(user_id, arguments["file_ids"], arguments["category_id"], db)
        elif name == "get_indexing_stats":
            return await _get_indexing_stats(user_id, db)
        else:
            return json.dumps({"error": f"Unknown tool: {name}"})
    except Exception as e:
        await db.rollback()
        return json.dumps({"error": str(e)})
