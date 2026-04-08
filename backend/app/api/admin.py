"""Admin API routes for system management."""

import os
import shutil
from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, delete
from pydantic import BaseModel, EmailStr

from ..core.database import get_db
from ..core.security import get_current_user, get_password_hash
from ..core.plan_utils import tier_defaults as _tier_defaults
from ..models.user import User, UserRole
from ..models.file import File
from ..models.settings import SystemSettings, SettingsKeys
from ..models.audit_log import AuditLog

router = APIRouter(prefix="/admin", tags=["admin"])


# ============== Dependency ==============

async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Require admin role for access."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


# ============== Schemas ==============

class UserListResponse(BaseModel):
    id: UUID
    email: str
    name: Optional[str]
    role: str
    is_active: bool
    storage_quota: int
    storage_used: int
    plan: str
    token_quota: int
    tokens_used_month: int
    created_at: str

    class Config:
        from_attributes = True


class UserUpdateRequest(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    storage_quota: Optional[int] = None
    plan: Optional[str] = None


class UserPasswordChangeRequest(BaseModel):
    new_password: str


class SystemStatsResponse(BaseModel):
    total_users: int
    active_users: int
    total_files: int
    total_storage_used: int
    total_storage_quota: int
    hw_storage_total: int
    hw_storage_used: int
    martani_storage_used: int
    total_tokens_used: int
    total_tokens_quota: int


class SettingResponse(BaseModel):
    key: str
    value: Optional[str]
    description: Optional[str]
    is_secret: bool

    class Config:
        from_attributes = True


class SettingUpdateRequest(BaseModel):
    value: str


class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None
    role: str = "user"
    plan: str = "basic"
    storage_quota: Optional[int] = None


# ============== Stats ==============

@router.get("/stats", response_model=SystemStatsResponse)
async def get_system_stats(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Get system-wide statistics."""
    # Total users
    total_users_result = await db.execute(select(func.count(User.id)))
    total_users = total_users_result.scalar() or 0

    # Active users
    active_users_result = await db.execute(
        select(func.count(User.id)).where(User.is_active == True)
    )
    active_users = active_users_result.scalar() or 0

    # Total files
    total_files_result = await db.execute(
        select(func.count(File.id)).where(File.deleted_at == None)
    )
    total_files = total_files_result.scalar() or 0

    # Storage & token stats
    storage_result = await db.execute(
        select(
            func.coalesce(func.sum(User.storage_used), 0),
            func.coalesce(func.sum(User.storage_quota), 0),
            func.coalesce(func.sum(User.tokens_used_month), 0),
            func.coalesce(func.sum(User.token_quota), 0),
        )
    )
    storage_row = storage_result.one()

    # H/W disk usage
    try:
        disk = shutil.disk_usage('/mnt/raidHdd')
        hw_total = disk.total
        hw_used = disk.used
    except (FileNotFoundError, OSError):
        hw_total = 0
        hw_used = 0

    # Martani Cloud actual disk usage (MinIO data directory)
    martani_used = 0
    cloud_path = '/mnt/raidHdd/Cloud'
    try:
        for dirpath, _dirnames, filenames in os.walk(cloud_path):
            for f in filenames:
                try:
                    martani_used += os.path.getsize(os.path.join(dirpath, f))
                except OSError:
                    pass
    except (FileNotFoundError, OSError):
        pass

    return SystemStatsResponse(
        total_users=total_users,
        active_users=active_users,
        total_files=total_files,
        total_storage_used=int(storage_row[0]),
        total_storage_quota=int(storage_row[1]),
        hw_storage_total=hw_total,
        hw_storage_used=hw_used,
        martani_storage_used=martani_used,
        total_tokens_used=int(storage_row[2]),
        total_tokens_quota=int(storage_row[3]),
    )


# ============== Users ==============

@router.get("/users", response_model=list[UserListResponse])
async def list_users(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """List all users."""
    result = await db.execute(
        select(User)
        .order_by(User.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    users = result.scalars().all()

    return [
        UserListResponse(
            id=u.id,
            email=u.email,
            name=u.name,
            role=u.role.value,
            is_active=u.is_active,
            storage_quota=u.storage_quota,
            storage_used=u.storage_used,
            plan=u.plan,
            token_quota=u.token_quota,
            tokens_used_month=u.tokens_used_month,
            created_at=u.created_at.isoformat()
        )
        for u in users
    ]


@router.post("/users", response_model=UserListResponse)
async def create_user(
    request: CreateUserRequest,
    req: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Create a new user (admin only)."""
    # Check if email exists
    existing = await db.execute(select(User).where(User.email == request.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Plan-based defaults
    plan = request.plan if request.plan in ("basic", "pro") else "basic"
    storage_default, token_default = await _tier_defaults(db, plan)
    quota = request.storage_quota if request.storage_quota is not None else storage_default

    # Create user
    new_user = User(
        email=request.email,
        hashed_password=get_password_hash(request.password),
        name=request.name,
        role=UserRole.ADMIN if request.role == "admin" else UserRole.USER,
        plan=plan,
        storage_quota=quota,
        token_quota=token_default,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    try:
        from app.services.audit_service import write_audit_log
        await write_audit_log(
            user_id=admin.id, action="admin_action", resource_type="user",
            resource_id=str(new_user.id),
            detail={"action": "create_user", "email": request.email, "role": request.role},
            request=req,
        )
    except Exception:
        pass

    return UserListResponse(
        id=new_user.id,
        email=new_user.email,
        name=new_user.name,
        role=new_user.role.value,
        is_active=new_user.is_active,
        storage_quota=new_user.storage_quota,
        storage_used=new_user.storage_used,
        plan=new_user.plan,
        token_quota=new_user.token_quota,
        tokens_used_month=new_user.tokens_used_month,
        created_at=new_user.created_at.isoformat()
    )


@router.get("/users/{user_id}", response_model=UserListResponse)
async def get_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Get a specific user."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return UserListResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role.value,
        is_active=user.is_active,
        storage_quota=user.storage_quota,
        storage_used=user.storage_used,
        plan=user.plan,
        token_quota=user.token_quota,
        tokens_used_month=user.tokens_used_month,
        created_at=user.created_at.isoformat()
    )


@router.patch("/users/{user_id}", response_model=UserListResponse)
async def update_user(
    user_id: UUID,
    request: UserUpdateRequest,
    req: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Update a user."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    # Prevent admin from deactivating themselves
    if user.id == admin.id and request.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account"
        )

    # Update fields
    if request.name is not None:
        user.name = request.name
    if request.role is not None:
        # Prevent admin from changing their own role
        if user.id == admin.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot change your own role"
            )
        user.role = UserRole.ADMIN if request.role == "admin" else UserRole.USER
    if request.is_active is not None:
        user.is_active = request.is_active
    if request.storage_quota is not None:
        user.storage_quota = request.storage_quota
    if request.plan is not None and request.plan in ("basic", "pro") and request.plan != user.plan:
        user.plan = request.plan
        # Auto-apply tier defaults when plan changes (unless storage_quota was also specified)
        storage_default, token_default = await _tier_defaults(db, request.plan)
        if request.storage_quota is None:
            user.storage_quota = storage_default
        user.token_quota = token_default

    await db.commit()
    await db.refresh(user)

    try:
        from app.services.audit_service import write_audit_log
        await write_audit_log(
            user_id=admin.id, action="admin_action", resource_type="user",
            resource_id=str(user_id),
            detail={"action": "update_user", "changes": request.model_dump(exclude_none=True)},
            request=req,
        )
    except Exception:
        pass

    return UserListResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role.value,
        is_active=user.is_active,
        storage_quota=user.storage_quota,
        storage_used=user.storage_used,
        plan=user.plan,
        token_quota=user.token_quota,
        tokens_used_month=user.tokens_used_month,
        created_at=user.created_at.isoformat()
    )


@router.post("/users/{user_id}/password")
async def change_user_password(
    user_id: UUID,
    request: UserPasswordChangeRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Change a user's password."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    if len(request.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters"
        )

    user.hashed_password = get_password_hash(request.new_password)
    await db.commit()

    return {"message": "Password updated successfully"}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: UUID,
    req: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Delete a user."""
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    email = user.email

    # Delete user using delete statement
    await db.execute(delete(User).where(User.id == user_id))
    await db.commit()

    try:
        from app.services.audit_service import write_audit_log
        await write_audit_log(
            user_id=admin.id, action="admin_action", resource_type="user",
            resource_id=str(user_id),
            detail={"action": "delete_user", "email": email},
            request=req,
        )
    except Exception:
        pass

    return {"message": "User deleted successfully"}


# ============== Settings ==============

@router.get("/settings", response_model=list[SettingResponse])
async def list_settings(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """List all system settings."""
    result = await db.execute(select(SystemSettings).order_by(SystemSettings.key))
    settings = result.scalars().all()

    return [
        SettingResponse(
            key=s.key,
            value="********" if s.is_secret and s.value else s.value,
            description=s.description,
            is_secret=s.is_secret
        )
        for s in settings
    ]


@router.get("/settings/{key}", response_model=SettingResponse)
async def get_setting(
    key: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Get a specific setting."""
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == key)
    )
    setting = result.scalar_one_or_none()

    if not setting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Setting not found"
        )

    return SettingResponse(
        key=setting.key,
        value="********" if setting.is_secret and setting.value else setting.value,
        description=setting.description,
        is_secret=setting.is_secret
    )

  
SECRET_KEYS = {
    "llm_api_key",
    "embedding_api_key",
    "resend_api_key",
    "openrouter_api_key",
    "openrouter_vision_api_key",
    "turnstile_secret_key",
    "jwt_secret",
    "secret_key",
    "vault_encryption_key",
    "fireworks_api_key",
}


@router.put("/settings/{key}", response_model=SettingResponse)
async def update_setting(
    key: str,
    request: SettingUpdateRequest,
    req: Request,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Update a setting (upsert: creates the key if it doesn't exist)."""
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == key)
    )
    setting = result.scalar_one_or_none()

    if not setting:
        import uuid
        from datetime import datetime
        setting = SystemSettings(
            id=uuid.uuid4(),
            key=key,
            value=request.value,
            is_secret=key in SECRET_KEYS,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(setting)
    else:
        setting.value = request.value

    await db.commit()
    await db.refresh(setting)

    try:
        from app.services.audit_service import write_audit_log
        await write_audit_log(
            user_id=admin.id, action="admin_action", resource_type="setting",
            resource_id=key,
            detail={"action": "update_setting", "is_secret": setting.is_secret},
            request=req,
        )
    except Exception:
        pass

    return SettingResponse(
        key=setting.key,
        value="********" if setting.is_secret and setting.value else setting.value,
        description=setting.description,
        is_secret=setting.is_secret
    )


# ============== Tool Registry ==============

from ..models.tool_registry import ToolGroup, ToolFunction


class ToolFunctionResponse(BaseModel):
    name: str
    display_name: str
    sort_order: int


class ToolGroupResponse(BaseModel):
    key: str
    category: str
    display_name: str
    enabled: bool
    sort_order: int
    functions: list[ToolFunctionResponse]


@router.get("/agent-default-prompt/{agent_type}")
async def get_agent_default_prompt(
    agent_type: str,
    _admin: User = Depends(require_admin),
):
    """Return the built-in default system prompt for an agent type."""
    from app.core.agent_types import AGENT_TYPES
    config = AGENT_TYPES.get(agent_type)
    if not config:
        raise HTTPException(status_code=404, detail=f"Unknown agent type: {agent_type}")
    return {"agent_type": agent_type, "default_prompt": config["default_prompt"]}


class ToolGroupUpdate(BaseModel):
    enabled: Optional[bool] = None
    display_name: Optional[str] = None
    category: Optional[str] = None


@router.get("/tool-registry", response_model=list[ToolGroupResponse])
async def get_tool_registry(
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get all tool groups with their functions."""
    result = await db.execute(
        select(ToolGroup).order_by(ToolGroup.sort_order)
    )
    groups = result.scalars().unique().all()
    return [
        ToolGroupResponse(
            key=g.key,
            category=g.category,
            display_name=g.display_name,
            enabled=g.enabled,
            sort_order=g.sort_order,
            functions=[
                ToolFunctionResponse(
                    name=f.name,
                    display_name=f.display_name,
                    sort_order=f.sort_order,
                )
                for f in sorted(g.functions, key=lambda x: x.sort_order)
            ],
        )
        for g in groups
    ]


@router.put("/tool-registry/{group_key}", response_model=ToolGroupResponse)
async def update_tool_group(
    group_key: str,
    body: ToolGroupUpdate,
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update a tool group (enable/disable, rename, etc.)."""
    result = await db.execute(
        select(ToolGroup).where(ToolGroup.key == group_key)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Tool group not found")

    if body.enabled is not None:
        group.enabled = body.enabled
    if body.display_name is not None:
        group.display_name = body.display_name
    if body.category is not None:
        group.category = body.category

    await db.commit()
    await db.refresh(group)

    # Refresh in-memory cache
    from app.services.tool_registry_service import refresh_cache
    await refresh_cache(db)

    return ToolGroupResponse(
        key=group.key,
        category=group.category,
        display_name=group.display_name,
        enabled=group.enabled,
        sort_order=group.sort_order,
        functions=[
            ToolFunctionResponse(
                name=f.name,
                display_name=f.display_name,
                sort_order=f.sort_order,
            )
            for f in sorted(group.functions, key=lambda x: x.sort_order)
        ],
    )


@router.put("/tool-registry/batch-update", response_model=list[ToolGroupResponse])
async def batch_update_tool_groups(
    updates: dict[str, bool],
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Batch update enabled status for multiple tool groups. Body: {"file_read": true, ...}"""
    result = await db.execute(select(ToolGroup))
    groups = {g.key: g for g in result.scalars().unique().all()}

    updated = []
    for key, enabled in updates.items():
        if key in groups:
            groups[key].enabled = enabled
            updated.append(groups[key])

    await db.commit()

    # Refresh in-memory cache
    from app.services.tool_registry_service import refresh_cache
    await refresh_cache(db)

    return [
        ToolGroupResponse(
            key=g.key,
            category=g.category,
            display_name=g.display_name,
            enabled=g.enabled,
            sort_order=g.sort_order,
            functions=[
                ToolFunctionResponse(
                    name=f.name,
                    display_name=f.display_name,
                    sort_order=f.sort_order,
                )
                for f in sorted(g.functions, key=lambda x: x.sort_order)
            ],
        )
        for g in updated
    ]


# ============== Token Usage Logs ==============

class TokenUsageItem(BaseModel):
    id: str
    user_email: str
    user_name: str | None
    action: str
    input_tokens: int
    output_tokens: int
    tools_called: list[str]
    agent_type: str | None
    session_title: str | None
    created_at: str


class TokenUsageSummary(BaseModel):
    items: list[TokenUsageItem]
    total_count: int
    total_input_tokens: int
    total_output_tokens: int


@router.get("/token-usage", response_model=TokenUsageSummary)
async def get_token_usage(
    user_id: Optional[str] = None,
    days: int = 30,
    limit: int = 100,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Get detailed token usage logs from audit_logs."""
    from datetime import datetime, timedelta

    since = datetime.utcnow() - timedelta(days=days)

    # Base query
    base_filter = [
        AuditLog.action == "chat_message",
        AuditLog.detail.isnot(None),
        AuditLog.created_at >= since,
    ]
    if user_id:
        base_filter.append(AuditLog.user_id == UUID(user_id))

    # Total count
    count_result = await db.execute(
        select(func.count(AuditLog.id)).where(*base_filter)
    )
    total_count = count_result.scalar() or 0

    # Aggregate totals
    totals_result = await db.execute(
        select(
            func.coalesce(func.sum(AuditLog.detail["input_tokens"].as_integer()), 0),
            func.coalesce(func.sum(AuditLog.detail["output_tokens"].as_integer()), 0),
        ).where(*base_filter)
    )
    totals = totals_result.one()

    # Paginated items with user join
    query = (
        select(AuditLog, User.email, User.name)
        .outerjoin(User, AuditLog.user_id == User.id)
        .where(*base_filter)
        .order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(query)
    rows = result.all()

    items = []
    for log, email, name in rows:
        detail = log.detail or {}
        # Try to get session title
        session_title = None
        if log.resource_id:
            try:
                from ..models.chat import ChatSession
                sess = await db.get(ChatSession, UUID(log.resource_id))
                if sess:
                    session_title = sess.title
            except Exception:
                pass

        items.append(TokenUsageItem(
            id=str(log.id),
            user_email=email or "unknown",
            user_name=name,
            action=log.action,
            input_tokens=detail.get("input_tokens", 0) or 0,
            output_tokens=detail.get("output_tokens", 0) or 0,
            tools_called=detail.get("tools_called", []) or [],
            agent_type=detail.get("agent_type"),
            session_title=session_title,
            created_at=log.created_at.isoformat(),
        ))

    return TokenUsageSummary(
        items=items,
        total_count=total_count,
        total_input_tokens=int(totals[0]),
        total_output_tokens=int(totals[1]),
    )


# ============== Per-User Token Stats ==============

class UserTokenStats(BaseModel):
    user_id: str
    email: str
    name: str | None
    plan: str
    tokens_used_month: int
    token_quota: int
    chat_input: int
    chat_output: int
    schedule_input: int
    schedule_output: int
    vision_input: int
    vision_output: int
    audio_input: int
    audio_output: int
    mining_input: int
    mining_output: int


@router.get("/token-stats", response_model=list[UserTokenStats])
async def get_user_token_stats(
    days: int = 30,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Get per-user token usage statistics broken down by source category."""
    from datetime import datetime, timedelta
    from sqlalchemy import text as sa_text, literal_column

    since = datetime.utcnow() - timedelta(days=days)

    # Get all users with their quota info
    users_result = await db.execute(
        select(User).where(User.is_active == True).order_by(User.email)
    )
    users = users_result.scalars().all()

    # Aggregate from chat_messages (source = chat | schedule)
    chat_stats_sql = sa_text("""
        SELECT
            cs.user_id,
            cm.source,
            COALESCE(SUM(cm.input_tokens), 0) as input_sum,
            COALESCE(SUM(cm.output_tokens), 0) as output_sum
        FROM chat_messages cm
        JOIN chat_sessions cs ON cm.session_id = cs.id
        WHERE cm.created_at >= :since
          AND cm.input_tokens IS NOT NULL
        GROUP BY cs.user_id, cm.source
    """)
    chat_result = await db.execute(chat_stats_sql, {"since": since})
    chat_rows = chat_result.fetchall()

    # Build lookup: {user_id: {source: (input, output)}}
    chat_by_user: dict[str, dict[str, tuple[int, int]]] = {}
    for row in chat_rows:
        uid = str(row[0])
        src = row[1] or "chat"
        chat_by_user.setdefault(uid, {})[src] = (int(row[2]), int(row[3]))

    # Aggregate from audit_logs (action = token_usage, resource_type = source)
    audit_stats_sql = sa_text("""
        SELECT
            user_id::text,
            resource_type,
            COALESCE(SUM((detail->>'input_tokens')::int), 0) as input_sum,
            COALESCE(SUM((detail->>'output_tokens')::int), 0) as output_sum
        FROM audit_logs
        WHERE action = 'token_usage'
          AND created_at >= :since
          AND detail IS NOT NULL
        GROUP BY user_id, resource_type
    """)
    audit_result = await db.execute(audit_stats_sql, {"since": since})
    audit_rows = audit_result.fetchall()

    audit_by_user: dict[str, dict[str, tuple[int, int]]] = {}
    for row in audit_rows:
        uid = str(row[0])
        src = row[1] or "unknown"
        audit_by_user.setdefault(uid, {})[src] = (int(row[2]), int(row[3]))

    # Build response
    result = []
    for u in users:
        uid = str(u.id)
        chat_data = chat_by_user.get(uid, {})
        audit_data = audit_by_user.get(uid, {})

        # chat_messages sources
        chat_in, chat_out = chat_data.get("chat", (0, 0))
        sched_in, sched_out = chat_data.get("schedule", (0, 0))

        # audit_logs sources (for indexing/mining)
        vis_in, vis_out = audit_data.get("vision_index", (0, 0))
        aud_in, aud_out = audit_data.get("audio_index", (0, 0))
        min_in, min_out = audit_data.get("mining", (0, 0))

        # Skip users with zero usage
        total = chat_in + chat_out + sched_in + sched_out + vis_in + vis_out + aud_in + aud_out + min_in + min_out
        if total == 0 and u.tokens_used_month == 0:
            continue

        result.append(UserTokenStats(
            user_id=uid,
            email=u.email,
            name=u.name,
            plan=u.plan,
            tokens_used_month=u.tokens_used_month,
            token_quota=u.token_quota,
            chat_input=chat_in,
            chat_output=chat_out,
            schedule_input=sched_in,
            schedule_output=sched_out,
            vision_input=vis_in,
            vision_output=vis_out,
            audio_input=aud_in,
            audio_output=aud_out,
            mining_input=min_in,
            mining_output=min_out,
        ))

    return result
