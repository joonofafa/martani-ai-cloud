"""Authentication endpoints."""

import logging
import secrets
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr

from app.core.database import get_db
from app.core.config import get_settings
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
)
from app.models.user import User
from app.schemas.user import (
    UserCreate,
    UserResponse,
    Token,
)
from app.services.email_service import send_verification_email
from app.core.rate_limit import limiter

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()


async def _verify_turnstile(token: str, request: Request) -> None:
    """Verify Cloudflare Turnstile CAPTCHA token server-side."""
    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CAPTCHA verification required.",
        )
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={
                "secret": settings.turnstile_secret_key,
                "response": token,
                "remoteip": request.client.host if request.client else "",
            },
        )
    result = resp.json()
    if not result.get("success"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CAPTCHA verification failed.",
        )


class LoginData(BaseModel):
    """Login request body."""
    email: EmailStr
    password: str


class RefreshData(BaseModel):
    """Refresh token request body."""
    refresh_token: str


class VerifyEmailData(BaseModel):
    """Email verification request body."""
    token: str


class ResendVerificationData(BaseModel):
    """Resend verification email request body."""
    email: EmailStr


@router.post("/register", status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.rate_limit_register)
async def register(
    request: Request,
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),
):
    """Register a new user and send verification email."""
    # Turnstile CAPTCHA verification (skipped when secret key not configured)
    if settings.turnstile_secret_key:
        await _verify_turnstile(user_data.turnstile_token, request)

    if not user_data.agreed_to_terms:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must agree to the Terms of Service to register.",
        )

    result = await db.execute(
        select(User).where(User.email == user_data.email)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    # Check if email sending is configured
    from app.core.settings_manager import get_setting_value
    from app.models.settings import SettingsKeys
    resend_key = await get_setting_value(db, SettingsKeys.RESEND_API_KEY)
    email_enabled = bool(resend_key)

    if email_enabled:
        # Generate verification token
        verification_token = secrets.token_urlsafe(32)
        token_expires = datetime.utcnow() + timedelta(hours=24)

        user = User(
            email=user_data.email,
            name=user_data.name,
            hashed_password=get_password_hash(user_data.password),
            email_verified=False,
            verification_token=verification_token,
            verification_token_expires=token_expires,
            terms_agreed_at=datetime.utcnow(),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        # Send verification email
        sent = await send_verification_email(
            to=user.email,
            token=verification_token,
            frontend_url=settings.frontend_url,
            db=db,
        )

        if not sent:
            # Email send failed — auto-verify so user isn't stuck
            user.email_verified = True
            user.verification_token = None
            user.verification_token_expires = None
            await db.commit()
            return {"message": "Registration complete. You can now log in.", "auto_verified": True}

        return {"message": "Registration complete. Please check your email to verify your account."}
    else:
        # No email service configured — register with auto-verification
        user = User(
            email=user_data.email,
            name=user_data.name,
            hashed_password=get_password_hash(user_data.password),
            email_verified=True,
            terms_agreed_at=datetime.utcnow(),
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        return {"message": "Registration complete. You can now log in.", "auto_verified": True}


@router.post("/verify-email")
async def verify_email(
    data: VerifyEmailData,
    db: AsyncSession = Depends(get_db),
):
    """Verify email with token."""
    result = await db.execute(
        select(User).where(User.verification_token == data.token)
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification token.",
        )

    if user.verification_token_expires and user.verification_token_expires < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification token has expired. Please request a new one.",
        )

    user.email_verified = True
    user.verification_token = None
    user.verification_token_expires = None
    await db.commit()

    return {"message": "Email verified successfully. Please log in."}


@router.post("/resend-verification")
@limiter.limit(settings.rate_limit_resend)
async def resend_verification(
    request: Request,
    data: ResendVerificationData,
    db: AsyncSession = Depends(get_db),
):
    """Resend verification email."""
    result = await db.execute(
        select(User).where(User.email == data.email)
    )
    user = result.scalar_one_or_none()

    if not user:
        # Don't reveal whether email exists
        return {"message": "Verification email sent."}

    if user.email_verified:
        return {"message": "Email is already verified."}

    # Generate new token
    verification_token = secrets.token_urlsafe(32)
    token_expires = datetime.utcnow() + timedelta(hours=24)

    user.verification_token = verification_token
    user.verification_token_expires = token_expires
    await db.commit()

    await send_verification_email(
        to=user.email,
        token=verification_token,
        frontend_url=settings.frontend_url,
        db=db,
    )

    return {"message": "Verification email sent."}


@router.post("/login", response_model=Token)
@limiter.limit(settings.rate_limit_login)
async def login(
    login_data: LoginData,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Login and get access token."""
    from app.services.audit_service import write_audit_log

    result = await db.execute(
        select(User).where(User.email == login_data.email)
    )
    user = result.scalar_one_or_none()

    # Check login lockout
    if user and user.locked_until and user.locked_until > datetime.utcnow():
        remaining = int((user.locked_until - datetime.utcnow()).total_seconds() / 60) + 1
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is locked due to too many failed attempts. Try again in {remaining} minutes.",
        )

    if not user or not verify_password(login_data.password, user.hashed_password):
        # Increment failed attempts for existing user
        if user:
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            if user.failed_login_attempts >= settings.max_login_failures:
                user.locked_until = datetime.utcnow() + timedelta(minutes=settings.login_lockout_minutes)
            await db.commit()

        await write_audit_log(
            user_id=user.id if user else None,
            action="login_failure",
            resource_type="auth",
            detail={"email": login_data.email},
            request=request,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    if not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email verification required. Please check your email.",
        )

    # Login success — reset lockout counters
    user.failed_login_attempts = 0
    user.locked_until = None
    await db.commit()

    # Ensure AI Workspace system folders exist
    from app.services.workspace_service import ensure_workspace_folders
    try:
        await ensure_workspace_folders(user.id, db)
    except Exception as e:
        logger.warning("Workspace folder creation failed for user %s: %s", user.id, e)

    access_token = create_access_token(data={"sub": str(user.id)})
    refresh_token = create_refresh_token(data={"sub": str(user.id)})

    await write_audit_log(
        user_id=user.id,
        action="login_success",
        resource_type="auth",
        detail={"email": user.email},
        request=request,
    )

    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
    )


@router.post("/refresh", response_model=Token)
async def refresh_token(
    token_data: RefreshData,
    db: AsyncSession = Depends(get_db),
):
    """Refresh access token."""
    payload = decode_token(token_data.refresh_token)

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    access_token = create_access_token(data={"sub": str(user.id)})
    new_refresh_token = create_refresh_token(data={"sub": str(user.id)})

    return Token(
        access_token=access_token,
        refresh_token=new_refresh_token,
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
):
    """Get current user information."""
    return current_user
