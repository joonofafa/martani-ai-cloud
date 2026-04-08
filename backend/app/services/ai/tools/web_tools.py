"""Web search, fetch, and screenshot tool implementations."""

import io
import ipaddress
import json
import re as _re
import socket
import uuid
from urllib.parse import urlparse

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file import File
from app.services.ai.tools.core import _human_size


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
