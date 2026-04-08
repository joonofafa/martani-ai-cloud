"""Browser session manager for web interaction tools.

Manages Patchright browser sessions keyed by execution_id so multiple
tool calls within one agent loop share the same browser page.

Uses patchright (anti-bot Playwright fork) which patches bot-detection
vectors at the CDP level (navigator.webdriver, Runtime.enable, automation
flags, etc.) — no JS-level init scripts needed.

NOTE: context.add_init_script() causes ERR_NAME_NOT_RESOLVED in patchright
inside Docker containers. Stealth JS patches are applied via page.evaluate()
after navigation instead.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from patchright.async_api import Playwright, Browser, BrowserContext, Page

logger = logging.getLogger(__name__)

BROWSER_ARGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-blink-features=AutomationControlled",
]
DEFAULT_VIEWPORT = {"width": 1920, "height": 1080}
NAV_TIMEOUT = 30_000  # 30 seconds
ACTION_TIMEOUT = 10_000  # 10 seconds

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

# JS stealth patches applied via page.evaluate() after navigation.
# Patchright already handles navigator.webdriver at CDP level,
# these cover additional fingerprinting vectors.
STEALTH_JS = """
() => {
    // navigator.plugins — emulate typical Chrome plugins
    try {
        Object.defineProperty(navigator, 'plugins', {
            get: () => {
                const plugins = [
                    {name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format'},
                    {name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: ''},
                    {name: 'Native Client', filename: 'internal-nacl-plugin', description: ''},
                ];
                plugins.length = 3;
                return plugins;
            },
        });
    } catch(e) {}

    // navigator.languages — Korean locale
    try {
        Object.defineProperty(navigator, 'languages', {get: () => ['ko-KR', 'ko', 'en-US', 'en']});
    } catch(e) {}

    // chrome.runtime — look like a real Chrome extension env
    try {
        if (!window.chrome) window.chrome = {};
        if (!window.chrome.runtime) {
            window.chrome.runtime = { connect: function(){}, sendMessage: function(){} };
        }
    } catch(e) {}

    // WebGL vendor/renderer — realistic GPU fingerprint
    try {
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
            if (parameter === 37445) return 'Google Inc. (Intel)';
            if (parameter === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 630, OpenGL 4.5)';
            return getParameter.call(this, parameter);
        };
    } catch(e) {}

    // Permissions API — hide "denied" notification status
    try {
        const origQuery = window.Permissions?.prototype?.query;
        if (origQuery) {
            window.Permissions.prototype.query = function(parameters) {
                if (parameters.name === 'notifications') {
                    return Promise.resolve({state: Notification.permission});
                }
                return origQuery.call(this, parameters);
            };
        }
    } catch(e) {}
}
"""


class BrowserSession:
    """A lazy-initialised Patchright browser session with stealth."""

    def __init__(self) -> None:
        self._playwright: Optional["Playwright"] = None
        self._browser: Optional["Browser"] = None
        self._context: Optional["BrowserContext"] = None
        self._page: Optional["Page"] = None

    async def ensure_ready(self) -> "Page":
        """Return the active Page, launching Chromium on first call."""
        if self._page and not self._page.is_closed():
            return self._page

        if not self._playwright:
            from patchright.async_api import async_playwright
            self._playwright = await async_playwright().start()

        if not self._browser or not self._browser.is_connected():
            self._browser = await self._playwright.chromium.launch(
                headless=True,
                args=BROWSER_ARGS,
                ignore_default_args=["--enable-automation"],
            )

        if not self._context:
            self._context = await self._browser.new_context(
                viewport=DEFAULT_VIEWPORT,
                user_agent=USER_AGENT,
                locale="ko-KR",
                timezone_id="Asia/Seoul",
            )
            self._context.set_default_timeout(ACTION_TIMEOUT)
            self._context.set_default_navigation_timeout(NAV_TIMEOUT)
            # NOTE: Do NOT use add_init_script() here — it causes
            # ERR_NAME_NOT_RESOLVED in patchright inside Docker.
            # Stealth JS is applied via apply_stealth() after navigation.

        self._page = await self._context.new_page()
        return self._page

    async def load_cookies(self, cookies: list[dict]) -> None:
        """Load cookies into the browser context."""
        if self._context and cookies:
            await self._context.add_cookies(cookies)

    async def save_cookies(self, domain: str) -> list[dict]:
        """Extract cookies for a specific domain from the current context."""
        if not self._context:
            return []
        all_cookies = await self._context.cookies()
        return [c for c in all_cookies if domain in c.get("domain", "")]

    async def apply_stealth(self) -> None:
        """Apply JS stealth patches to the current page after navigation."""
        if self._page and not self._page.is_closed():
            try:
                await self._page.evaluate(STEALTH_JS)
            except Exception:
                pass  # Best-effort; patchright handles most at CDP level

    async def close(self) -> None:
        """Release all browser resources."""
        try:
            if self._context:
                await self._context.close()
        except Exception:
            pass
        try:
            if self._browser:
                await self._browser.close()
        except Exception:
            pass
        try:
            if self._playwright:
                await self._playwright.stop()
        except Exception:
            pass
        self._page = None
        self._context = None
        self._browser = None
        self._playwright = None


# ── Module-level session registry ──

_sessions: dict[str, BrowserSession] = {}
_sessions_lock = asyncio.Lock()


async def get_or_create_session(execution_id: str) -> BrowserSession:
    """Get an existing session or create a new one for the execution_id."""
    async with _sessions_lock:
        if execution_id not in _sessions:
            _sessions[execution_id] = BrowserSession()
        return _sessions[execution_id]


async def close_session(execution_id: str) -> None:
    """Close and remove the session for the given execution_id."""
    async with _sessions_lock:
        session = _sessions.pop(execution_id, None)
    if session:
        await session.close()
        logger.info("Browser session closed: %s", execution_id)
