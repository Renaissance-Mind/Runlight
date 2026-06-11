"""Runlight Protocol — event schema definitions.

The protocol is transport-independent. The same event model works
over HTTPS, MCP, hooks, skills, or CLI wrappers.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class Severity(str, enum.Enum):
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


STANDARD_EVENT_TYPES = frozenset(
    {
        "session.started",
        "session.heartbeat",
        "session.summary.updated",
        "message.started",
        "message.finished",
        "tool.started",
        "tool.finished",
        "command.started",
        "command.finished",
        "permission.requested",
        "permission.resolved",
        "user_input.waiting",
        "external.waiting",
        "session.completed",
        "session.failed",
        "session.aborted",
    }
)

TERMINAL_EVENT_TYPES = frozenset(
    {
        "session.completed",
        "session.failed",
        "session.aborted",
    }
)


class MachineInfo(BaseModel):
    hostname: str | None = None
    os: str | None = None
    arch: str | None = None
    user: str | None = None
    machine_id: str | None = None


class WorkspaceInfo(BaseModel):
    cwd: str | None = None
    repo_root: str | None = None
    git_branch: str | None = None
    git_commit: str | None = None
    project_name: str | None = None


class EventEnvelope(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    session_name: str | None = None
    session_pin: bool = False
    user_id: str | None = None
    agent_type: str
    adapter_name: str
    adapter_version: str | None = None
    event_type: str
    event_time: datetime
    received_time: datetime | None = None
    sequence: int | None = None
    severity: Severity = Severity.INFO
    summary: str | None = None
    machine: MachineInfo | None = None
    workspace: WorkspaceInfo | None = None
    payload: dict[str, Any] | None = None
    dedupe_key: str | None = None

    def is_standard_event(self) -> bool:
        return self.event_type in STANDARD_EVENT_TYPES

    def is_terminal_event(self) -> bool:
        return self.event_type in TERMINAL_EVENT_TYPES

    def is_adapter_event(self) -> bool:
        return "." in self.event_type and not self.is_standard_event()


class EventBatch(BaseModel):
    events: list[EventEnvelope] = Field(..., min_length=1, max_length=100)
