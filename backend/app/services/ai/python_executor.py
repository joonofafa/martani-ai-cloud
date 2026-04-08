"""Sandboxed Python code execution for AI Agent."""

import asyncio
import ast
import builtins
import contextlib
import io
import json
import logging

logger = logging.getLogger(__name__)

ALLOWED_MODULES = {
    "json", "re", "math", "datetime", "collections", "itertools",
    "urllib.parse", "csv", "html", "textwrap", "string", "hashlib",
    "base64", "statistics", "functools", "operator",
}

FORBIDDEN_PATTERNS = [
    "import os", "import sys", "import subprocess", "import shutil",
    "__import__", "eval(", "exec(", "compile(",
    "open(", "globals(", "locals(",
    "import socket", "import http", "import requests",
    "import asyncio",
]

MAX_OUTPUT_CHARS = 4000
TIMEOUT_SECONDS = 10


def _validate_ast(code: str) -> str | None:
    """Return error message if code contains disallowed AST patterns."""
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return f"SyntaxError: {e.msg}"

    forbidden_calls = {"eval", "exec", "compile", "open", "__import__", "globals", "locals", "input"}
    forbidden_attrs = {"__class__", "__mro__", "__subclasses__", "__globals__", "__dict__"}
    forbidden_nodes = (ast.With, ast.AsyncWith, ast.Try, ast.Raise, ast.Lambda, ast.ClassDef)

    for node in ast.walk(tree):
        if isinstance(node, forbidden_nodes):
            return f"Forbidden syntax: {type(node).__name__}"
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                top = alias.name.split(".")[0]
                if top not in ALLOWED_MODULES:
                    return f"Module '{alias.name}' is not allowed"
        if isinstance(node, ast.Attribute) and node.attr in forbidden_attrs:
            return f"Forbidden attribute access: {node.attr}"
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id in forbidden_calls:
                return f"Forbidden call: {node.func.id}()"
            if isinstance(node.func, ast.Attribute):
                owner = node.func.value
                if isinstance(owner, ast.Name) and owner.id in {"os", "sys", "subprocess", "socket"}:
                    return f"Forbidden module call: {owner.id}.{node.func.attr}()"
    return None


async def execute_python_code(code: str) -> str:
    """Execute Python code in a restricted sandbox and return results."""
    # 1. Forbidden pattern check
    for pattern in FORBIDDEN_PATTERNS:
        if pattern in code:
            return json.dumps(
                {"error": f"Forbidden: '{pattern}' is not allowed", "success": False},
                ensure_ascii=False,
            )

    ast_err = _validate_ast(code)
    if ast_err:
        return json.dumps({"error": ast_err, "success": False}, ensure_ascii=False)

    # 2. Restricted import
    original_import = builtins.__import__

    def restricted_import(name, *args, **kwargs):
        top_module = name.split(".")[0]
        if top_module not in ALLOWED_MODULES:
            raise ImportError(f"Module '{name}' is not allowed")
        return original_import(name, *args, **kwargs)

    # 3. Execute with stdout capture + timeout
    stdout_capture = io.StringIO()

    def _run():
        restricted_globals = {"__builtins__": {
            "print": print, "len": len, "range": range, "int": int, "float": float,
            "str": str, "list": list, "dict": dict, "tuple": tuple, "set": set,
            "bool": bool, "type": type, "isinstance": isinstance, "enumerate": enumerate,
            "zip": zip, "map": map, "filter": filter, "sorted": sorted, "reversed": reversed,
            "min": min, "max": max, "sum": sum, "abs": abs, "round": round,
            "any": any, "all": all, "chr": chr, "ord": ord,
            "True": True, "False": False, "None": None,
            "__import__": restricted_import,
            "hasattr": hasattr, "getattr": getattr, "setattr": setattr,
            "ValueError": ValueError, "TypeError": TypeError, "KeyError": KeyError,
            "IndexError": IndexError, "AttributeError": AttributeError,
            "Exception": Exception, "StopIteration": StopIteration,
            "ImportError": ImportError,
        }}
        with contextlib.redirect_stdout(stdout_capture):
            exec(code, restricted_globals)  # noqa: S102

    try:
        loop = asyncio.get_event_loop()
        await asyncio.wait_for(
            loop.run_in_executor(None, _run),
            timeout=TIMEOUT_SECONDS,
        )
        output = stdout_capture.getvalue()
        if len(output) > MAX_OUTPUT_CHARS:
            output = output[:MAX_OUTPUT_CHARS] + "\n[...output truncated]"
        return json.dumps({"output": output, "success": True}, ensure_ascii=False)
    except asyncio.TimeoutError:
        return json.dumps(
            {"error": "Execution timed out (10s limit)", "success": False},
            ensure_ascii=False,
        )
    except Exception as e:
        return json.dumps(
            {"error": f"{type(e).__name__}: {str(e)}", "success": False},
            ensure_ascii=False,
        )
