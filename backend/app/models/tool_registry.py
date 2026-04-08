"""Tool registry models — DB-backed tool metadata for groups and individual functions."""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, Integer, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class ToolGroup(Base):
    """Tool group (e.g., 'file_read', 'web_interaction') with category and enabled status."""
    __tablename__ = "tool_groups"

    key = Column(String(100), primary_key=True)          # 'file_read', 'web_interaction'
    category = Column(String(100), nullable=False)        # 'File Management', 'Agent'
    display_name = Column(String(200), nullable=False)    # 'File Read / List'
    description = Column(Text, nullable=True)             # optional longer description
    enabled = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    functions = relationship("ToolFunction", back_populates="group", lazy="selectin")


class ToolFunction(Base):
    """Individual tool function (e.g., 'browser_click', 'list_files') within a group."""
    __tablename__ = "tool_functions"

    name = Column(String(100), primary_key=True)          # 'browser_click'
    group_key = Column(String(100), ForeignKey("tool_groups.key"), nullable=False)
    display_name = Column(String(200), nullable=False)    # 'Click Element'
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    group = relationship("ToolGroup", back_populates="functions")
