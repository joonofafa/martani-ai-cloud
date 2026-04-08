"""Crawl4AI-based web crawling service for collection pipeline.

Replaces the LLM-driven browser tool calling approach with direct
Crawl4AI crawling for better speed and content extraction quality.
"""

import asyncio
import logging
from dataclasses import dataclass

from crawl4ai import (
    AsyncWebCrawler,
    BrowserConfig,
    CrawlerRunConfig,
    CacheMode,
)

logger = logging.getLogger(__name__)


@dataclass
class CrawlResult:
    """Simplified crawl result for the collection pipeline."""
    url: str
    markdown: str
    success: bool
    error: str | None = None


async def crawl_urls(
    urls: list[str],
    *,
    timeout_ms: int = 30000,
    wait_until: str = "networkidle",
    wait_for_selector: str | None = None,
    scroll_to_bottom: bool = False,
) -> list[CrawlResult]:
    """Crawl multiple URLs using Crawl4AI and return markdown content.

    Args:
        urls: List of URLs to crawl
        timeout_ms: Page load timeout in milliseconds
        wait_until: Wait condition (load, domcontentloaded, networkidle)
        wait_for_selector: CSS selector to wait for before extracting
        scroll_to_bottom: Scroll to bottom to trigger lazy-loading

    Returns:
        List of CrawlResult with markdown content
    """
    browser_cfg = BrowserConfig(
        headless=True,
        java_script_enabled=True,
        text_mode=False,
        extra_args=[
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-blink-features=AutomationControlled",
        ],
    )

    # Build JS code for scroll-to-bottom
    combined_js = ""
    if scroll_to_bottom:
        combined_js = (
            "(async () => {"
            "  const delay = ms => new Promise(r => setTimeout(r, ms));"
            "  for (let i = 0; i < 5; i++) {"
            "    window.scrollTo(0, document.body.scrollHeight);"
            "    await delay(1000);"
            "  }"
            "  window.scrollTo(0, 0);"
            "})()"
        )

    run_cfg_kwargs: dict = {
        "cache_mode": CacheMode.BYPASS,
        "page_timeout": timeout_ms,
        "word_count_threshold": 10,
        "only_text": False,
        "process_iframes": False,
        "remove_overlay_elements": True,
    }
    if wait_for_selector:
        run_cfg_kwargs["wait_for"] = f"css:{wait_for_selector}"
    if combined_js:
        run_cfg_kwargs["js_code"] = combined_js

    run_cfg = CrawlerRunConfig(**run_cfg_kwargs)

    results: list[CrawlResult] = []

    try:
        async with AsyncWebCrawler(config=browser_cfg) as crawler:
            # Crawl URLs sequentially to avoid memory pressure in Docker
            for url in urls:
                try:
                    raw = await asyncio.wait_for(
                        crawler.arun(url=url, config=run_cfg),
                        timeout=timeout_ms / 1000 + 10,  # extra buffer
                    )
                    if raw.success:
                        # Prefer fit_markdown (filtered) > raw_markdown
                        md = ""
                        if hasattr(raw, "markdown"):
                            if hasattr(raw.markdown, "fit_markdown") and raw.markdown.fit_markdown:
                                md = raw.markdown.fit_markdown
                            elif hasattr(raw.markdown, "raw_markdown") and raw.markdown.raw_markdown:
                                md = raw.markdown.raw_markdown
                            elif isinstance(raw.markdown, str):
                                md = raw.markdown

                        if not md and hasattr(raw, "cleaned_html"):
                            md = raw.cleaned_html or ""

                        results.append(CrawlResult(
                            url=url,
                            markdown=md[:50000],  # cap at 50k chars
                            success=True,
                        ))
                        logger.info(
                            "Crawl4AI success: %s (%d chars)",
                            url, len(md),
                        )
                    else:
                        error_msg = getattr(raw, "error_message", "Unknown error")
                        results.append(CrawlResult(
                            url=url,
                            markdown="",
                            success=False,
                            error=str(error_msg)[:200],
                        ))
                        logger.warning("Crawl4AI failed: %s — %s", url, error_msg)

                except asyncio.TimeoutError:
                    results.append(CrawlResult(
                        url=url,
                        markdown="",
                        success=False,
                        error="Page load timeout",
                    ))
                    logger.warning("Crawl4AI timeout: %s", url)

                except Exception as e:
                    results.append(CrawlResult(
                        url=url,
                        markdown="",
                        success=False,
                        error=str(e)[:200],
                    ))
                    logger.warning("Crawl4AI error: %s — %s", url, e)

    except Exception as e:
        logger.error("Crawl4AI browser init failed: %s", e)
        # Return failures for all URLs
        for url in urls:
            if not any(r.url == url for r in results):
                results.append(CrawlResult(
                    url=url,
                    markdown="",
                    success=False,
                    error=f"Browser init failed: {str(e)[:100]}",
                ))

    return results
