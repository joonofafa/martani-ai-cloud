from datetime import date, datetime
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field
from ..models.user import UserRole


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)
    name: str | None = None
    agreed_to_terms: bool = False
    turnstile_token: str = ""


class UserUpdate(BaseModel):
    name: str | None = None
    password: str | None = Field(None, min_length=8)


class UserResponse(BaseModel):
    id: UUID
    email: str
    name: str | None
    role: UserRole
    storage_quota: int
    storage_used: int
    plan: str
    token_quota: int
    tokens_used_month: int
    token_reset_date: date | None
    is_active: bool
    email_verified: bool
    created_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str
    type: str
    exp: int
