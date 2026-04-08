"""Tool registry service — seed, load, and cache tool metadata from DB."""

import logging
from sqlalchemy import select, delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tool_registry import ToolGroup, ToolFunction

logger = logging.getLogger(__name__)

# ─── Seed data: defines all tool groups, categories, and individual functions ───

SEED_GROUPS = [
    # (key, category, display_name, enabled_by_default, sort_order)
    ("file_read", "File Management", "File Read / List", True, 10),
    ("file_read_content", "File Management", "File Content Read", True, 11),
    ("file_create", "File Management", "File Create", True, 12),
    ("file_delete", "File Management", "File Delete", True, 13),
    ("file_move", "File Management", "File Move", True, 14),
    ("file_share", "File Management", "File Share", True, 15),
    ("file_compress", "File Management", "File Compress / Extract", True, 16),
    ("file_search_name", "File Search", "Filename Search", True, 20),
    ("file_search_content", "File Search", "Semantic Search", True, 21),
    ("mail_send", "Email", "Send Mail", True, 51),
    ("mail_manage", "Email", "Mail Management", True, 52),
    ("messenger_send", "Messenger", "Send Talk Message", True, 55),
    ("vault_credentials", "Vault", "Credential Vault Access", True, 60),
    ("vault_files", "Vault", "File Vault View", True, 61),
    ("utility", "Agent", "Utility (Date/Time)", True, 80),
    ("memory_save", "Agent", "Memory Save", True, 81),
    ("memory_read", "Agent", "Memory Read", True, 82),
    ("web_search", "Agent", "Web Search", True, 83),
    ("web_screenshot", "Agent", "Web Screenshot", True, 84),
    ("web_interaction", "Agent", "Web Interaction (Browser Automation)", False, 85),
    ("browser_cookie", "Agent", "Browser Cookie Management", False, 86),
    ("collection_read", "Data Collection", "Collection Task View", True, 90),
    ("collection_create", "Data Collection", "Collection Task Create / Run", True, 91),
    ("schedule_read", "Schedule", "Schedule View", True, 70),
    ("schedule_create", "Schedule", "Schedule Create", True, 71),
    ("schedule_manage", "Schedule", "Schedule Management", True, 72),
    ("category_read", "Indexing", "Category List", True, 25),
    ("category_create", "Indexing", "Category Create / Delete", True, 26),
    ("python_exec", "Code Execution", "Python", False, 100),
]

SEED_FUNCTIONS = [
    # (name, group_key, display_name, sort_order)
    # File Management
    ("list_files", "file_read", "List Files", 0),
    ("read_file_info", "file_read", "Read File Info", 1),
    ("read_file_content", "file_read_content", "Read File Content", 0),
    ("create_text_file", "file_create", "Create File", 0),
    ("create_folder", "file_create", "Create Folder", 1),
    ("delete_file", "file_delete", "Delete File", 0),
    ("move_file", "file_move", "Move File", 0),
    ("move_files_batch", "file_move", "Batch Move Files", 1),
    ("share_file", "file_share", "Share File", 0),
    ("compress_files", "file_compress", "Compress Files", 0),
    ("decompress_file", "file_compress", "Decompress File", 1),
    # File Search
    ("search_files_by_name", "file_search_name", "Search Files", 0),
    ("search_files_by_content", "file_search_content", "Semantic Search", 0),
    # Email
    ("send_mail", "mail_send", "Send Mail", 0),
    ("update_mail", "mail_manage", "Update Mail Status", 0),
    ("delete_mail", "mail_manage", "Delete Mail", 1),
    # Messenger
    ("send_talk_message", "messenger_send", "Send Talk Message", 0),
    # Vault
    ("list_vault_credentials", "vault_credentials", "List Credentials", 0),
    ("list_vault_files", "vault_files", "List Vault Files", 0),
    # Utility
    ("get_current_time", "utility", "Get Current Time", 0),
    # Memory
    ("save_memory", "memory_save", "Save Memory", 0),
    ("recall_memory", "memory_read", "Recall Memory", 0),
    ("delete_memory", "memory_read", "Delete Memory", 1),
    # Web
    ("web_search", "web_search", "Web Search", 0),
    ("web_fetch", "web_search", "Fetch Web Page", 1),
    ("web_screenshot", "web_screenshot", "Web Screenshot", 0),
    # Browser Automation
    ("browser_navigate", "web_interaction", "Navigate Page", 0),
    ("browser_read_page", "web_interaction", "Read Page", 1),
    ("browser_click", "web_interaction", "Click Element", 2),
    ("browser_fill", "web_interaction", "Fill Text Input", 3),
    ("browser_select", "web_interaction", "Select Dropdown", 4),
    ("browser_screenshot", "web_interaction", "Capture Page", 5),
    ("browser_login", "web_interaction", "Auto Login", 6),
    ("browser_scroll", "web_interaction", "Scroll Page", 7),
    ("browser_execute_js", "web_interaction", "Execute JS", 8),
    ("browser_wait", "web_interaction", "Wait for Element", 9),
    # Browser Cookies
    ("browser_save_cookies", "browser_cookie", "Save Cookies", 0),
    ("browser_load_cookies", "browser_cookie", "Load Cookies", 1),
    ("browser_list_cookies", "browser_cookie", "List Cookies", 2),
    ("browser_import_cookies", "browser_cookie", "Import Cookies", 3),
    ("browser_delete_cookies", "browser_cookie", "Delete Cookies", 4),
    # Schedule
    ("list_schedule_tasks", "schedule_read", "List Schedules", 0),
    ("create_schedule_task", "schedule_create", "Create Schedule Task", 0),
    ("update_schedule_task", "schedule_manage", "Update Schedule Task", 0),
    ("delete_schedule_task", "schedule_manage", "Delete Schedule Task", 1),
    # Python Execution
    ("execute_python", "python_exec", "Execute Python Code", 0),
    # Data Collection
    ("list_collection_tasks", "collection_read", "List Collection Tasks", 0),
    ("get_collection_results", "collection_read", "Get Collection Results", 1),
    ("create_collection_task", "collection_create", "Create Collection Task", 0),
    ("run_collection_task", "collection_create", "Run Collection Task", 1),
    # Indexing Categories
    ("list_categories", "category_read", "List Categories", 0),
    ("get_indexing_stats", "category_read", "Indexing Statistics", 1),
    ("create_category", "category_create", "Create Category", 0),
    ("delete_category", "category_create", "Delete Category", 1),
    ("assign_files_to_category", "category_create", "Assign Files to Category", 2),
]


# ─── In-memory cache (loaded once on startup, refreshed on admin changes) ───

_label_cache: dict[str, str] = {}
_groups_cache: list[dict] | None = None


async def seed_tool_registry(db: AsyncSession) -> None:
    """Ensure all tool groups and functions exist in DB. Upsert (add missing, update existing)."""
    # Seed groups
    seed_group_keys = {g[0] for g in SEED_GROUPS}
    seed_fn_names = {f[0] for f in SEED_FUNCTIONS}

    # Upsert groups (add missing, update existing category/display_name/enabled/sort_order)
    existing_groups = {g.key: g for g in (await db.execute(select(ToolGroup))).scalars().all()}
    for key, category, display_name, enabled, sort_order in SEED_GROUPS:
        if key not in existing_groups:
            db.add(ToolGroup(
                key=key,
                category=category,
                display_name=display_name,
                enabled=enabled,
                sort_order=sort_order,
            ))
            logger.info("Seeded tool group: %s", key)
        else:
            g = existing_groups[key]
            if (
                g.category != category
                or g.display_name != display_name
                or g.enabled != enabled
                or g.sort_order != sort_order
            ):
                g.category = category
                g.display_name = display_name
                g.enabled = enabled
                g.sort_order = sort_order
                logger.info("Updated tool group: %s", key)

    # Remove stale groups (and their functions via cascade or explicit delete)
    stale_groups = set(existing_groups.keys()) - seed_group_keys
    if stale_groups:
        await db.execute(delete(ToolFunction).where(ToolFunction.group_key.in_(stale_groups)))
        await db.execute(delete(ToolGroup).where(ToolGroup.key.in_(stale_groups)))
        logger.info("Removed stale tool groups: %s", stale_groups)

    # Upsert functions
    existing_fns = {f.name: f for f in (await db.execute(select(ToolFunction))).scalars().all()}
    for name, group_key, display_name, sort_order in SEED_FUNCTIONS:
        if name not in existing_fns:
            db.add(ToolFunction(
                name=name,
                group_key=group_key,
                display_name=display_name,
                sort_order=sort_order,
            ))
            logger.info("Seeded tool function: %s", name)
        else:
            f = existing_fns[name]
            if f.group_key != group_key or f.display_name != display_name or f.sort_order != sort_order:
                f.group_key = group_key
                f.display_name = display_name
                f.sort_order = sort_order
                logger.info("Updated tool function: %s", name)

    # Remove stale functions
    stale_fns = set(existing_fns.keys()) - seed_fn_names
    if stale_fns:
        await db.execute(delete(ToolFunction).where(ToolFunction.name.in_(stale_fns)))
        logger.info("Removed stale tool functions: %s", stale_fns)

    await db.commit()
    # Refresh cache after seeding
    await refresh_cache(db)


async def refresh_cache(db: AsyncSession) -> None:
    """Reload tool labels and groups from DB into in-memory cache."""
    global _label_cache, _groups_cache

    # Load function labels
    result = await db.execute(select(ToolFunction))
    functions = result.scalars().all()
    _label_cache = {f.name: f.display_name for f in functions}

    # Load groups with functions
    result = await db.execute(
        select(ToolGroup).order_by(ToolGroup.sort_order)
    )
    groups = result.scalars().unique().all()
    _groups_cache = [
        {
            "key": g.key,
            "category": g.category,
            "display_name": g.display_name,
            "enabled": g.enabled,
            "sort_order": g.sort_order,
            "functions": [
                {
                    "name": f.name,
                    "display_name": f.display_name,
                    "sort_order": f.sort_order,
                }
                for f in sorted(g.functions, key=lambda x: x.sort_order)
            ],
        }
        for g in groups
    ]

    logger.info("Tool registry cache refreshed: %d groups, %d functions", len(_groups_cache), len(_label_cache))


def get_tool_label(function_name: str) -> str:
    """Get human-readable label for a tool function name (from cache)."""
    return _label_cache.get(function_name, function_name)


def get_tool_groups_cached() -> list[dict]:
    """Get all tool groups with functions (from cache)."""
    return _groups_cache or []


async def get_enabled_group_keys(db: AsyncSession) -> set[str]:
    """Get set of enabled tool group keys from DB."""
    result = await db.execute(
        select(ToolGroup.key).where(ToolGroup.enabled == True)
    )
    return {row[0] for row in result.all()}
