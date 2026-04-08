"""Billing API routes for plan management."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_db
from ..core.security import get_current_user
from ..core.plan_utils import tier_defaults, BASIC_STORAGE_DEFAULT, BASIC_TOKEN_DEFAULT, PRO_STORAGE_DEFAULT, PRO_TOKEN_DEFAULT
from ..models.user import User
from ..models.settings import SystemSettings, SettingsKeys
from ..schemas.user import UserResponse

from sqlalchemy import select

router = APIRouter()


# ---- Schemas ----

class PlanInfo(BaseModel):
    name: str
    token_quota: int
    storage_quota: int


class PlansResponse(BaseModel):
    plans: list[PlanInfo]


class ChangePlanRequest(BaseModel):
    plan: str


# ---- Endpoints ----

@router.get("/plans", response_model=PlansResponse)
async def get_plans(db: AsyncSession = Depends(get_db)):
    """Get available plans with their quotas (public)."""
    basic_storage, basic_tokens = await tier_defaults(db, "basic")
    pro_storage, pro_tokens = await tier_defaults(db, "pro")

    return PlansResponse(plans=[
        PlanInfo(name="basic", token_quota=basic_tokens, storage_quota=basic_storage),
        PlanInfo(name="pro", token_quota=pro_tokens, storage_quota=pro_storage),
    ])


@router.post("/change-plan", response_model=UserResponse)
async def change_plan(
    request: ChangePlanRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change the current user's plan."""
    if request.plan not in ("basic", "pro"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid plan. Must be 'basic' or 'pro'.",
        )

    if request.plan == current_user.plan:
        # No change needed — return current state
        return current_user

    storage_quota, token_quota = await tier_defaults(db, request.plan)
    current_user.plan = request.plan
    current_user.storage_quota = storage_quota
    current_user.token_quota = token_quota

    await db.commit()
    await db.refresh(current_user)
    return current_user
