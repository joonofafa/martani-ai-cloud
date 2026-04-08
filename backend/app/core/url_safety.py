"""Outbound URL validation (SSRF mitigation for webhooks and similar)."""

from __future__ import annotations

import ipaddress
from urllib.parse import urlparse


def validate_webhook_url(url: str, *, require_https: bool = True) -> None:
    """
    Reject URLs that are unsafe for server-initiated HTTP requests.

    Raises ValueError with a short reason if the URL must not be used.
    """
    if not url or not isinstance(url, str):
        raise ValueError("URL is required")

    raw = url.strip()
    parsed = urlparse(raw)
    scheme = (parsed.scheme or "").lower()
    if scheme not in ("http", "https"):
        raise ValueError("Only http and https URLs are allowed")

    if require_https and scheme != "https":
        raise ValueError("Only https URLs are allowed in this environment")

    host = (parsed.hostname or "").lower().strip()
    if not host:
        raise ValueError("Invalid URL: missing host")

    blocked_names = (
        "localhost",
        "127.0.0.1",
        "::1",
        "0.0.0.0",
        "metadata.google.internal",
        "metadata",
    )
    if host in blocked_names or host.endswith(".localhost"):
        raise ValueError("Loopback or local hostnames are not allowed")

    if host == "169.254.169.254" or host.startswith("169.254."):
        raise ValueError("Link-local and metadata addresses are not allowed")

    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return

    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    ):
        raise ValueError("Private or non-routable IP addresses are not allowed")
