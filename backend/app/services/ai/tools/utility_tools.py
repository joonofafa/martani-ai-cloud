"""Utility tool implementations."""

import json
from datetime import datetime


def _get_current_time() -> str:
    now = datetime.now()
    weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    return json.dumps({
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M:%S"),
        "weekday": weekdays[now.weekday()],
        "iso": now.isoformat(),
    }, ensure_ascii=False)


async def _execute_javascript(code: str) -> str:
    """JavaScript execution is intentionally disabled."""
    _ = code
    return json.dumps({
        "error": "execute_javascript tool is disabled for security reasons.",
        "success": False,
    }, ensure_ascii=False)
