"""Agent Executor — common tool-calling loop used by chat, ws, and autonomous tasks."""

import json
import logging
import re
import uuid as _uuid_mod
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import ChatSession, ChatMessage, MessageRole
from app.models.agent_memory import AgentMemory
from app.models.user import User
from app.models.settings import SettingsKeys
from app.services.ai.tools import get_enabled_tools, execute_tool
from app.services.ai.llm_service import LLMService
from app.core.settings_manager import get_setting_value, load_settings_from_db
from app.services.ai.browser_session import close_session as close_browser_session
from app.services.ai.token_accounting import check_quota, record_usage
from app.services.tool_registry_service import get_tool_label

logger = logging.getLogger(__name__)

# ── Tool result optimization constants ──
MAX_TOOL_RESULT_CHARS = 4000   # Max chars per single tool result
COMPACT_AFTER_ITERATION = 10   # Start compacting old results after this iteration
KEEP_RECENT_RESULTS = 6        # Keep this many recent tool results uncompacted


def _truncate_tool_result(result: str, max_chars: int = MAX_TOOL_RESULT_CHARS) -> str:
    """Truncate a tool result to max_chars, preserving JSON structure when possible."""
    if len(result) <= max_chars:
        return result
    try:
        data = json.loads(result)
        if isinstance(data, dict) and "content" in data:
            content = data["content"]
            if len(content) > max_chars - 200:
                data["content"] = content[:max_chars - 200] + "\n[...truncated]"
                data["truncated"] = True
            return json.dumps(data, ensure_ascii=False)
    except (json.JSONDecodeError, TypeError):
        pass
    return result[:max_chars] + "\n[...truncated]"


def _compact_old_tool_results(
    messages: list[dict], keep_recent: int = KEEP_RECENT_RESULTS,
) -> list[dict]:
    """Replace old tool results with compact summaries to reduce token usage."""
    tool_indices = [i for i, m in enumerate(messages) if m.get("role") == "tool"]
    if len(tool_indices) <= keep_recent:
        return messages

    old_indices = set(tool_indices[:-keep_recent])
    compacted = []
    for i, m in enumerate(messages):
        if i in old_indices:
            try:
                data = json.loads(m["content"])
                if isinstance(data, dict):
                    parts = []
                    if "url" in data:
                        parts.append(f"url={data['url']}")
                    if "title" in data:
                        parts.append(f"title={data['title']}")
                    if "error" in data:
                        parts.append(f"error={str(data['error'])[:100]}")
                    if "truncated" in data:
                        parts.append("truncated=True")
                    if "message" in data:
                        parts.append(f"message={str(data['message'])[:100]}")
                    summary = "{" + ", ".join(parts) + "} [old result compacted]"
                else:
                    summary = "[old result compacted]"
            except Exception:
                summary = "[old result compacted]"
            compacted.append({**m, "content": summary})
        else:
            compacted.append(m)
    return compacted


from app.core.agent_types import AGENT_TYPES

def _build_verification_prompt(
    tools_called: list[str],
    tool_outcomes: list[tuple[str, bool]],
    response_text: str,
) -> str:
    """Build a prompt for LLM self-verification of its response."""
    if not tools_called:
        return (
            "[SYSTEM VERIFICATION] The response claims actions were performed, but NO tools were called.\n"
            f"- Response content: {response_text[:500]}\n\n"
            "Does the response claim to have completed any action (send email, create file, etc.) "
            "without actually calling tools? "
            "If yes, respond with 'HALLUCINATION: [reason]'. If the response is appropriate "
            "(e.g., general conversation, explanation), respond with 'OK' only."
        )
    succeeded = [name for name, ok in tool_outcomes if ok]
    failed = [name for name, ok in tool_outcomes if not ok]

    # When all tools succeeded, use a lenient prompt to avoid false positives
    if succeeded and not failed:
        return (
            "[SYSTEM VERIFICATION] Compare the tool call records below with the response.\n"
            f"- Tools called: {', '.join(dict.fromkeys(tools_called))}\n"
            f"- All tools SUCCEEDED.\n"
            f"- Response content: {response_text[:500]}\n\n"
            "IMPORTANT: All tools succeeded. Only respond 'HALLUCINATION: reason' if the response "
            "explicitly CONTRADICTS the results — e.g., says 'no results found' when results were returned, "
            "or says the action 'failed' or 'could not be performed' when the tool actually succeeded.\n"
            "Do NOT flag hedging, cautious language, or uncertainty as hallucination.\n"
            "If there are no explicit contradictions, respond with 'OK' only."
        )

    return (
        "[SYSTEM VERIFICATION] Compare the tool call records below with the response.\n"
        f"- Tools called: {', '.join(dict.fromkeys(tools_called)) or 'none'}\n"
        f"- Succeeded: {', '.join(dict.fromkeys(succeeded)) or 'none'}\n"
        f"- Failed: {', '.join(dict.fromkeys(failed)) or 'none'}\n"
        f"- Response content: {response_text[:500]}\n\n"
        "Does the response accurately reflect the actual tool call results? "
        "If it claims success for tools that were never called or that failed, respond with 'HALLUCINATION: reason'. "
        "If there are no issues, respond with 'OK' only."
    )


# Error indicators in tool results
_TOOL_ERROR_INDICATORS = [
    "error", "실패", "찾을 수 없", "not found", "failed", "timeout",
    "존재하지 않", "unable to", "cannot", "exception",
]


def _is_tool_success(result: str) -> bool:
    """Check if a tool result indicates success (no error keywords in first 200 chars)."""
    if not result:
        return False
    check_text = result[:200].lower()
    return not any(indicator in check_text for indicator in _TOOL_ERROR_INDICATORS)


# Detect factual claims (file names, paths) that require tool verification
_FACTUAL_CLAIM_RE = re.compile(
    r'`[^`]+\.(?:pdf|docx?|xlsx?|pptx?|csv|txt|hwp|md)`'  # 백틱 안 파일명
    r'|/[가-힣\w]+/[가-힣\w/]+'  # 폴더 경로
    r'|\*\*`[^`]+`\*\*',  # 볼드+백틱 파일명
    re.IGNORECASE,
)


def _contains_factual_claims(text: str) -> bool:
    """Detect if response contains specific file/path claims that require tool verification."""
    return bool(_FACTUAL_CLAIM_RE.search(text))


# Detect action claims — model claims to have ALREADY performed an action (past tense)
# Must use past-tense verb forms to avoid false positives on future-tense intent
_PAST = r'(?:했|됐|되었|하였|었)'  # Common Korean past-tense suffixes
_ACTION_CLAIM_RE = re.compile(
    rf'(?:메일|이메일|email).*(?:보냈|발송{_PAST}|전송{_PAST}|sent|delivered)'
    rf'|(?:파일|file).*(?:생성{_PAST}|저장{_PAST}|삭제{_PAST}|created|saved|deleted)'
    rf'|(?:스케줄|schedule|일정).*(?:설정{_PAST}|생성{_PAST}|등록{_PAST}|created|set up)'
    rf'|(?:메모|note|memo).*(?:생성{_PAST}|작성{_PAST}|저장{_PAST}|created|saved)'
    rf'|(?:메시지|message|메신저|messenger).*(?:전송{_PAST}|보냈|발송{_PAST}|sent)'
    rf'|성공적으로.*(?:완료|처리|실행){_PAST}'
    r'|successfully.*(?:completed|sent|created|saved|deleted|executed)',
    re.IGNORECASE,
)


def _contains_action_claims(text: str) -> bool:
    """Detect if response claims to have performed an action (send, create, delete, etc.)."""
    return bool(_ACTION_CLAIM_RE.search(text))


# Detect intent claims — model promises a future action but didn't call tools
_INTENT_CLAIM_RE = re.compile(
    r'(?:메일|이메일|email|파일|file|메시지|message|메모|note|스케줄|schedule)'
    r'.*(?:하겠습니다|할게요|드리겠습니다|보내겠습니다|전송하겠습니다|작성하겠습니다|진행하겠습니다)'
    r'|(?:잠시만\s*기다려)'
    r'|(?:지금\s*(?:바로|즉시)?.*(?:보내|전송|작성|실행|검색|확인))'
    r'|(?:will\s+(?:send|create|search|check|compose|write|execute|proceed))',
    re.IGNORECASE,
)


def _contains_intent_claims(text: str) -> bool:
    """Detect if response promises a future action (intent to act without actual tool call)."""
    return bool(_INTENT_CLAIM_RE.search(text))


# Patterns to strip from LLM responses (model-specific artifacts)
_CLEANUP_PATTERNS = [
    # Entire tool-call-as-text blocks (match full block first for clean removal)
    re.compile(
        r"<[｜|]tool[▁_]calls?[▁_]begin[｜|]>\s*"
        r"(?:function[a-z_]+\s*)?"
        r"(?:```json\s*\n[^`]*```\s*)?"
        r"<[｜|]tool[▁_]calls?[▁_]end[｜|]>",
        re.DOTALL | re.IGNORECASE,
    ),
    # Individual tool call markers (singular "call" and plural "calls")
    re.compile(r"<[｜|]tool[▁_]calls?[▁_](?:begin|end)[｜|]>", re.IGNORECASE),
    re.compile(r"<[｜|]tool[▁_]sep[｜|]>", re.IGNORECASE),
    # Role markers
    re.compile(r"<[｜|](?:user|assistant|system)[▁_](?:begin|end)[｜|]>", re.IGNORECASE),
    # Function name leakage (e.g. "functionbrowser_read_page")
    re.compile(r"\bfunction[a-z]+_[a-z_]+\b"),
    # Prompt leakage
    re.compile(r"Use the results below to formulate an answer[^\n]*\n?", re.IGNORECASE),
    # XML-style function call blocks (hallucinated by some models)
    re.compile(r"<function_calls>.*?</function_calls>", re.DOTALL),
    re.compile(r"<invoke\s+name=\"[^\"]+\">.*?</invoke>", re.DOTALL),
]

# JSON code blocks that look like leaked tool call arguments
_JSON_BLOCK_RE = re.compile(r"```json\s*\n\s*\{[^`]{0,500}?\}\s*\n\s*```", re.DOTALL)
_TOOL_PARAM_KEYS = re.compile(
    r'"(?:selector|url|credential_id|max_length|wait_for|login_url|'
    r"filename|full_page|clear_first|value|label|query|text|"
    r"to_email|subject|body|file_ids|"
    r'site_name|folder_path|event_id|schedule_id|note_id|mail_id)\s*"'
)
# Bare JSON on a line that looks like tool args (no code fence)
_BARE_TOOL_JSON_RE = re.compile(
    r"^\s*\{[^\n]{0,300}?"
    r'"(?:selector|url|credential_id|max_length|wait_for|login_url|filename|full_page|clear_first|to_email|subject|body|file_ids)'
    r"[^\n]*?\}\s*$",
    re.MULTILINE,
)
# Large inline JSON arrays (raw tool result leakage, e.g. file listing)
_LARGE_JSON_ARRAY_RE = re.compile(r"^\s*\[\{.{100,}\}\]\s*$", re.MULTILINE)
# Tool result label prefix (e.g. "filelist")
_TOOL_LABEL_RE = re.compile(r"^(?:filelist|toolresult|result)\s*$", re.MULTILINE | re.IGNORECASE)
# ```tools blocks (our display-only markers — strip from LLM output to avoid hallucination loop)
_TOOLS_BLOCK_RE = re.compile(r"```tools\s*\n.*?\n\s*```", re.DOTALL)


def strip_tools_blocks(text: str) -> str:
    """Remove ```tools code blocks from text (used to clean history before sending to LLM)."""
    if not text:
        return text or ""
    return _TOOLS_BLOCK_RE.sub("", text).strip()


def _strip_model_markers(text: str) -> str:
    """Lightweight filter to remove model-specific markers from streaming tokens.

    Unlike clean_response() which does full cleanup on the final text, this only
    strips DeepSeek special tokens and role markers so they don't leak to the frontend.
    """
    if not text:
        return text or ""
    for pattern in _CLEANUP_PATTERNS:
        text = pattern.sub("", text)
    return text


# XML-style function calls hallucinated by some models (e.g. DeepSeek)
_XML_FUNC_CALL_RE = re.compile(r"<function_calls>\s*(.*?)\s*</function_calls>", re.DOTALL)
_XML_INVOKE_RE = re.compile(r'<invoke\s+name="([^"]+)">\s*(.*?)\s*</invoke>', re.DOTALL)
_XML_PARAM_RE = re.compile(r'<parameter\s+name="([^"]+)"[^>]*>(.*?)</parameter>', re.DOTALL)


def _parse_xml_tool_calls(content: str) -> list[dict] | None:
    """Parse hallucinated XML-style function calls from model text content.

    Returns a list of tool_call dicts in OpenAI format, or None if no XML calls found.
    """
    match = _XML_FUNC_CALL_RE.search(content)
    if not match:
        return None

    inner = match.group(1)
    invocations = _XML_INVOKE_RE.findall(inner)
    if not invocations:
        return None

    tool_calls = []
    for name, params_block in invocations:
        params = {}
        for pname, pvalue in _XML_PARAM_RE.findall(params_block):
            pvalue = pvalue.strip()
            if pvalue.lower() in ("true", "false"):
                params[pname] = pvalue.lower() == "true"
            else:
                try:
                    params[pname] = json.loads(pvalue)
                except (json.JSONDecodeError, ValueError):
                    params[pname] = pvalue

        tool_calls.append({
            "id": f"xmlcall_{name}_{len(tool_calls)}",
            "type": "function",
            "function": {
                "name": name,
                "arguments": json.dumps(params),
            },
        })

    return tool_calls if tool_calls else None


_PROTECTED_BLOCK_RE = re.compile(r"```(?:filelist|fileinfo)\n.*?\n```", re.DOTALL)


def clean_response(text: str) -> str:
    """Remove model-specific artifacts and prompt leakage from response text."""
    # Protect ```filelist and ```fileinfo blocks from being cleaned
    protected: dict[str, str] = {}

    def _protect(m: re.Match) -> str:
        key = f"__PB{len(protected)}__"
        protected[key] = m.group(0)
        return key

    text = _PROTECTED_BLOCK_RE.sub(_protect, text)

    for pattern in _CLEANUP_PATTERNS:
        text = pattern.sub("", text)

    # Remove JSON code blocks that contain tool parameter names
    def _strip_tool_json(match):
        if _TOOL_PARAM_KEYS.search(match.group(0)):
            return ""
        return match.group(0)

    text = _JSON_BLOCK_RE.sub(_strip_tool_json, text)
    # Remove bare JSON tool args (without code fences)
    text = _BARE_TOOL_JSON_RE.sub("", text)
    # Remove large JSON arrays (raw tool results like file listings)
    text = _LARGE_JSON_ARRAY_RE.sub("", text)
    # Remove tool result labels
    text = _TOOL_LABEL_RE.sub("", text)
    # Remove ```tools blocks (LLM may hallucinate these from history)
    text = _TOOLS_BLOCK_RE.sub("", text)
    # Collapse excessive blank lines
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Restore protected blocks
    for key, value in protected.items():
        text = text.replace(key, value)

    return text.strip()


async def _build_system_prompt(
    db: AsyncSession,
    user_id: UUID,
    agent_type: str | None,
) -> str | None:
    """Build system prompt with memory injection for an agent type."""
    agent_config = AGENT_TYPES.get(agent_type) if agent_type else None

    if agent_config:
        db_prompt = await get_setting_value(db, agent_config["prompt_key"])
        system_prompt = db_prompt if db_prompt else agent_config["default_prompt"]
    else:
        system_prompt = await get_setting_value(db, SettingsKeys.LLM_SYSTEM_PROMPT)

    # Inject tool-scope guidance
    if agent_config and agent_config.get("use_tools"):
        system_prompt = (system_prompt or "") + (
            "\n\n## 중요 규칙"
            "\n- 자신의 모델명, 버전, 제공업체를 절대 밝히지 마세요. 물어보면 'Martani AI 어시스턴트'라고만 답하세요."
            "\n- 제공된 도구(function) 목록에 없는 기능을 요청받으면, 해당 기능이 현재 지원되지 않는다고 솔직하게 안내하세요."
            "\n- 존재하지 않는 도구를 호출하거나 추측으로 만들어 내지 마세요."
            "\n- 도구 호출 시 반드시 정의된 파라미터만 사용하세요."
            "\n- **절대로 도구를 호출하지 않고 작업을 완료했다고 보고하지 마세요.** "
            "스크린샷, 파일 생성, 메일 발송, 댓글 작성, 로그인 등은 반드시 해당 도구를 호출해야 합니다."
            "\n- 도구 호출이 실패했다면, 성공했다고 거짓 보고하지 말고 실패 사실을 솔직하게 알려주세요."
            "\n- 이메일에 파일을 첨부할 때: send_email의 file_ids에 파일 ID를 전달하면 자동으로 공유 링크가 생성되어 이메일 본문에 포함됩니다."
            "\n- **절대로 JSON 형식의 도구 호출 파라미터를 응답에 포함하지 마세요.** 도구를 호출하려면 반드시 function calling을 통해 실행하세요."
            "\n- **파일 이름, URL, 검색 결과 등 사실 정보는 반드시 도구를 호출하여 확인한 후 답변하세요.** "
            "기억이나 추측으로 파일명, 폴더 경로, 검색 결과를 만들어내지 마세요."
            "\n- 도구 호출 없이도 답변 가능한 일반 대화(인사, 의견, 설명)에는 도구를 호출하지 마세요."
            "\n- 도구 호출 결과를 받았다면 반드시 그 결과를 바탕으로 답변하세요. 결과를 무시하고 다른 내용을 답변하지 마세요."
            "\n- 사용자의 질문에 도구를 통해 정확한 답을 구할 수 있다면, 일반론이나 설명이 아닌 실제 도구 호출 결과를 바탕으로 구체적인 정보를 제공하세요."
        )

    # Inject user's agent memories
    if agent_config and agent_config.get("use_tools"):
        mem_result = await db.execute(
            select(AgentMemory)
            .where(AgentMemory.user_id == user_id)
            .order_by(AgentMemory.category, AgentMemory.updated_at.desc())
            .limit(50)
        )
        memories = mem_result.scalars().all()
        if memories:
            mem_lines = [f"- [{m.category}] {m.key}: {m.content}" for m in memories]
            memory_block = (
                "\n\n## 사용자에 대해 기억하고 있는 정보\n"
                "아래는 이 사용자에 대해 이전 대화에서 저장한 장기 메모리입니다. "
                "대화 시 자연스럽게 활용하되, 메모리 내용을 그대로 읊지 마세요.\n"
                + "\n".join(mem_lines)
            )
            system_prompt = (system_prompt or "") + memory_block

    # Inject token efficiency guidelines for tool-using agents
    if agent_config and agent_config.get("use_tools"):
        system_prompt = (system_prompt or "") + (
            "\n\nTOKEN EFFICIENCY GUIDELINES:"
            "\n- When browsing, use browser_read_page with mode=\"interactive\" first to find clickable elements, then mode=\"text\" only when you need content."
            "\n- Use execute_python for data extraction, text parsing, and JSON transformation instead of asking the LLM to process raw text."
            "\n- Avoid calling browser_read_page repeatedly on the same page. Extract what you need in one call."
            "\n- Use CSS selectors to read specific page sections instead of the entire page."
        )

    return system_prompt


async def _load_enabled_tools(
    db: AsyncSession,
    agent_type: str | None,
) -> list[dict]:
    """Load enabled tools for the given agent type.

    Tries DB tool_groups first, falls back to legacy JSON config.
    """
    from app.services.tool_registry_service import get_enabled_group_keys

    # Try DB-driven tool registry first
    try:
        enabled_keys = await get_enabled_group_keys(db)
        if enabled_keys:
            return get_enabled_tools(enabled_keys=enabled_keys)
    except Exception:
        pass  # table may not exist yet; fall through to legacy

    # Legacy: read from system_settings JSON config
    agent_config = AGENT_TYPES.get(agent_type) if agent_type else None

    if agent_config:
        tools_config = await get_setting_value(db, agent_config["tools_key"])
        if not tools_config:
            tools_config = (
                await get_setting_value(db, SettingsKeys.LLM_TOOLS_CONFIG)
                if agent_config.get("use_tools")
                else None
            )
        return get_enabled_tools(tools_config)
    else:
        tools_config = await get_setting_value(db, SettingsKeys.LLM_TOOLS_CONFIG)
        return get_enabled_tools(tools_config)


async def run_agent(
    db: AsyncSession,
    user_id: UUID,
    prompt: str,
    agent_type: str | None = "file-manager",
    session_id: UUID | None = None,
    max_iterations: int = 25,
    source: str | None = None,
    source_id: UUID | None = None,
    on_event=None,
    request_user_input=None,
    skip_user_message: bool = False,
) -> str:
    """
    Execute the full agent loop: system prompt + memory + tools + LLM.

    If session_id is provided, appends user/assistant messages to that session.
    Returns the final assistant response text.

    Args:
        on_event: Optional async callback(dict) for streaming events to client.
                  Event types: token, tool_call, tool_result, done, error.
                  When None, operates in batch mode (autonomous agents).
        request_user_input: Optional async callable(str) -> str for interactive input (MFA etc).
        skip_user_message: If True, skip saving user message (caller already saved it).
    """
    from datetime import datetime, date

    # Load user for token tracking
    user_result = await db.execute(select(User).where(User.id == user_id))
    db_user: User | None = user_result.scalar_one_or_none()

    # Token quota enforcement
    if db_user:
        allowed, quota_msg = await check_quota(db, user_id)
        if not allowed:
            # Save quota message to DB so it persists after refetch
            if session_id:
                result = await db.execute(
                    select(ChatSession).where(
                        ChatSession.id == session_id,
                        ChatSession.deleted_at.is_(None),
                    )
                )
                quota_session = result.scalar_one_or_none()
                if quota_session:
                    quota_assistant_msg = ChatMessage(
                        session_id=quota_session.id,
                        role=MessageRole.ASSISTANT,
                        content=quota_msg,
                        source=source,
                    )
                    db.add(quota_assistant_msg)
                    await db.commit()
            if on_event:
                await on_event({"type": "token", "content": quota_msg})
                await on_event({"type": "done", "content": quota_msg})
            return quota_msg

    total_input_tokens = 0
    total_output_tokens = 0

    # Resolve session
    session: ChatSession | None = None
    if session_id:
        result = await db.execute(
            select(ChatSession).where(
                ChatSession.id == session_id,
                ChatSession.deleted_at.is_(None),
            )
        )
        session = result.scalar_one_or_none()

    model = session.model if session else None

    # Pre-extract session/user IDs as plain Python values for fallback save
    # Must happen BEFORE tool loop, while greenlet context is still healthy
    _pre_session_id = str(session.id) if session else None
    _pre_user_id = str(user_id)
    _pre_source = str(source) if source else ""
    _pre_source_id = str(source_id) if source_id else ""

    # Save user message (skip if caller already saved it)
    if session and not skip_user_message:
        user_msg = ChatMessage(
            session_id=session.id,
            role=MessageRole.USER,
            content=prompt,
            source=source,
            source_id=source_id,
        )
        db.add(user_msg)
        await db.flush()

    # Build chat history from session (limit to recent, strip tools blocks)
    MAX_HISTORY = 20
    history: list[dict] = []
    if session:
        msg_result = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session.id)
            .order_by(ChatMessage.created_at.desc())
            .limit(MAX_HISTORY)
        )
        history = [
            {"role": m.role.value if hasattr(m.role, 'value') else m.role, "content": strip_tools_blocks(m.content)}
            for m in reversed(msg_result.scalars().all())
        ]
    else:
        history = [{"role": "user", "content": prompt}]

    # Build system prompt & tools
    system_prompt = await _build_system_prompt(db, user_id, agent_type)
    enabled_tools = await _load_enabled_tools(db, agent_type)

    # Initialize LLM
    dyn_settings = await load_settings_from_db(db)
    llm = LLMService(dyn_settings)

    # Sync model with current LLM provider default
    if session and session.agent_type:
        current_model = getattr(llm.service, 'default_model', None)
        if current_model and session.model != current_model:
            session.model = current_model
            model = current_model
            await db.commit()

    response_text = ""
    tools_called: list[str] = []
    tool_outcomes: list[tuple[str, bool]] = []  # (tool_name, success) for hallucination check
    image_blocks: list[dict] = []
    empty_nudges = 0  # Count of "continue" nudges when model returns empty mid-task
    MAX_EMPTY_NUDGES = 2
    premature_nudges = 0  # Count of nudges when model returns summary text mid-task
    MAX_PREMATURE_NUDGES = 2
    factual_nudged = False  # Whether we already nudged for unverified factual claims
    action_nudged = False   # Whether we already nudged for action claims without tool calls
    intent_nudged = False   # Whether we already nudged for intent claims (future-tense promises)
    # Use session_id for browser persistence, else new UUID per run
    execution_id = str(session_id) if session_id else str(_uuid_mod.uuid4())

    try:
        if enabled_tools:
            logger.info("Entering tool loop: %d tools loaded for agent=%s, model=%s",
                        len(enabled_tools), agent_type, model)
            tool_messages = list(history)
            loop_exhausted = False
            verification_retries = 0
            MAX_VERIFICATION_RETRIES = 2
            for iteration in range(max_iterations):
                # Compact old tool results to save tokens
                if iteration >= COMPACT_AFTER_ITERATION:
                    tool_messages = _compact_old_tool_results(tool_messages)

                tc_mode = "auto"
                msg = await llm.chat_with_tools(
                    messages=tool_messages,
                    tools=enabled_tools,
                    model=model,
                    system_prompt=system_prompt,
                    tool_choice=tc_mode,
                    temperature=0.4,
                )
                usage = msg.pop("_usage", None)
                if usage:
                    total_input_tokens += usage.get("prompt_tokens", 0)
                    total_output_tokens += usage.get("completion_tokens", 0)
                tool_calls = msg.get("tool_calls")

                # Detect XML-style function calls hallucinated in text content
                if not tool_calls and msg.get("content"):
                    xml_calls = _parse_xml_tool_calls(msg["content"])
                    if xml_calls:
                        logger.warning("Detected XML-style function calls in text, converting: %s",
                                       [tc["function"]["name"] for tc in xml_calls])
                        tool_calls = xml_calls
                        msg["tool_calls"] = xml_calls
                        msg["content"] = _XML_FUNC_CALL_RE.sub("", msg["content"]).strip()

                logger.info("LLM response [iter=%d, tc=%s]: has_tool_calls=%s, content_len=%d",
                            iteration, tc_mode, bool(tool_calls), len(msg.get("content") or ""))

                if not tool_calls:
                    final_content = msg.get("content", "")

                    # Model returned empty mid-task — nudge it to continue
                    if not final_content and empty_nudges < MAX_EMPTY_NUDGES:
                        empty_nudges += 1
                        logger.warning("Empty response mid-task at iter=%d (nudge %d/%d), requesting continuation",
                                       iteration, empty_nudges, MAX_EMPTY_NUDGES)
                        tool_messages.append(msg)
                        tool_messages.append({
                            "role": "user",
                            "content": (
                                "[SYSTEM] Continue performing the task. "
                                "If already done, provide the result concisely."
                            ),
                        })
                        if on_event:
                            await on_event({"type": "token", "content": "작업을 계속 진행합니다...\n\n"})
                        else:
                            response_text += "작업을 계속 진행합니다...\n\n"
                        continue

                    # Premature completion guard — nudge if model returns text mid-task too early
                    # Fires when: non-empty text, tools were called, still early in the loop
                    if (final_content and tools_called and premature_nudges < MAX_PREMATURE_NUDGES
                            and iteration < 10 and len(tools_called) > 1):
                        premature_nudges += 1
                        logger.warning(
                            "Premature conclusion at iter=%d (nudge %d/%d), tools_called=%s",
                            iteration, premature_nudges, MAX_PREMATURE_NUDGES, tools_called,
                        )
                        tool_messages.append(msg)
                        tool_messages.append({
                            "role": "user",
                            "content": (
                                "[SYSTEM] If there is remaining work, continue by calling tools. "
                                "If already done, provide the result concisely."
                            ),
                        })
                        if on_event:
                            await on_event({"type": "token", "content": ""})
                        continue

                    # Factual claims guard — nudge model to verify via tools
                    # Fires when: model didn't call any tools but response contains file/path claims
                    if final_content and not tools_called and not factual_nudged and _contains_factual_claims(final_content):
                        factual_nudged = True
                        logger.warning("Factual claims without tool calls detected at iter=%d, nudging", iteration)
                        tool_messages.append(msg)
                        tool_messages.append({
                            "role": "user",
                            "content": (
                                "[SYSTEM] Your response contains specific file names or paths. "
                                "Use tools (search_files_by_content, list_files, etc.) to verify they actually exist before answering. "
                                "Do not include unverified file names or paths in your response."
                            ),
                        })
                        continue

                    # Action claim guard — model claims task completion without calling any tools
                    if (final_content and not tools_called and not action_nudged
                            and _contains_action_claims(final_content)):
                        action_nudged = True
                        logger.warning("Action claim without tool calls at iter=%d, nudging", iteration)
                        tool_messages.append(msg)
                        tool_messages.append({
                            "role": "user",
                            "content": (
                                "[SYSTEM] Your response claims to have performed an action (send, create, delete, etc.), "
                                "but you did NOT call any tools. You MUST call the appropriate tool to actually "
                                "perform the action. Do not pretend to have completed a task without using tools."
                            ),
                        })
                        continue

                    # Intent claim guard — model promises a future action but didn't call tools
                    if (final_content and not tools_called and not intent_nudged
                            and _contains_intent_claims(final_content)):
                        intent_nudged = True
                        logger.warning("Intent claim without tool calls at iter=%d, nudging", iteration)
                        tool_messages.append(msg)
                        tool_messages.append({
                            "role": "user",
                            "content": (
                                "[SYSTEM] You said you would perform an action, but you did NOT call any tools. "
                                "Do NOT announce what you are about to do — just call the tool directly. "
                                "Call the appropriate tool NOW to perform the requested action."
                            ),
                        })
                        continue

                    # Hallucination guard — LLM self-verification
                    # Verify when model claims completion (with or without tool calls)
                    # Skip if already retried too many times
                    if final_content and iteration > 0 and verification_retries < MAX_VERIFICATION_RETRIES:
                        verification_prompt = _build_verification_prompt(
                            tools_called, tool_outcomes, final_content,
                        )
                        verify_msg = await llm.chat(
                            messages=[{"role": "user", "content": verification_prompt}],
                            model=model,
                            temperature=0.0,
                        )
                        verify_result = (verify_msg or "").strip()
                        if verify_result.upper().startswith("HALLUCINATION"):
                            verification_retries += 1
                            reason = verify_result.split(":", 1)[-1].strip() if ":" in verify_result else verify_result
                            logger.warning("LLM self-verification failed (%d/%d): %s (tools_called=%s)",
                                           verification_retries, MAX_VERIFICATION_RETRIES, reason, tools_called)
                            if verification_retries >= MAX_VERIFICATION_RETRIES:
                                logger.warning("Max verification retries reached, delivering response as-is")
                                # When all tools succeeded but LLM keeps hallucinating failure,
                                # replace with factual summary so user isn't misled
                                all_ok = all(ok for _, ok in tool_outcomes)
                                if all_ok and tool_outcomes:
                                    unique_tools = list(dict.fromkeys(tools_called))
                                    final_content = (
                                        "요청하신 작업이 완료되었습니다.\n\n"
                                        f"실행된 도구: {', '.join(unique_tools)}"
                                    )
                                    logger.info("Replaced hallucinated response with factual summary (tools=%s)", unique_tools)
                            else:
                                correction = (
                                    f"[SYSTEM] Verification found inaccurate content in your response: {reason}\n"
                                    "Either call the appropriate tools to actually perform the task, or honestly explain why it could not be done."
                                )
                                tool_messages.append(msg)
                                tool_messages.append({"role": "user", "content": correction})
                                continue

                    # Append final content (don't overwrite accumulated progress)
                    if final_content:
                        response_text += final_content
                        if on_event:
                            # Strip model markers before streaming to frontend
                            stream_content = _strip_model_markers(final_content)
                            for i in range(0, len(stream_content), 20):
                                chunk = stream_content[i:i + 20]
                                await on_event({"type": "token", "content": chunk})
                    break

                # Progress content (model's intermediate status text)
                progress_content = msg.get("content", "")
                if progress_content and progress_content.strip():
                    progress_text = _strip_model_markers(progress_content.strip())
                    if not progress_text.strip():
                        pass  # All content was model markers — skip
                    elif on_event:
                        progress_text = progress_text.strip() + "\n\n"
                        # Stream to user in real-time but DON'T save — final summary is saved instead
                        for i in range(0, len(progress_text), 20):
                            chunk = progress_text[i:i + 20]
                            await on_event({"type": "token", "content": chunk})
                    else:
                        # No streaming (autonomous agents) — accumulate for later
                        response_text += progress_text.strip() + "\n\n"

                # Execute tool calls
                tool_messages.append(msg)
                for tc in tool_calls:
                    fn = tc.get("function", {})
                    tool_name = fn.get("name", "")
                    try:
                        tool_args = json.loads(fn.get("arguments", "{}"))
                    except json.JSONDecodeError:
                        tool_args = {}
                    # Handle double-serialized arguments from some models
                    if isinstance(tool_args, str):
                        try:
                            tool_args = json.loads(tool_args)
                        except (json.JSONDecodeError, TypeError):
                            tool_args = {}

                    tools_called.append(tool_name)

                    # Notify about tool call
                    if on_event:
                        await on_event({
                            "type": "tool_call",
                            "name": tool_name,
                            "display_name": get_tool_label(tool_name),
                            "arguments": tool_args,
                        })

                    result = await execute_tool(
                        name=tool_name,
                        arguments=tool_args,
                        user_id=user_id,
                        db=db,
                        execution_id=execution_id,
                        request_user_input=request_user_input,
                        prompt=prompt,
                    )
                    result = result or json.dumps({"error": "No result"})

                    # Track tool outcome for hallucination detection
                    tool_outcomes.append((tool_name, _is_tool_success(result)))

                    # Notify about tool result
                    if on_event:
                        await on_event({
                            "type": "tool_result",
                            "name": tool_name,
                            "result": result[:500],
                        })

                    # Collect image blocks from web_screenshot for post-injection
                    if tool_name in ("web_screenshot", "browser_screenshot") and "__image_block__" in result:
                        try:
                            img_data = json.loads(result)
                            if img_data.get("__image_block__"):
                                image_blocks.append(img_data)
                        except (json.JSONDecodeError, TypeError):
                            pass

                    # Handle filelist results: send to frontend via on_event, give LLM a summary
                    llm_result = result
                    if "__filelist__" in result:
                        try:
                            fl_data = json.loads(result)
                            if fl_data.get("__filelist__"):
                                items = fl_data.get("items", [])
                                # Send full filelist to frontend directly
                                if on_event:
                                    await on_event({
                                        "type": "filelist",
                                        "items": items,
                                    })
                                # Give LLM a concise summary (no raw JSON)
                                summary_lines = [f"Found {len(items)} file(s)."]
                                for it in items[:20]:
                                    line = f"- {it.get('name', '?')} ({it.get('size_display', '?')}, {it.get('folder', '/')})"
                                    if it.get('index_status'):
                                        line += f" [{it['index_status']}]"
                                    if it.get('similarity'):
                                        line += f" similarity={it['similarity']}"
                                    summary_lines.append(line)
                                if len(items) > 20:
                                    summary_lines.append(f"... and {len(items) - 20} more")
                                # Include IDs so LLM can reference them for assign_files_to_category etc
                                id_list = [it.get("id", "") for it in items]
                                summary_lines.append(f"File IDs: {json.dumps(id_list)}")
                                llm_result = "\n".join(summary_lines)
                        except (json.JSONDecodeError, TypeError):
                            pass

                    tool_messages.append({
                        "role": "tool",
                        "tool_call_id": tc.get("id", ""),
                        "content": _truncate_tool_result(llm_result),
                    })
            else:
                # for/else: loop exhausted max iterations
                loop_exhausted = True

            logger.info("Tool loop done: %d iterations, tools=%s", iteration + 1, tools_called)

            # Generate proper conclusion when tools were called
            if tools_called:
                need_summary = loop_exhausted
                # Also need summary if response has no real conclusion
                if not need_summary and not response_text.strip():
                    need_summary = True

                if need_summary:
                    logger.info("Generating final summary (loop_exhausted=%s)", loop_exhausted)
                    # Build tool outcome context for the summary
                    failed_tools = [name for name, success in tool_outcomes if not success]
                    outcome_hint = ""
                    if failed_tools:
                        outcome_hint = f" Note: The following tool calls encountered errors: {', '.join(failed_tools)}. Do not report failed tasks as completed."
                    summary_prompt = (
                        "[SYSTEM] Write a final answer to the user's original question. "
                        "Deliver only the results concisely — do not list which tools were used. "
                        "If any tasks failed, mention them briefly, but do not write a process report. "
                        "Do not call any tools." + outcome_hint
                    )
                    tool_messages.append({"role": "user", "content": summary_prompt})
                    final_msg = await llm.chat_with_tools(
                        messages=tool_messages,
                        tools=enabled_tools,
                        model=model,
                        system_prompt=system_prompt,
                        tool_choice="none",
                    )
                    usage = final_msg.pop("_usage", None)
                    if usage:
                        total_input_tokens += usage.get("prompt_tokens", 0)
                        total_output_tokens += usage.get("completion_tokens", 0)
                    summary = final_msg.get("content", "")
                    if summary and summary.strip():
                        response_text += "\n\n" + summary.strip()
                        if on_event:
                            text_to_send = "\n\n" + _strip_model_markers(summary.strip())
                            for i in range(0, len(text_to_send), 20):
                                chunk = text_to_send[i:i + 20]
                                await on_event({"type": "token", "content": chunk})
                    elif not response_text.strip():
                        tool_summary = ", ".join(dict.fromkeys(tools_called))
                        fallback = f"도구를 사용하여 작업을 시도했으나 완료하지 못했습니다. (사용된 도구: {tool_summary})"
                        response_text += fallback
                        if on_event:
                            await on_event({"type": "token", "content": fallback})

        else:
            # No tools enabled
            if on_event:
                async for chunk in llm.chat_stream(
                    messages=history, model=model, system_prompt=system_prompt,
                ):
                    cleaned_chunk = _strip_model_markers(chunk)
                    await on_event({"type": "token", "content": cleaned_chunk})
                    response_text += chunk  # accumulate original; clean_response() handles final
            else:
                response_text = await llm.chat(
                    messages=history, model=model, system_prompt=system_prompt,
                )
    except Exception as e:
        logger.exception("Agent run failed: %s", e)
        # User-friendly error message (hide raw error details)
        error_str = str(e)
        if "500" in error_str or "502" in error_str or "503" in error_str:
            error_msg = "AI 서비스에 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
        elif "timeout" in error_str.lower() or "ReadTimeout" in type(e).__name__:
            error_msg = "AI 서비스 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요."
        elif "connection" in error_str.lower():
            error_msg = "AI 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요."
        else:
            error_msg = "요청을 처리하는 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
        response_text = error_msg
        if on_event:
            try:
                await on_event({"type": "error", "message": error_msg})
            except Exception:
                pass
            # Fall through to save assistant message below instead of returning ""
        else:
            raise
    finally:
        # Always clean up browser session
        await close_browser_session(execution_id)

    # Clean response text (remove model artifacts)
    response_text = clean_response(response_text)

    # Prepend tool usage block (send function keys — frontend resolves i18n labels)
    if tools_called:
        unique_tools = list(dict.fromkeys(tools_called))
        tool_block = "```tools\n" + json.dumps(unique_tools, ensure_ascii=False) + "\n```\n\n"
        response_text = tool_block + response_text

    # Post-inject image blocks (AFTER clean_response to avoid regex stripping)
    for img in image_blocks:
        block_json = json.dumps({"id": img["id"], "name": img["name"], "url": img["url"]}, ensure_ascii=False)
        marker = f"```image\n{block_json}\n```"
        if marker not in response_text and img["id"] not in response_text:
            response_text += f"\n\n{marker}"
            if on_event:
                await on_event({"type": "token", "content": f"\n\n{marker}"})

    # Save assistant message (with connection recovery)
    # Use pre-extracted values from before the tool loop (greenlet-safe)
    _save_response_text = str(response_text) if response_text else ""
    _save_itok = int(total_input_tokens or 0)
    _save_otok = int(total_output_tokens or 0)
    _save_has_user = db_user is not None and (_save_itok + _save_otok) > 0

    message_id_str = ""
    if session:
        try:
            # Rollback any failed transaction state before saving
            try:
                await db.rollback()
            except Exception:
                pass

            assistant_msg = ChatMessage(
                session_id=session.id,
                role=MessageRole.ASSISTANT,
                content=response_text,
                source=source,
                source_id=source_id,
                input_tokens=total_input_tokens or None,
                output_tokens=total_output_tokens or None,
            )
            db.add(assistant_msg)
            session.updated_at = datetime.utcnow()

            # Update user's monthly token usage
            if db_user and (total_input_tokens or total_output_tokens):
                await record_usage(db, user_id, total_input_tokens, total_output_tokens, source="agent")

            await db.commit()
            message_id_str = str(assistant_msg.id)
        except Exception as save_err:
            logger.error("Failed to save assistant message: %s", save_err)
            # Do NOT call await db.rollback() here — greenlet may be broken
            # Fallback: subprocess with pre-extracted pure Python values (no SQLAlchemy access)
            try:
                import uuid as _uuid
                import subprocess
                import json as _json
                from app.core.config import get_settings as _get_settings

                _s = _get_settings()
                _db_url = _s.database_url.replace("postgresql+asyncpg://", "postgresql://")
                _msg_id = str(_uuid.uuid4())

                _script = _json.dumps({
                    "url": _db_url, "msg_id": _msg_id, "sid": _pre_session_id,
                    "content": _save_response_text, "source": _pre_source,
                    "source_id": _pre_source_id, "itok": _save_itok, "otok": _save_otok,
                    "uid": _pre_user_id, "has_user": _save_has_user,
                })
                _code = (
                    "import sys, json, asyncio, asyncpg\n"
                    "async def main():\n"
                    "    d = json.loads(sys.stdin.read())\n"
                    "    conn = await asyncpg.connect(d['url'])\n"
                    "    try:\n"
                    "        await conn.execute(\n"
                    "            'INSERT INTO chat_messages (id, session_id, role, content, source, source_id, input_tokens, output_tokens, created_at) '\n"
                    "            'VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, now())',\n"
                    "            d['msg_id'], d['sid'], 'assistant', d['content'],\n"
                    "            d['source'] or None, d['source_id'] or None,\n"
                    "            d['itok'] or None, d['otok'] or None)\n"
                    "        await conn.execute('UPDATE chat_sessions SET updated_at = now() WHERE id = $1::uuid', d['sid'])\n"
                    "        if d['has_user']:\n"
                    "            await conn.execute('UPDATE users SET tokens_used_month = tokens_used_month + $1 WHERE id = $2::uuid',\n"
                    "                d['itok'] + d['otok'], d['uid'])\n"
                    "        print('OK')\n"
                    "    finally:\n"
                    "        await conn.close()\n"
                    "asyncio.run(main())\n"
                )
                result = subprocess.run(
                    ["python", "-c", _code],
                    input=_script, capture_output=True, text=True, timeout=15,
                )
                if result.returncode == 0 and "OK" in result.stdout:
                    message_id_str = _msg_id
                    logger.info("Saved assistant message via subprocess fallback (msg_id=%s)", _msg_id)
                else:
                    logger.error("Subprocess fallback failed: stdout=%s stderr=%s", result.stdout, result.stderr)
            except Exception as retry_err:
                logger.error("Subprocess fallback save also failed: %s", retry_err)

    # Audit log — chat_message (session-level, summarize token usage)
    try:
        from app.services.audit_service import write_audit_log
        await write_audit_log(
            user_id=user_id,
            action="chat_message",
            resource_type="chat_session",
            resource_id=str(session_id) if session_id else None,
            detail={
                "agent_type": agent_type,
                "input_tokens": total_input_tokens,
                "output_tokens": total_output_tokens,
                "tools_called": list(dict.fromkeys(tools_called)) if tools_called else [],
            },
        )
    except Exception:
        pass

    # Always send "done" event when on_event is provided (even if session is None/deleted)
    if on_event:
        await on_event({"type": "done", "message_id": message_id_str, "content": response_text})

    return response_text
