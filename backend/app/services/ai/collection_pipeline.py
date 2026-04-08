"""Multi-model data collection pipeline.

Pipeline stages:
  1. Task Setup (Orchestrator) — design JSON schema + suggest URLs
  1.5. Search Discovery — find additional URLs via SearXNG/DDG
  2. Web Crawling — scrape pages via Crawl4AI / Scrapling
  3. Dynamic Parsing (Parser) — extract structured data from raw text
  Storage & file export handled by caller (collection task).
"""

import json
import logging
import re
from typing import Callable

from app.services.ai.llm_service import LLMService
from app.services.ai.crawl4ai_service import crawl_urls as crawl4ai_crawl_urls
from app.services.ai.scrapling_service import scrapling_crawl_urls
from app.core.settings_manager import DynamicSettings

logger = logging.getLogger(__name__)


def _build_schema_design_prompt(user_description: str, keywords: list[str] | None = None) -> str:
    """Build prompt for the orchestrator to design a JSON schema."""
    kw_hint = ""
    if keywords:
        kw_hint = f"\nKeywords provided by user: {', '.join(keywords)}\n"
    return (
        "You are a data collection architect. The user wants to collect web data.\n\n"
        f"User request: {user_description}\n"
        f"{kw_hint}\n"
        "Your task:\n"
        "1. Design a JSON schema that describes the structure of data to be collected.\n"
        "   Use JSON Schema format (type, properties, items, required).\n"
        "2. Suggest target URLs (up to 5) where this data can likely be found.\n"
        "   - Prefer RSS feeds, API endpoints, or data-rich listing pages over SPAs.\n"
        "   - For news, prefer sites like: news aggregators, RSS feeds, or news APIs.\n"
        "3. Provide brief scraping instructions for the worker.\n"
        "4. Suggest search queries (up to 3) that can find additional relevant pages.\n\n"
        "Respond ONLY with valid JSON in this exact format:\n"
        "```json\n"
        "{\n"
        '  "json_schema": { ... },\n'
        '  "target_urls": ["https://...", ...],\n'
        '  "scraping_instructions": "...",\n'
        '  "search_queries": ["query1", "query2"]\n'
        "}\n"
        "```"
    )


def _build_parse_prompt(schema: dict, raw_text: str) -> str:
    """Build prompt for the parser to extract structured data."""
    schema_str = json.dumps(schema, ensure_ascii=False, indent=2)
    # Truncate raw_text to avoid exceeding context
    truncated = raw_text[:20000] if len(raw_text) > 20000 else raw_text
    return (
        "You are a precise data extraction engine.\n\n"
        "## JSON Schema\n"
        f"```json\n{schema_str}\n```\n\n"
        "## Raw Text\n"
        f"```\n{truncated}\n```\n\n"
        "Extract all matching data from the raw text and return ONLY a valid JSON array "
        "of objects conforming to the schema above. If no data matches, return `[]`.\n"
        "Do NOT include any explanation, just the JSON array."
    )



def _extract_json_from_response(text: str) -> dict | list | None:
    """Extract JSON from LLM response, handling code fences."""
    # Try direct parse first
    text = text.strip()
    if text.startswith("```"):
        # Strip code fence
        lines = text.split("\n")
        # Remove first and last lines if they are fences
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to find JSON in the response
        import re
        json_match = re.search(r'\{[\s\S]*\}', text)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass
        # Try array
        array_match = re.search(r'\[[\s\S]*\]', text)
        if array_match:
            try:
                return json.loads(array_match.group())
            except json.JSONDecodeError:
                pass
    return None


def _expand_url_patterns(urls: list[str]) -> list[str]:
    """Expand URL patterns like [1-5] into multiple URLs.

    Supports multiple patterns per URL via cartesian product.

    Examples:
        https://example.com/list?page=[1-5]
        → page=1, page=2, ...page=5

        https://example.com/cat=[1-3]&page=[1-5]
        → cat=1&page=1, cat=1&page=2, ..., cat=3&page=5  (15 URLs)
    """
    from itertools import product

    expanded: list[str] = []
    pattern = re.compile(r'\[(\d+)-(\d+)\]')

    for url in urls:
        matches = list(pattern.finditer(url))
        if not matches:
            expanded.append(url)
            continue

        # Build ranges for each [N-M] pattern (capped at 20 each)
        ranges = []
        for m in matches:
            start = int(m.group(1))
            end = min(int(m.group(2)), start + 19)
            ranges.append(range(start, end + 1))

        # Cartesian product of all ranges
        for combo in product(*ranges):
            result = url
            # Replace in reverse order to preserve string positions
            for m, val in zip(reversed(matches), reversed(combo)):
                result = result[:m.start()] + str(val) + result[m.end():]
            expanded.append(result)

    return expanded


class PipelineResult:
    """Wraps pipeline output with failure reason tracking."""
    def __init__(self):
        self.parsed_items: list[tuple[str, list[dict]]] = []  # (url, [parsed_objects])
        self.raw_texts: list[tuple[str, str]] = []  # (url, raw_text)
        self.failure_reason: str | None = None
        self.parse_failure_count: int = 0
        self.total_crawled_count: int = 0
        self.total_input_tokens: int = 0
        self.total_output_tokens: int = 0

    def fail(self, reason: str):
        self.failure_reason = reason

    def __len__(self):
        return len(self.parsed_items)


async def run_collection_pipeline(
    task,
    settings: DynamicSettings,
    on_event: Callable | None = None,
) -> PipelineResult:
    """Execute the collection pipeline (no DB session needed).

    Stages 1-3 run without DB access. The caller saves results
    with a fresh session after this returns.

    Args:
        task: The collection task to execute (detached from session OK)
        settings: Dynamic settings with model configuration
        on_event: Optional async callback for progress events

    Returns:
        PipelineResult with parsed_items and optional failure_reason
    """
    pipeline_result = PipelineResult()

    async def emit(event_type: str, data: dict | None = None):
        if on_event:
            payload = {"type": "collection_progress", "stage": event_type}
            if data:
                payload.update(data)
            try:
                await on_event(payload)
            except Exception:
                pass

    # Resolve model names
    orchestrator_model = settings.agent_orchestrator_model or settings.openrouter_model
    parser_model = settings.agent_parser_model

    # Create LLM service (uses OpenRouter for all models via model= override)
    llm = LLMService(settings)
    usage_out: list = []

    # ─── Stage 1: Task Setup (Orchestrator) ───
    if not task.json_schema:
        await emit("schema_design", {"message": "Designing data schema..."})
        logger.info("Collection task %s: Stage 1 — schema design", task.id)

        prompt = _build_schema_design_prompt(task.description, task.keywords)
        try:
            response = await llm.chat(
                messages=[{"role": "user", "content": prompt}],
                model=orchestrator_model,
                temperature=0.3,
                max_tokens=2000,
                usage_out=usage_out,
            )
            parsed = _extract_json_from_response(response)
            if parsed and isinstance(parsed, dict):
                if "json_schema" in parsed:
                    task.json_schema = parsed["json_schema"]
                if "target_urls" in parsed and not task.target_urls:
                    task.target_urls = parsed["target_urls"]
                if "scraping_instructions" in parsed and not task.scraping_instructions:
                    task.scraping_instructions = parsed["scraping_instructions"]
                if "search_queries" in parsed:
                    task._search_queries = parsed["search_queries"]
                await emit("schema_done", {
                    "schema": task.json_schema,
                    "urls": task.target_urls,
                })
            else:
                logger.warning("Collection task %s: Stage 1 failed to parse schema", task.id)
                await emit("error", {"message": "Failed to design schema"})
                pipeline_result.fail("AI가 수집 스키마를 생성하지 못했습니다")
                return pipeline_result
        except Exception as e:
            logger.exception("Collection task %s: Stage 1 error: %s", task.id, e)
            await emit("error", {"message": f"Schema design error: {e}"})
            pipeline_result.fail(f"스키마 설계 오류: {e}")
            return pipeline_result

    # ─── Stage 1.5: Search-first discovery ───
    # Only search if user provided NO target URLs at all.
    # If user explicitly set URLs, respect them — don't dilute with search results.
    user_has_urls = bool(task.target_urls)

    search_queries = []
    if not user_has_urls:
        if hasattr(task, '_search_queries') and task._search_queries:
            search_queries = task._search_queries
        elif task.keywords or task.description:
            # Ask LLM for good search queries instead of naive concatenation
            try:
                sq_prompt = (
                    "Generate 2-3 short web search queries to find pages containing "
                    "the data described below. Return ONLY a JSON array of strings.\n\n"
                    f"Description: {task.description}\n"
                )
                if task.keywords:
                    sq_prompt += f"Keywords: {', '.join(task.keywords)}\n"
                sq_response = await llm.chat(
                    messages=[{"role": "user", "content": sq_prompt}],
                    model=orchestrator_model,
                    temperature=0.3,
                    max_tokens=200,
                    usage_out=usage_out,
                )
                sq_parsed = _extract_json_from_response(sq_response)
                if isinstance(sq_parsed, list) and all(isinstance(q, str) for q in sq_parsed):
                    search_queries = sq_parsed[:3]
            except Exception as e:
                logger.warning("Collection task %s: Search query generation failed: %s", task.id, e)

    if search_queries:
        await emit("searching", {"message": "Searching for relevant pages..."})
        logger.info("Collection task %s: Stage 1.5 — web search discovery", task.id)

        discovered_urls: list[str] = []
        for query in search_queries[:3]:
            try:
                from app.services.ai.tools import _web_search
                search_result = await _web_search(query, max_results=5)
                try:
                    sr_data = json.loads(search_result)
                    if isinstance(sr_data, list):
                        for item in sr_data:
                            url = item.get("url", "")
                            if url and url not in discovered_urls:
                                discovered_urls.append(url)
                    elif isinstance(sr_data, dict) and "results" in sr_data:
                        for item in sr_data["results"]:
                            url = item.get("url", "")
                            if url and url not in discovered_urls:
                                discovered_urls.append(url)
                except (json.JSONDecodeError, TypeError):
                    pass
            except Exception as e:
                logger.warning("Collection task %s: Search error for '%s': %s", task.id, query, e)

        if discovered_urls:
            task.target_urls = discovered_urls[:5]
            await emit("search_done", {"urls": task.target_urls})
            logger.info("Collection task %s: Discovered %d URLs via search", task.id, len(task.target_urls))

    if not task.target_urls:
        await emit("error", {"message": "No target URLs defined"})
        pipeline_result.fail("대상 URL이 지정되지 않았습니다. 검색으로도 관련 페이지를 찾지 못했습니다.")
        return pipeline_result

    # ─── Stage 1.8: URL pattern expansion ───
    # Expand [N-M] patterns in URLs (e.g., ?page=[1-5] → 5 URLs)
    MAX_URLS = 50
    original_count = len(task.target_urls)
    task.target_urls = _expand_url_patterns(task.target_urls)
    if len(task.target_urls) > MAX_URLS:
        logger.warning(
            "Collection task %s: URL expansion capped at %d (was %d)",
            task.id, MAX_URLS, len(task.target_urls),
        )
        task.target_urls = task.target_urls[:MAX_URLS]
    if len(task.target_urls) != original_count:
        logger.info(
            "Collection task %s: Expanded %d URL patterns → %d URLs",
            task.id, original_count, len(task.target_urls),
        )
        await emit("url_expanded", {"original": original_count, "expanded": len(task.target_urls)})

    # ─── Stage 2: Web Crawling ───
    engine = getattr(task, "scraping_engine", "crawl4ai") or "crawl4ai"
    await emit("scraping", {"message": f"Starting web crawling ({engine})...", "url_count": len(task.target_urls)})
    logger.info("Collection task %s: Stage 2 — crawling %d URLs with %s", task.id, len(task.target_urls), engine)

    raw_texts: list[tuple[str, str]] = []  # (url, raw_text)

    # Read crawl options from post_actions (if set)
    crawl_opts = getattr(task, "post_actions", None) or {}
    wait_for_selector = crawl_opts.get("wait_for_selector")
    scroll_to_bottom = crawl_opts.get("scroll_to_bottom", False)

    if engine == "scrapling":
        crawl_results = await scrapling_crawl_urls(
            task.target_urls, stealth=False, timeout_s=30,
        )
    elif engine == "scrapling_stealth":
        crawl_results = await scrapling_crawl_urls(
            task.target_urls, stealth=True, timeout_s=60,
        )
    else:
        crawl_results = await crawl4ai_crawl_urls(
            task.target_urls,
            timeout_ms=30000,
            wait_for_selector=wait_for_selector,
            scroll_to_bottom=scroll_to_bottom,
        )

    for cr in crawl_results:
        if cr.success and cr.markdown.strip():
            raw_texts.append((cr.url, cr.markdown.strip()))
            await emit("scraping_done", {"url": cr.url, "text_length": len(cr.markdown)})
        else:
            error_msg = cr.error or "No content"
            logger.warning("Collection task %s: No content from %s — %s", task.id, cr.url, error_msg)
            await emit("scraping_error", {"url": cr.url, "error": error_msg})

    if not raw_texts:
        await emit("error", {"message": "No data collected from any URL"})
        urls_str = ", ".join(task.target_urls[:3])
        errors = [f"{cr.url}: {cr.error}" for cr in crawl_results if cr.error]
        error_detail = "; ".join(errors[:3]) if errors else urls_str
        pipeline_result.fail(f"웹페이지에서 콘텐츠를 가져오지 못했습니다 ({error_detail})")
        return pipeline_result

    # ─── Stage 3: Dynamic Parsing (Parser) ───
    await emit("parsing", {"message": "Parsing collected data...", "count": len(raw_texts)})
    logger.info("Collection task %s: Stage 3 — parsing %d texts", task.id, len(raw_texts))

    parsed_items: list[tuple[str, list[dict]]] = []  # (url, [parsed_objects])
    parse_failures: list[str] = []  # URLs that failed to parse

    for url, raw_text in raw_texts:
        try:
            parse_prompt = _build_parse_prompt(task.json_schema, raw_text)
            response = await llm.chat(
                messages=[{"role": "user", "content": parse_prompt}],
                model=parser_model,
                temperature=0.0,
                max_tokens=4000,
                usage_out=usage_out,
            )
            parsed = _extract_json_from_response(response)
            if parsed is not None:
                if isinstance(parsed, list):
                    parsed_items.append((url, parsed))
                elif isinstance(parsed, dict):
                    parsed_items.append((url, [parsed]))
                await emit("parsing_done", {"url": url, "item_count": len(parsed_items[-1][1])})
            else:
                logger.warning("Collection task %s: Parse failed for %s", task.id, url)
                parse_failures.append(url)
                await emit("parsing_error", {"url": url, "error": "JSON 파싱 실패"})
        except Exception as e:
            logger.exception("Collection task %s: Parse error for %s: %s", task.id, url, e)
            parse_failures.append(url)
            await emit("parsing_error", {"url": url, "error": str(e)[:100]})

    if not parsed_items:
        await emit("error", {"message": "Failed to parse any collected data"})
        pipeline_result.fail("수집된 텍스트에서 구조화된 데이터를 추출하지 못했습니다")
        return pipeline_result

    # Track partial parse failures for user visibility
    if parse_failures:
        pipeline_result.parse_failure_count = len(parse_failures)
        pipeline_result.total_crawled_count = len(raw_texts)

    # Store parsed data in result (DB saving is done by caller with fresh session)
    pipeline_result.parsed_items = parsed_items
    pipeline_result.raw_texts = raw_texts
    pipeline_result.total_input_tokens = sum(u.get("prompt_tokens", 0) for u in usage_out)
    pipeline_result.total_output_tokens = sum(u.get("completion_tokens", 0) for u in usage_out)

    total_items = sum(len(items) for _, items in parsed_items)
    await emit("done", {
        "message": "Collection complete",
        "results_count": total_items,
    })

    return pipeline_result
