"""Status inference engine.

Derives session status from events rather than requiring a fixed
status field from clients.
"""

from __future__ import annotations

from datetime import datetime, timezone

from agent_monitor.config import settings
from agent_monitor.protocol import TERMINAL_EVENT_TYPES


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def infer_status(
    latest_event_type: str | None,
    last_heartbeat_at: datetime | None,
    active_started_types: list[str] | None = None,
    terminal_result: str | None = None,
    last_event_at: datetime | None = None,
) -> str:
    if terminal_result:
        return terminal_result

    if latest_event_type in TERMINAL_EVENT_TYPES:
        if latest_event_type == "session.completed":
            return "completed"
        if latest_event_type == "session.failed":
            return "failed"
        if latest_event_type == "session.aborted":
            return "aborted"

    if latest_event_type == "user_input.waiting":
        return "waiting_user"
    if latest_event_type == "external.waiting":
        return "waiting_external"
    if latest_event_type == "permission.requested":
        return "waiting_user"

    if latest_event_type == "message.finished":
        return "finished"

    stale_reference = last_heartbeat_at or last_event_at
    if stale_reference:
        age = (datetime.now(timezone.utc) - _as_utc(stale_reference)).total_seconds()
        if age > settings.heartbeat_stale_seconds:
            return "stale"

    if active_started_types:
        if any("command" in t for t in active_started_types):
            return "command_running"
        if any("tool" in t for t in active_started_types):
            return "tool_running"

    if latest_event_type == "session.started" and last_heartbeat_at is None:
        return "starting"

    if latest_event_type and latest_event_type != "session.started":
        return "running"

    if last_heartbeat_at:
        return "running"

    return "starting"
