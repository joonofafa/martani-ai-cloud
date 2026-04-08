"""Tests for outbound webhook URL validation (SSRF mitigation)."""

import unittest

from app.core.url_safety import validate_webhook_url


class TestUrlSafety(unittest.TestCase):
    def test_blocks_loopback_hostname(self):
        with self.assertRaises(ValueError):
            validate_webhook_url("http://localhost/hook", require_https=False)

    def test_blocks_private_ip_literal(self):
        with self.assertRaises(ValueError):
            validate_webhook_url("http://10.0.0.1/x", require_https=False)

    def test_blocks_metadata_ip(self):
        with self.assertRaises(ValueError):
            validate_webhook_url("http://169.254.169.254/latest", require_https=False)

    def test_allows_public_https_example(self):
        validate_webhook_url("https://example.com/webhook", require_https=True)

    def test_http_allowed_when_https_not_required(self):
        validate_webhook_url("http://example.com/hook", require_https=False)

    def test_http_rejected_when_https_required(self):
        with self.assertRaises(ValueError):
            validate_webhook_url("http://example.com/hook", require_https=True)


if __name__ == "__main__":
    unittest.main()
