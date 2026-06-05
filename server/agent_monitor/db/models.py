"""SQLAlchemy models for AgentMonitor."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Token(Base):
    __tablename__ = "tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token_value: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    session_name: Mapped[str | None] = mapped_column(Text)
    session_pin: Mapped[bool] = mapped_column(default=False)
    user_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    agent_type: Mapped[str] = mapped_column(String(100), nullable=False)
    adapter_name: Mapped[str] = mapped_column(String(100), nullable=False)
    adapter_version: Mapped[str | None] = mapped_column(String(50))
    summary: Mapped[str | None] = mapped_column(Text)
    summary_inferred: Mapped[bool] = mapped_column(default=False)
    machine_hostname: Mapped[str | None] = mapped_column(String(255))
    machine_os: Mapped[str | None] = mapped_column(String(100))
    machine_arch: Mapped[str | None] = mapped_column(String(50))
    machine_user: Mapped[str | None] = mapped_column(String(255))
    machine_id: Mapped[str | None] = mapped_column(String(255))
    workspace_cwd: Mapped[str | None] = mapped_column(String(1024))
    workspace_repo_root: Mapped[str | None] = mapped_column(String(1024))
    workspace_git_branch: Mapped[str | None] = mapped_column(String(255))
    workspace_git_commit: Mapped[str | None] = mapped_column(String(255))
    workspace_project_name: Mapped[str | None] = mapped_column(String(255))
    current_status: Mapped[str] = mapped_column(String(50), default="starting", index=True)
    latest_event_type: Mapped[str | None] = mapped_column(String(100))
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    last_event_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime)
    event_count: Mapped[int] = mapped_column(Integer, default=0)
    terminal_result: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("ix_sessions_user_status", "user_id", "current_status"),
    )


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    session_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    session_name: Mapped[str | None] = mapped_column(Text)
    session_pin: Mapped[bool] = mapped_column(default=False)
    user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    agent_type: Mapped[str] = mapped_column(String(100), nullable=False)
    adapter_name: Mapped[str] = mapped_column(String(100), nullable=False)
    adapter_version: Mapped[str | None] = mapped_column(String(50))
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    event_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    received_time: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    sequence: Mapped[int | None] = mapped_column(Integer)
    severity: Mapped[str] = mapped_column(String(20), default="info")
    summary: Mapped[str | None] = mapped_column(Text)
    machine_hostname: Mapped[str | None] = mapped_column(String(255))
    workspace_cwd: Mapped[str | None] = mapped_column(String(1024))
    payload_json: Mapped[str | None] = mapped_column(Text)
    dedupe_key: Mapped[str | None] = mapped_column(String(255), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_events_session_time", "session_id", "event_time"),
    )


class Machine(Base):
    __tablename__ = "machines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    machine_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    hostname: Mapped[str | None] = mapped_column(String(255))
    os: Mapped[str | None] = mapped_column(String(100))
    arch: Mapped[str | None] = mapped_column(String(50))
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class RetentionRun(Base):
    __tablename__ = "retention_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
    events_deleted: Mapped[int] = mapped_column(Integer, default=0)
    sessions_deleted: Mapped[int] = mapped_column(Integer, default=0)
