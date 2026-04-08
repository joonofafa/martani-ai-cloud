"""Browser automation tool implementations for web interaction."""

import io
import json
import logging
import socket
import uuid
from typing import Callable, Optional
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file import File
from app.models.vault import CredentialVault
from app.models.browser_cookie import BrowserCookie
from app.core.encryption import get_vault_key, encrypt_text, decrypt_text
from app.services.ai.browser_session import get_or_create_session

logger = logging.getLogger(__name__)

# ── SSRF protection ──

import ipaddress

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


def _validate_url(url: str) -> str | None:
    """Return error message if URL is invalid, else None."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        return "Only http or https URLs are supported."
    if _is_private_url(url):
        return "Cannot access internal network addresses."
    return None


# ── Common helpers ──


async def _find_element(page, *, selector: str | None = None, text: str | None = None):
    """Find an element by CSS selector or text, searching main page then all iframes.

    Prefers visible elements; falls back to hidden ones (for JS click fallback).
    Returns the element handle or None.
    """
    hidden_fallback = None

    # 1. Main page
    if selector:
        try:
            el = await page.query_selector(selector)
            if el:
                if await el.is_visible():
                    return el
                hidden_fallback = hidden_fallback or el
        except Exception:
            pass
    if text:
        try:
            el = page.get_by_text(text, exact=False).first
            if await el.count() > 0:
                if await el.is_visible():
                    return el
                hidden_fallback = hidden_fallback or el
        except Exception:
            pass

    # 2. Search iframes
    for frame in page.frames:
        if frame == page.main_frame:
            continue
        if selector:
            try:
                el = await frame.query_selector(selector)
                if el:
                    if await el.is_visible():
                        return el
                    hidden_fallback = hidden_fallback or el
            except Exception:
                continue
        if text:
            try:
                el = frame.get_by_text(text, exact=False).first
                if await el.count() > 0:
                    if await el.is_visible():
                        return el
                    hidden_fallback = hidden_fallback or el
            except Exception:
                continue

    return hidden_fallback


# ── Tool implementations ──


async def list_vault_credentials(
    user_id: uuid.UUID,
    db: AsyncSession,
) -> str:
    """List vault credentials with masked sensitive values only."""
    result = await db.execute(
        select(CredentialVault).where(
            CredentialVault.user_id == user_id,
        ).order_by(CredentialVault.site_name)
    )
    creds = result.scalars().all()

    if not creds:
        return json.dumps({
            "message": "No credentials stored in the vault.",
            "credentials": [],
        }, ensure_ascii=False)

    vault_key = await get_vault_key(db)
    items = []
    def _mask(value: str | None) -> str:
        if not value:
            return ""
        if len(value) <= 2:
            return "*" * len(value)
        return f"{value[:2]}{'*' * (len(value) - 3)}{value[-1]}"

    for c in creds:
        try:
            username = decrypt_text(c.username, vault_key)
        except Exception:
            username = "(decryption failed)"
        items.append({
            "id": str(c.id),
            "site_name": c.site_name,
            "username_masked": _mask(username),
            "password_masked": "********",
            "has_notes": bool(c.notes),
        })

    return json.dumps({
        "message": f"{len(items)} credential(s) found",
        "credentials": items,
    }, ensure_ascii=False)


async def browser_navigate(
    execution_id: str,
    url: str,
    wait_for: str = "networkidle",
    db: AsyncSession | None = None,
    user_id: uuid.UUID | None = None,
) -> str:
    """Navigate to a URL in the browser session.

    If db and user_id are provided, automatically loads saved cookies
    for the target domain before navigation.
    """
    err = _validate_url(url)
    if err:
        return json.dumps({"error": err}, ensure_ascii=False)

    session = await get_or_create_session(execution_id)
    page = await session.ensure_ready()

    # Auto-load saved cookies for the target domain
    cookie_loaded = 0
    if db and user_id:
        try:
            parsed = urlparse(url)
            hostname = parsed.hostname or ""
            # Extract root domain (e.g. "www.naver.com" -> ".naver.com")
            parts = hostname.split(".")
            if len(parts) >= 2:
                root_domain = "." + ".".join(parts[-2:])
            else:
                root_domain = hostname

            result = await db.execute(
                select(BrowserCookie).where(
                    BrowserCookie.user_id == user_id,
                    BrowserCookie.domain == root_domain,
                )
            )
            cookie_row = result.scalar_one_or_none()
            if cookie_row:
                vault_key = await get_vault_key(db)
                cookies = json.loads(decrypt_text(cookie_row.cookies_encrypted, vault_key))
                await session.load_cookies(cookies)
                cookie_loaded = len(cookies)
                logger.info("Auto-loaded %d cookies for %s", cookie_loaded, root_domain)
        except Exception as e:
            logger.warning("Failed to auto-load cookies: %s", e)

    wait_event = wait_for if wait_for in ("load", "domcontentloaded", "networkidle") else "load"

    try:
        await page.goto(url, wait_until=wait_event, timeout=30000)
        # Apply stealth JS after successful navigation
        await session.apply_stealth()
        result_data = {
            "url": page.url,
            "title": await page.title(),
            "message": f"Navigated to '{await page.title()}'.",
        }
        if cookie_loaded:
            result_data["cookies_loaded"] = cookie_loaded
        return json.dumps(result_data, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": f"Navigation failed: {str(e)}"}, ensure_ascii=False)


async def browser_read_page(
    execution_id: str,
    selector: str | None = None,
    max_length: int = 3000,
    mode: str = "text",
) -> str:
    """Read text content from the current page or a specific element.

    mode="text": Returns cleaned page text (nav/footer removed).
    mode="interactive": Returns list of clickable/input elements only.
    """
    import re

    session = await get_or_create_session(execution_id)
    page = await session.ensure_ready()

    try:
        title = await page.title()
        current_url = page.url

        # Interactive mode: return clickable/input elements summary
        if mode == "interactive":
            elements = await page.evaluate("""() => {
                const items = [];
                document.querySelectorAll(
                    'a, button, input, textarea, select, '
                    + '[role="button"], [role="link"], [onclick]'
                ).forEach((el, i) => {
                    const tag = el.tagName.toLowerCase();
                    const text = (el.innerText || el.value || el.placeholder
                                  || el.getAttribute('aria-label') || '').trim().slice(0, 80);
                    const href = el.href || '';
                    if (text || href) {
                        const rect = el.getBoundingClientRect();
                        const visible = rect.width > 0 && rect.height > 0
                            && getComputedStyle(el).visibility !== 'hidden'
                            && getComputedStyle(el).display !== 'none';
                        items.push({
                            ref: i, tag, text,
                            type: el.type || '',
                            href: href.slice(0, 200),
                            id: el.id || '',
                            cls: el.className ? String(el.className).split(' ').slice(0, 2).join(' ') : '',
                            visible: visible,
                        });
                    }
                });
                items.sort((a, b) => (b.visible ? 1 : 0) - (a.visible ? 1 : 0));
                return items.slice(0, 60);
            }""")
            return json.dumps({
                "url": current_url,
                "title": title,
                "interactive_elements": elements,
            }, ensure_ascii=False)

        if selector:
            el = await _find_element(page, selector=selector)
            if not el:
                return json.dumps({"error": f"No element found matching selector '{selector}'."}, ensure_ascii=False)
            text = (await el.inner_text()) or ""
        else:
            # Intelligent content extraction: remove nav/footer/ads, prioritize main content
            text = await page.evaluate("""() => {
                const removals = document.querySelectorAll(
                    'nav, footer, header, aside, [role="navigation"], [role="banner"], '
                    + '[role="contentinfo"], .ad, .ads, .advertisement, .cookie-banner, '
                    + '.popup, #cookie-consent, script, style, noscript, svg'
                );
                removals.forEach(el => el.remove());
                const main = document.querySelector('main, article, [role="main"], .content, #content');
                return (main || document.body).innerText;
            }""")
            text = text or ""

        # Clean up excessive whitespace
        text = re.sub(r"\n{3,}", "\n\n", text)

        # Deduplicate lines
        lines = text.split("\n")
        seen = set()
        deduped = []
        for line in lines:
            stripped = line.strip()
            if stripped and stripped not in seen:
                seen.add(stripped)
                deduped.append(line)
            elif not stripped:
                deduped.append(line)
        text = "\n".join(deduped)

        truncated = len(text) > max_length
        if truncated:
            text = text[:max_length]

        return json.dumps({
            "url": current_url,
            "title": title,
            "content": text,
            "truncated": truncated,
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": f"Failed to read page: {str(e)}"}, ensure_ascii=False)


async def browser_click(
    execution_id: str,
    selector: str | None = None,
    text: str | None = None,
) -> str:
    """Click an element by CSS selector or visible text."""
    if not selector and not text:
        return json.dumps({"error": "Either selector or text must be specified."}, ensure_ascii=False)

    session = await get_or_create_session(execution_id)
    page = await session.ensure_ready()

    try:
        el = await _find_element(page, selector=selector, text=text)
        if not el:
            target = selector or text
            return json.dumps({"error": f"No element found matching '{target}' (including iframes)."}, ensure_ascii=False)

        # 1st: Playwright native click (visibility check, 5s timeout)
        try:
            await el.click(timeout=5000)
        except Exception:
            # 2nd: JS direct click (works for hidden elements like class="blind")
            try:
                await el.evaluate("el => el.click()")
            except Exception as e2:
                return json.dumps({"error": f"Click failed: {str(e2)}"}, ensure_ascii=False)

        # Wait a bit for page changes
        await page.wait_for_timeout(1000)

        return json.dumps({
            "url": page.url,
            "title": await page.title(),
            "message": f"Element clicked. (current URL: {page.url})",
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": f"Click failed: {str(e)}"}, ensure_ascii=False)


async def browser_fill(
    execution_id: str,
    selector: str,
    value: str,
    clear_first: bool = True,
) -> str:
    """Fill a text input field with human-like typing."""
    session = await get_or_create_session(execution_id)
    page = await session.ensure_ready()

    try:
        # Try main page first, then iframes
        el = await _find_element(page, selector=selector)
        if not el:
            return json.dumps({"error": f"No input field found matching selector '{selector}' (including iframes)."}, ensure_ascii=False)
        if clear_first:
            # Clear existing value first, then type character by character
            await el.click()
            await el.fill("")
        await el.type(value, delay=80)

        return json.dumps({
            "message": "Text entered into the input field.",
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": f"Input failed: {str(e)}"}, ensure_ascii=False)


async def browser_select(
    execution_id: str,
    selector: str,
    value: str | None = None,
    label: str | None = None,
) -> str:
    """Select an option from a dropdown."""
    session = await get_or_create_session(execution_id)
    page = await session.ensure_ready()

    try:
        if label:
            await page.select_option(selector, label=label, timeout=10000)
        elif value:
            await page.select_option(selector, value=value, timeout=10000)
        else:
            return json.dumps({"error": "Either value or label must be specified."}, ensure_ascii=False)

        return json.dumps({
            "message": "Option selected.",
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": f"Selection failed: {str(e)}"}, ensure_ascii=False)


async def _analyze_screenshot_with_vision(
    screenshot_bytes: bytes,
    page_url: str,
    page_title: str,
    db: AsyncSession,
) -> str:
    """Analyze a screenshot using the vision model. Returns description or empty string."""
    try:
        from app.core.settings_manager import load_settings_from_db
        from app.services.ai.llm_service import LLMService

        settings = await load_settings_from_db(db)
        llm = LLMService(settings)

        prompt = (
            f"Analyze this web page screenshot.\n"
            f"URL: {page_url}\n"
            f"Title: {page_title}\n\n"
            "Describe in detail:\n"
            "1. Overall page layout and structure\n"
            "2. Main content (text, images, videos, etc.)\n"
            "3. Navigation menus, buttons, links, and other clickable UI elements with their positions\n"
            "4. Input fields, forms, dropdowns, and other interactive elements\n"
            "5. Popups, modals, banners, or other notable features\n"
            "Respond in Korean."
        )

        result = await llm.chat_with_vision(
            image_bytes=screenshot_bytes,
            mime_type="image/png",
            prompt=prompt,
        )
        logger.info("Vision analysis completed: %d chars (provider=%s, model=%s)",
                     len(result), llm.provider, llm.vision_model)
        return result
    except Exception as e:
        logger.warning("Vision analysis failed: %s", e)
        return ""


async def browser_screenshot(
    execution_id: str,
    user_id: uuid.UUID,
    db: AsyncSession,
    filename: str = "screenshot.png",
    full_page: bool = False,
    folder: str = "/",
) -> str:
    """Take a screenshot and analyze it with AI vision model."""
    from app.services.storage.minio_service import get_minio_service

    session = await get_or_create_session(execution_id)
    page = await session.ensure_ready()

    try:
        if not filename.lower().endswith(".png"):
            filename += ".png"

        screenshot_bytes = await page.screenshot(full_page=full_page)
        page_url = page.url
        page_title = await page.title()

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

        # Vision analysis — automatically describe the page
        vision_description = await _analyze_screenshot_with_vision(
            screenshot_bytes, page_url, page_title, db,
        )

        result = {
            "__image_block__": True,
            "id": str(new_file.id),
            "name": filename,
            "url": page_url,
            "title": page_title,
            "message": f"Screenshot '{filename}' captured and saved.",
        }
        if vision_description:
            result["vision_analysis"] = vision_description

        return json.dumps(result, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": f"Screenshot failed: {str(e)}"}, ensure_ascii=False)


async def browser_login(
    execution_id: str,
    credential_id: str,
    user_id: uuid.UUID,
    db: AsyncSession,
    login_url: str | None = None,
    request_user_input: Optional[Callable] = None,
) -> str:
    """Auto-login using vault credentials with optional MFA handling."""
    # 1. Load credential from vault
    result = await db.execute(
        select(CredentialVault).where(
            CredentialVault.id == uuid.UUID(credential_id),
            CredentialVault.user_id == user_id,
        )
    )
    cred = result.scalar_one_or_none()
    if not cred:
        return json.dumps({"error": "Credential not found."}, ensure_ascii=False)

    vault_key = await get_vault_key(db)
    try:
        username = decrypt_text(cred.username, vault_key)
        password = decrypt_text(cred.password, vault_key)
    except Exception:
        return json.dumps({"error": "Failed to decrypt credentials."}, ensure_ascii=False)

    session = await get_or_create_session(execution_id)
    page = await session.ensure_ready()

    try:
        # 2. Navigate to login URL if provided
        if login_url:
            err = _validate_url(login_url)
            if err:
                return json.dumps({"error": err}, ensure_ascii=False)
            await page.goto(login_url, wait_until="networkidle", timeout=30000)
            # Wait for JS-rendered login forms
            await page.wait_for_timeout(2000)

        # 3. Auto-detect and fill login form
        # Try common username/email field selectors (site-specific first)
        username_selectors = [
            'input#id',             # Naver
            'input#login-id',      # Naver mobile
            'input[type="email"]',
            'input[name="email"]',
            'input[name="username"]',
            'input[name="login"]',
            'input[name="user"]',
            'input[type="text"][name*="id"]',
            'input[type="text"][name*="user"]',
            'input[type="text"][name*="email"]',
            'input[type="text"]',
        ]
        password_selectors = [
            'input#pw',            # Naver
            'input[type="password"]',
            'input[name="password"]',
            'input[name="passwd"]',
            'input[name="pass"]',
        ]

        async def _find_visible_element(search_page, selectors):
            """Find first visible element matching any selector, searching frames too."""
            # Main page first
            for sel in selectors:
                try:
                    el = await search_page.query_selector(sel)
                    if el and await el.is_visible():
                        return el
                except Exception:
                    continue
            # Try iframes
            for frame in search_page.frames:
                if frame == search_page.main_frame:
                    continue
                for sel in selectors:
                    try:
                        el = await frame.query_selector(sel)
                        if el and await el.is_visible():
                            return el
                    except Exception:
                        continue
            return None

        # Fill username (human-like typing with per-key delay)
        username_filled = False
        el = await _find_visible_element(page, username_selectors)
        if el:
            await el.click()
            await el.type(username, delay=100)
            username_filled = True

        if not username_filled:
            # Read page content for diagnostics
            try:
                page_text = (await page.inner_text("body") or "")[:500]
            except Exception:
                page_text = ""
            return json.dumps({
                "error": "Could not find username/email input field in the login form.",
                "url": page.url,
                "page_preview": page_text,
            }, ensure_ascii=False)

        # Fill password (human-like typing with per-key delay)
        password_filled = False
        el = await _find_visible_element(page, password_selectors)
        if el:
            await el.click()
            await el.type(password, delay=100)
            password_filled = True

        if not password_filled:
            # Some sites show password on next step, try submit first
            submit_selectors = [
                'button[type="submit"]',
                'input[type="submit"]',
                'button:has-text("다음")',
                'button:has-text("Next")',
                'button:has-text("Continue")',
            ]
            for sel in submit_selectors:
                el = await page.query_selector(sel)
                if el and await el.is_visible():
                    await el.click()
                    await page.wait_for_timeout(2000)
                    break

            # Try password again (human-like typing)
            for sel in password_selectors:
                el = await page.query_selector(sel)
                if el and await el.is_visible():
                    await el.click()
                    await el.type(password, delay=100)
                    password_filled = True
                    break

            if not password_filled:
                return json.dumps({
                    "error": "Could not find password input field.",
                    "url": page.url,
                }, ensure_ascii=False)

        # 4. Submit login form
        submit_selectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            'button:has-text("로그인")',
            'button:has-text("Sign in")',
            'button:has-text("Log in")',
            'button:has-text("Login")',
        ]
        submitted = False
        for sel in submit_selectors:
            el = await page.query_selector(sel)
            if el and await el.is_visible():
                await el.click()
                submitted = True
                break

        if not submitted:
            # Try pressing Enter as fallback
            await page.keyboard.press("Enter")

        await page.wait_for_timeout(3000)

        # 5. Check for MFA/OTP
        mfa_indicators = [
            'input[name*="otp"]',
            'input[name*="code"]',
            'input[name*="mfa"]',
            'input[name*="totp"]',
            'input[name*="verification"]',
            'input[name*="2fa"]',
            'input[autocomplete="one-time-code"]',
        ]

        mfa_field = None
        for sel in mfa_indicators:
            el = await page.query_selector(sel)
            if el and await el.is_visible():
                mfa_field = sel
                break

        # Also check page text for MFA patterns
        mfa_text_input = None
        if not mfa_field:
            page_text = await page.inner_text("body")
            mfa_keywords = ["인증 코드", "verification code", "OTP", "2단계 인증",
                           "two-factor", "2-step", "authenticator"]
            has_mfa_text = any(kw.lower() in page_text.lower() for kw in mfa_keywords)
            if has_mfa_text:
                # Try to find any short text input that might be OTP
                inputs = await page.query_selector_all('input[type="text"], input[type="number"], input[type="tel"]')
                for inp in inputs:
                    if await inp.is_visible():
                        maxlen = await inp.get_attribute("maxlength")
                        if maxlen and int(maxlen) <= 8:
                            mfa_text_input = inp
                            break

        if (mfa_field or mfa_text_input) and request_user_input:
            otp = await request_user_input(
                f"🔐 '{cred.site_name}' 로그인에 MFA 인증 코드가 필요합니다. 코드를 입력해주세요."
            )
            if otp:
                if mfa_field:
                    await page.fill(mfa_field, otp)
                elif mfa_text_input:
                    await mfa_text_input.fill(otp)
                # Submit OTP
                await page.keyboard.press("Enter")
                await page.wait_for_timeout(3000)

        return json.dumps({
            "url": page.url,
            "title": await page.title(),
            "site_name": cred.site_name,
            "message": f"Login attempted for '{cred.site_name}'. Current page: {await page.title()}",
        }, ensure_ascii=False)

    except Exception as e:
        return json.dumps({"error": f"Login failed: {str(e)}"}, ensure_ascii=False)


# ── Cookie tools ──


async def browser_save_cookies(
    execution_id: str,
    domain: str,
    label: str | None,
    db: AsyncSession,
    user_id: uuid.UUID,
) -> str:
    """Extract cookies for a domain from the current session and save encrypted to DB."""
    session = await get_or_create_session(execution_id)
    cookies = await session.save_cookies(domain)
    if not cookies:
        return json.dumps({"success": False, "message": f"No cookies found for domain {domain}."}, ensure_ascii=False)

    vault_key = await get_vault_key(db)
    encrypted = encrypt_text(json.dumps(cookies, ensure_ascii=False), vault_key)

    # Upsert (user_id + domain unique)
    result = await db.execute(
        select(BrowserCookie).where(
            BrowserCookie.user_id == user_id,
            BrowserCookie.domain == domain,
        )
    )
    row = result.scalar_one_or_none()
    if row:
        row.cookies_encrypted = encrypted
        row.label = label or row.label
    else:
        db.add(BrowserCookie(
            user_id=user_id,
            domain=domain,
            label=label,
            cookies_encrypted=encrypted,
        ))
    await db.commit()
    return json.dumps({"success": True, "cookie_count": len(cookies), "domain": domain}, ensure_ascii=False)


async def browser_load_cookies(
    execution_id: str,
    domain: str,
    db: AsyncSession,
    user_id: uuid.UUID,
) -> str:
    """Load saved cookies for a domain into the current browser session."""
    result = await db.execute(
        select(BrowserCookie).where(
            BrowserCookie.user_id == user_id,
            BrowserCookie.domain == domain,
        )
    )
    cookie_row = result.scalar_one_or_none()
    if not cookie_row:
        return json.dumps({"success": False, "message": f"No saved cookies found for domain {domain}."}, ensure_ascii=False)

    vault_key = await get_vault_key(db)
    cookies = json.loads(decrypt_text(cookie_row.cookies_encrypted, vault_key))

    session = await get_or_create_session(execution_id)
    await session.ensure_ready()
    await session.load_cookies(cookies)
    return json.dumps({"success": True, "cookie_count": len(cookies), "domain": domain}, ensure_ascii=False)


async def browser_list_cookies(
    db: AsyncSession,
    user_id: uuid.UUID,
) -> str:
    """List saved cookie domains (no cookie values exposed)."""
    result = await db.execute(
        select(BrowserCookie).where(BrowserCookie.user_id == user_id)
    )
    rows = result.scalars().all()
    items = [
        {"domain": r.domain, "label": r.label, "updated_at": r.updated_at.isoformat() if r.updated_at else None}
        for r in rows
    ]
    return json.dumps({"cookies": items, "count": len(items)}, ensure_ascii=False)


async def browser_import_cookies(
    domain: str,
    label: str | None,
    cookies_json: str,
    db: AsyncSession,
    user_id: uuid.UUID,
) -> str:
    """Import user-provided cookie JSON (e.g. from browser extension export)."""
    try:
        cookies = json.loads(cookies_json)
        if not isinstance(cookies, list):
            return json.dumps({"error": "Cookie JSON must be an array."}, ensure_ascii=False)
    except json.JSONDecodeError as e:
        return json.dumps({"error": f"Cookie JSON parse failed: {str(e)}"}, ensure_ascii=False)

    vault_key = await get_vault_key(db)
    encrypted = encrypt_text(json.dumps(cookies, ensure_ascii=False), vault_key)

    # Upsert
    result = await db.execute(
        select(BrowserCookie).where(
            BrowserCookie.user_id == user_id,
            BrowserCookie.domain == domain,
        )
    )
    row = result.scalar_one_or_none()
    if row:
        row.cookies_encrypted = encrypted
        row.label = label or row.label
    else:
        db.add(BrowserCookie(
            user_id=user_id,
            domain=domain,
            label=label,
            cookies_encrypted=encrypted,
        ))
    await db.commit()
    return json.dumps({"success": True, "cookie_count": len(cookies), "domain": domain}, ensure_ascii=False)


async def browser_delete_cookies(
    domain: str,
    db: AsyncSession,
    user_id: uuid.UUID,
) -> str:
    """Delete saved cookies for a domain."""
    result = await db.execute(
        select(BrowserCookie).where(
            BrowserCookie.user_id == user_id,
            BrowserCookie.domain == domain,
        )
    )
    row = result.scalar_one_or_none()
    if not row:
        return json.dumps({"success": False, "message": f"No saved cookies found for domain {domain}."}, ensure_ascii=False)

    await db.delete(row)
    await db.commit()
    return json.dumps({"success": True, "domain": domain}, ensure_ascii=False)


# ── New browser tools: scroll, execute_js, wait ──


async def browser_scroll(
    execution_id: str,
    direction: str = "down",
    amount: int = 500,
    selector: str | None = None,
) -> str:
    """Scroll the page by direction/amount, or scroll a specific element into view."""
    session = await get_or_create_session(execution_id)
    page = await session.ensure_ready()

    try:
        if selector:
            # Scroll specific element into view (search iframes too)
            el = await _find_element(page, selector=selector)
            if not el:
                return json.dumps({"error": f"No element found matching selector '{selector}'."}, ensure_ascii=False)
            await el.scroll_into_view_if_needed()
            return json.dumps({
                "message": f"Scrolled to make '{selector}' visible.",
                "url": page.url,
            }, ensure_ascii=False)
        else:
            # Scroll by direction and amount
            dy = amount if direction == "down" else -amount
            await page.evaluate(f"window.scrollBy(0, {dy})")
            scroll_y = await page.evaluate("window.scrollY")
            return json.dumps({
                "message": f"Scrolled {'down' if direction == 'down' else 'up'} by {amount}px.",
                "scroll_y": scroll_y,
                "url": page.url,
            }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": f"Scroll failed: {str(e)}"}, ensure_ascii=False)


async def browser_execute_js(
    execution_id: str,
    script: str,
) -> str:
    """Execute JavaScript on the current page and return the result."""
    session = await get_or_create_session(execution_id)
    page = await session.ensure_ready()

    try:
        result = await page.evaluate(script)
        # Serialize result to JSON
        try:
            result_str = json.dumps(result, ensure_ascii=False, default=str)
        except (TypeError, ValueError):
            result_str = str(result)

        return json.dumps({
            "result": result_str,
            "message": "JavaScript executed.",
            "url": page.url,
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": f"JS execution failed: {str(e)}"}, ensure_ascii=False)


async def browser_wait(
    execution_id: str,
    selector: str,
    timeout: int = 10000,
    state: str = "visible",
) -> str:
    """Wait for an element to appear. Searches main page then iframes."""
    session = await get_or_create_session(execution_id)
    page = await session.ensure_ready()

    valid_states = ("visible", "attached", "hidden")
    if state not in valid_states:
        state = "visible"

    try:
        # Try main page first
        try:
            await page.wait_for_selector(selector, state=state, timeout=timeout)
            return json.dumps({
                "message": f"Element '{selector}' reached '{state}' state.",
                "url": page.url,
                "found_in": "main_page",
            }, ensure_ascii=False)
        except Exception:
            pass

        # Try each iframe
        for frame in page.frames:
            if frame == page.main_frame:
                continue
            try:
                await frame.wait_for_selector(selector, state=state, timeout=min(timeout, 3000))
                return json.dumps({
                    "message": f"Element '{selector}' reached '{state}' state in iframe.",
                    "url": page.url,
                    "found_in": "iframe",
                }, ensure_ascii=False)
            except Exception:
                continue

        return json.dumps({
            "error": f"Element '{selector}' not found within {timeout}ms (including iframes).",
            "url": page.url,
        }, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": f"Wait failed: {str(e)}"}, ensure_ascii=False)
