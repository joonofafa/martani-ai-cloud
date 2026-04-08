"""Email service using Resend API."""

import base64
import logging
import html
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.settings_manager import get_setting_value
from app.models.settings import SettingsKeys

logger = logging.getLogger(__name__)


async def send_email(
    to: str,
    subject: str,
    body: str,
    from_name: str = "Martani",
    db: AsyncSession | None = None,
    attachments: list[dict] | None = None,
) -> bool:
    """Send a generic email via Resend API.

    Args:
        attachments: List of dicts with 'filename' (str) and 'content' (bytes).

    Returns True if sent successfully, False otherwise.
    """
    if db is None:
        return False

    api_key = await get_setting_value(db, SettingsKeys.RESEND_API_KEY)
    from_address = await get_setting_value(
        db, SettingsKeys.EMAIL_FROM_ADDRESS, "noreply@martani.cloud"
    )

    if not api_key:
        return False

    # Wrap plain text body in simple HTML
    escaped_body = html.escape(body).replace("\n", "<br/>")
    html_body = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #ffffff; border-radius: 12px; padding: 24px; border: 1px solid #e5e7eb;">
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">{escaped_body}</p>
      </div>
      <p style="color: #9ca3af; font-size: 11px; margin-top: 16px; text-align: center;">
        Sent via Martani
      </p>
    </div>
    """

    payload: dict = {
        "from": f"{from_name} <{from_address}>",
        "to": [to],
        "subject": subject,
        "html": html_body,
    }

    # Add file attachments (Resend API format: base64-encoded content)
    if attachments:
        payload["attachments"] = [
            {
                "filename": att["filename"],
                "content": base64.b64encode(att["content"]).decode("utf-8"),
            }
            for att in attachments
        ]

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=30.0,
            )
            if response.status_code == 200:
                return True
            logger.warning(
                "Resend API error: status=%s (body omitted for security)",
                response.status_code,
            )
            return False
    except Exception as e:
        logger.warning("Failed to send email: %s", type(e).__name__)
        return False


async def send_verification_email(
    to: str,
    token: str,
    frontend_url: str,
    db: AsyncSession,
) -> bool:
    """Send a verification email via Resend API.

    Returns True if sent successfully, False otherwise.
    """
    api_key = await get_setting_value(db, SettingsKeys.RESEND_API_KEY)
    from_address = await get_setting_value(
        db, SettingsKeys.EMAIL_FROM_ADDRESS, "noreply@martani.cloud"
    )

    if not api_key:
        logger.warning("Resend API key not configured, skipping email send")
        return False

    verify_url = f"{frontend_url}/verify-email?token={token}"

    html_body = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="font-size: 32px; font-weight: 800; background: linear-gradient(135deg, #2563eb, #9333ea, #ec4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Martani</h1>
      </div>
      <div style="background: #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); border: 1px solid #e5e7eb;">
        <h2 style="color: #111827; font-size: 20px; margin-bottom: 16px;">Email Verification</h2>
        <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
          Please click the button below to verify your email and complete your Martani registration.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="{verify_url}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #2563eb, #9333ea); color: #ffffff; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px;">
            Verify Email
          </a>
        </div>
        <p style="color: #9ca3af; font-size: 13px; line-height: 1.5;">
          If the button doesn't work, copy and paste the link below into your browser:<br/>
          <a href="{verify_url}" style="color: #6366f1; word-break: break-all;">{verify_url}</a>
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">
          This email must be verified within 24 hours. If you did not request this, please ignore this email.
        </p>
      </div>
    </div>
    """

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": f"Martani <{from_address}>",
                    "to": [to],
                    "subject": "[Martani] Please verify your email",
                    "html": html_body,
                },
                timeout=10.0,
            )
            if response.status_code == 200:
                return True
            logger.warning(
                "Resend verification error: status=%s (body omitted for security)",
                response.status_code,
            )
            return False
    except Exception as e:
        logger.warning("Failed to send verification email: %s", type(e).__name__)
        return False
