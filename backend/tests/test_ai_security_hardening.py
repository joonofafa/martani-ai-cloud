import asyncio
import json
import unittest

from app.services.ai import browser_tools, tools
from app.services.ai.python_executor import execute_python_code


class TestAISecurityHardening(unittest.TestCase):
    def test_tools_private_url_blocks_localhost(self):
        self.assertTrue(tools._is_private_url("http://localhost:8000"))
        self.assertTrue(tools._is_private_url("http://127.0.0.1:8000"))

    def test_browser_tools_private_url_blocks_localhost(self):
        self.assertTrue(browser_tools._is_private_url("http://localhost:3000"))
        self.assertTrue(browser_tools._is_private_url("http://127.0.0.1:3000"))

    def test_python_executor_blocks_forbidden_pattern(self):
        raw = asyncio.run(execute_python_code("import os\nprint('x')"))
        data = json.loads(raw)
        self.assertFalse(data.get("success"))
        self.assertIn("Forbidden", data.get("error", ""))

    def test_python_executor_blocks_forbidden_ast(self):
        raw = asyncio.run(execute_python_code("class A:\n    pass"))
        data = json.loads(raw)
        self.assertFalse(data.get("success"))
        self.assertIn("Forbidden syntax", data.get("error", ""))

    def test_javascript_execution_is_disabled(self):
        raw = asyncio.run(tools._execute_javascript("console.log('hello')"))
        data = json.loads(raw)
        self.assertFalse(data.get("success"))
        self.assertIn("disabled", data.get("error", "").lower())


if __name__ == "__main__":
    unittest.main()
