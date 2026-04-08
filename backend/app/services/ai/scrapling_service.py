"""Scrapling-based web crawling service for collection pipeline.

Provides three fetcher tiers:
  - Fetcher: Pure HTTP with TLS fingerprint impersonation (fastest, no browser)
  - StealthyFetcher: Browser with fingerprint spoofing + Cloudflare bypass
"""

import asyncio
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class CrawlResult:
    """Simplified crawl result matching crawl4ai_service interface."""
    url: str
    markdown: str
    success: bool
    error: str | None = None


async def scrapling_crawl_urls(
    urls: list[str],
    *,
    stealth: bool = False,
    timeout_s: int = 30,
) -> list[CrawlResult]:
    """Crawl multiple URLs using Scrapling and return text content.

    Args:
        urls: List of URLs to crawl
        stealth: If True, use StealthyFetcher (browser + Cloudflare bypass)
        timeout_s: Per-URL timeout in seconds

    Returns:
        List of CrawlResult with markdown/text content
    """
    results: list[CrawlResult] = []

    for url in urls:
        try:
            text = await asyncio.wait_for(
                _fetch_single(url, stealth=stealth),
                timeout=timeout_s + 10,
            )
            if text and text.strip():
                results.append(CrawlResult(
                    url=url,
                    markdown=text[:50000],
                    success=True,
                ))
                logger.info(
                    "Scrapling%s success: %s (%d chars)",
                    " [stealth]" if stealth else "",
                    url, len(text),
                )
            else:
                results.append(CrawlResult(
                    url=url,
                    markdown="",
                    success=False,
                    error="No content extracted",
                ))
                logger.warning("Scrapling: no content from %s", url)

        except asyncio.TimeoutError:
            results.append(CrawlResult(
                url=url,
                markdown="",
                success=False,
                error="Page load timeout",
            ))
            logger.warning("Scrapling timeout: %s", url)

        except Exception as e:
            results.append(CrawlResult(
                url=url,
                markdown="",
                success=False,
                error=str(e)[:200],
            ))
            logger.warning("Scrapling error: %s — %s", url, e)

    return results


async def _fetch_single(url: str, stealth: bool = False) -> str:
    """Fetch a single URL using Scrapling (runs sync fetcher in thread pool)."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _fetch_sync, url, stealth)


def _fetch_sync(url: str, stealth: bool = False) -> str:
    """Synchronous fetch — runs in thread pool to avoid blocking."""
    if stealth:
        from scrapling.fetchers import StealthyFetcher
        page = StealthyFetcher.fetch(
            url,
            headless=True,
            network_idle=True,
            disable_resources=True,
        )
    else:
        from scrapling.fetchers import Fetcher
        page = Fetcher.get(url, stealthy_headers=True)

    # Extract text content — prefer get_text, fallback to body text
    if page is None:
        return ""

    # Try to get clean text content
    body = page.css("body")
    if body:
        # Remove script/style tags first
        for tag in page.css("script, style, nav, footer, header"):
            try:
                tag.remove()
            except Exception:
                pass

        text_parts = []
        for el in page.css("p, h1, h2, h3, h4, h5, h6, li, td, th, article, section, div"):
            t = el.css("::text").get()
            if t and t.strip():
                text_parts.append(t.strip())

        if text_parts:
            return "\n\n".join(text_parts)

    # Fallback: get all text
    all_text = page.css("body ::text").getall()
    if all_text:
        return "\n".join(t.strip() for t in all_text if t.strip())

    return ""
