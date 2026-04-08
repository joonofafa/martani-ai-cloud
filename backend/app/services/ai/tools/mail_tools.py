"""Mail and messenger tool implementations."""

import json
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file import File
from app.models.mail import Mail
from app.models.user import User


async def _send_mail(
    user_id: uuid.UUID, to_email: str, subject: str, body: str, db: AsyncSession,
    file_ids: list[str] | None = None,
) -> str:
    # Get sender info
    sender_result = await db.execute(select(User).where(User.id == user_id))
    sender = sender_result.scalar_one_or_none()
    if not sender:
        return json.dumps({"error": "User information not found."})

    sender_name = sender.name or sender.email
    sender_email = sender.email
    now = datetime.utcnow()

    # Create sender copy (sent folder)
    sender_mail = Mail(
        user_id=user_id,
        from_name=sender_name,
        from_email=sender_email,
        to_email=to_email,
        subject=subject,
        body=body,
        folder="sent",
        is_read=True,
        created_at=now,
    )
    db.add(sender_mail)
    await db.flush()

    # Attach cloud files if file_ids provided
    if file_ids:
        from app.models.mail_attachment import MailAttachment

        for fid in file_ids:
            try:
                file_result = await db.execute(
                    select(File).where(File.id == uuid.UUID(fid), File.user_id == user_id)
                )
                cloud_file = file_result.scalar_one_or_none()
                if cloud_file:
                    attachment = MailAttachment(
                        mail_id=sender_mail.id,
                        file_name=cloud_file.original_filename,
                        file_size=cloud_file.size,
                        mime_type=cloud_file.mime_type or "application/octet-stream",
                        storage_path=cloud_file.filename,  # reuse cloud storage path
                    )
                    db.add(attachment)
            except Exception:
                pass

    # Deliver to recipient if they exist on the platform
    recipient_result = await db.execute(select(User).where(User.email == to_email))
    recipient = recipient_result.scalar_one_or_none()
    delivered = False
    external_sent = False
    if recipient:
        inbox_mail = Mail(
            user_id=recipient.id,
            from_name=sender_name,
            from_email=sender_email,
            to_email=to_email,
            subject=subject,
            body=body,
            folder="inbox",
            is_read=False,
            created_at=now,
        )
        db.add(inbox_mail)
        await db.flush()
        delivered = True

        # Copy attachments to recipient's mail
        if file_ids:
            from app.models.mail_attachment import MailAttachment as MA
            att_result = await db.execute(
                select(MA).where(MA.mail_id == sender_mail.id)
            )
            for att in att_result.scalars().all():
                recipient_att = MA(
                    mail_id=inbox_mail.id,
                    file_name=att.file_name,
                    file_size=att.file_size,
                    mime_type=att.mime_type,
                    storage_path=att.storage_path,
                )
                db.add(recipient_att)

    # Create share links for attached files (always, for reliable access)
    share_links: list[dict] = []
    if file_ids:
        import secrets
        from app.models.file_share import FileShare
        from app.core.config import get_settings
        _settings = get_settings()
        for fid in file_ids:
            try:
                file_result2 = await db.execute(
                    select(File).where(File.id == uuid.UUID(fid), File.user_id == user_id, File.deleted_at.is_(None))
                )
                cloud_file2 = file_result2.scalar_one_or_none()
                if cloud_file2 and cloud_file2.mime_type != "application/x-folder":
                    share = FileShare(
                        file_id=cloud_file2.id,
                        user_id=user_id,
                        token=secrets.token_urlsafe(8)[:10],
                        expires_at=datetime.utcnow() + timedelta(days=7),
                    )
                    db.add(share)
                    await db.flush()
                    share_links.append({
                        "filename": cloud_file2.original_filename,
                        "url": f"{_settings.frontend_url}/s/{share.token}",
                        "size": cloud_file2.size,
                    })
            except Exception:
                pass

    # Always try external email via Resend (with attachments if any)
    try:
        from app.services.email_service import send_email
        from app.services.storage.minio_service import get_minio_service

        resend_attachments = None
        MAX_ATTACH_SIZE = 10 * 1024 * 1024  # 10MB per file
        MAX_TOTAL_SIZE = 25 * 1024 * 1024   # 25MB total

        if file_ids:
            resend_attachments = []
            total_size = 0
            from app.models.mail_attachment import MailAttachment as MA2
            att_q = await db.execute(select(MA2).where(MA2.mail_id == sender_mail.id))
            minio = get_minio_service()
            for att in att_q.scalars().all():
                try:
                    if att.file_size > MAX_ATTACH_SIZE or total_size + att.file_size > MAX_TOTAL_SIZE:
                        pass  # Skip large files — share links already created above
                    else:
                        file_data = minio.download_file(att.storage_path)
                        resend_attachments.append({"filename": att.file_name, "content": file_data})
                        total_size += len(file_data)
                except Exception:
                    pass

        # Append share links to email body (always include for reliable access)
        email_body = body
        if share_links:
            email_body += "\n\n\U0001f4ce File download links (valid for 7 days):\n"
            for sl in share_links:
                size_mb = sl["size"] / (1024 * 1024)
                email_body += f"\u2022 {sl['filename']} ({size_mb:.1f}MB): {sl['url']}\n"

        external_sent = await send_email(
            to=to_email, subject=subject, body=email_body,
            from_name=sender_name, db=db,
            attachments=resend_attachments if resend_attachments else None,
        )
    except Exception:
        pass

    await db.flush()

    msg = f"Email '{subject}' sent to {to_email}."
    if external_sent:
        msg += " (Also sent as an external email.)"
    elif not delivered:
        msg += " (External delivery failed, saved to sent folder only.)"
    if share_links:
        msg += f" {len(share_links)} file share link(s) included in the email body."

    return json.dumps({
        "id": str(sender_mail.id),
        "subject": subject,
        "to_email": to_email,
        "delivered": delivered,
        "external_sent": external_sent,
        "share_links": [{"filename": sl["filename"], "url": sl["url"]} for sl in share_links],
        "message": msg,
    }, ensure_ascii=False)


async def _send_talk_message(user_id: uuid.UUID, message: str, db: AsyncSession) -> str:
    """Send a message to the user's messenger -- add to the existing agent session + WS notification."""
    from app.models.chat import ChatSession, ChatMessage

    # 1. Find the user's existing file-manager agent session (same logic as the API endpoint)
    result = await db.execute(
        select(ChatSession).where(
            ChatSession.user_id == user_id,
            ChatSession.agent_type == "file-manager",
            ChatSession.deleted_at.is_(None),
        ).order_by(ChatSession.created_at.desc())
    )
    session = result.scalars().first()

    if not session:
        # No agent session exists — create one
        session = ChatSession(
            user_id=user_id,
            title="\ube44\uc11c AI",
            model="system",
            agent_type="file-manager",
        )
        db.add(session)
        await db.flush()

    # 2. Add assistant message to the agent session
    msg = ChatMessage(
        session_id=session.id,
        role="assistant",
        content=message,
        source="agent",
    )
    db.add(msg)
    session.updated_at = datetime.utcnow()
    await db.flush()

    session_id_str = str(session.id)

    # 3. WebSocket notification via Redis pub/sub (best-effort, don't fail the tool)
    try:
        import redis.asyncio as aioredis
        from app.core.config import get_settings
        settings = get_settings()
        r = aioredis.from_url(settings.redis_url)
        try:
            await r.publish(f"user:{user_id}:notifications", json.dumps({
                "type": "notification",
                "source": "messenger",
                "name": message[:50],
                "status": "new_message",
                "session_id": session_id_str,
                "timestamp": datetime.utcnow().isoformat(),
            }))
        finally:
            await r.close()
    except Exception:
        pass  # WS notification is best-effort; DB data already flushed

    return json.dumps({
        "success": True,
        "session_id": session_id_str,
        "message": "\uba54\uc2dc\uc9c0\uac00 \uba54\uc2e0\uc800\uc5d0 \uc804\uc1a1\ub418\uc5c8\uc2b5\ub2c8\ub2e4.",
    }, ensure_ascii=False)


async def _update_mail(user_id: uuid.UUID, mail_id: str, args: dict, db: AsyncSession) -> str:
    result = await db.execute(
        select(Mail).where(
            Mail.id == uuid.UUID(mail_id),
            Mail.user_id == user_id,
            Mail.deleted_at.is_(None),
        )
    )
    mail = result.scalar_one_or_none()
    if not mail:
        return json.dumps({"error": "Email not found."})

    changes = []
    if "is_read" in args and args["is_read"] is not None:
        mail.is_read = args["is_read"]
        changes.append("read" if args["is_read"] else "unread")
    if "is_starred" in args and args["is_starred"] is not None:
        mail.is_starred = args["is_starred"]
        changes.append("starred" if args["is_starred"] else "unstarred")
    if "folder" in args and args["folder"] is not None:
        mail.folder = args["folder"]
        changes.append(f"moved to '{args['folder']}'")

    await db.flush()
    return json.dumps({
        "id": str(mail.id),
        "message": f"Email '{mail.subject}': {', '.join(changes) if changes else 'no changes'}",
    }, ensure_ascii=False)


async def _delete_mail(user_id: uuid.UUID, mail_id: str, db: AsyncSession) -> str:
    result = await db.execute(
        select(Mail).where(
            Mail.id == uuid.UUID(mail_id),
            Mail.user_id == user_id,
            Mail.deleted_at.is_(None),
        )
    )
    mail = result.scalar_one_or_none()
    if not mail:
        return json.dumps({"error": "Email not found."})

    if mail.folder == "trash":
        # Already in trash — permanently delete
        mail.deleted_at = datetime.utcnow()
        await db.flush()
        return json.dumps({"message": f"Email '{mail.subject}' has been permanently deleted."}, ensure_ascii=False)
    else:
        # Move to trash
        mail.folder = "trash"
        await db.flush()
        return json.dumps({"message": f"Email '{mail.subject}' moved to trash."}, ensure_ascii=False)
