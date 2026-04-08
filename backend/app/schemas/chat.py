from datetime import datetime
from uuid import UUID
from pydantic import BaseModel
from ..models.chat import MessageRole


class ChatSessionCreate(BaseModel):
    title: str | None = "New Chat"
    model: str | None = "zai-org/glm-4.7"
    use_rag: bool = False
    rag_file_ids: list[UUID] | None = None
    agent_type: str | None = None
    category_id: UUID | None = None


class ChatSessionResponse(BaseModel):
    id: UUID
    title: str
    model: str
    use_rag: bool
    rag_file_ids: list[UUID] | None
    agent_type: str | None = None
    category_id: UUID | None = None
    category_name: str | None = None
    file_path: str | None = None
    file_size: int = 0
    last_read_at: datetime | None = None
    unread_count: int = 0
    created_at: datetime
    updated_at: datetime
    message_count: int | None = None

    class Config:
        from_attributes = True


class ChatMessageCreate(BaseModel):
    content: str


class ChatMessageResponse(BaseModel):
    id: UUID
    role: MessageRole
    content: str
    input_tokens: int | None
    output_tokens: int | None
    rag_context: str | None = None
    source: str | None = None
    source_id: UUID | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    message: str
    session_id: UUID | None = None
    model: str | None = None
    use_rag: bool = False
    rag_file_ids: list[UUID] | None = None


class ChatStreamResponse(BaseModel):
    type: str  # "content", "done", "error"
    data: str | dict
