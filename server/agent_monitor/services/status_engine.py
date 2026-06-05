"""Status inference engine.

Derives session status from events rather than requiring a fixed
status field from clients.
"""

from __future__ import annotations

from datetime import datetime, timezone

from agent_monitor.config import settings
from agent_monitor.protocol import TERMINAL_EVENT_TYPES


def infer_status(
    latest_event_type: str | None,
    last_heartbeat_at: datetime | None,
    active_started_types: list[str] | None = None,
    terminal_result: str | None = None,
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

    if last_heartbeat_at:
        age = (datetime.now(timezone.utc) - last_heartbeat_at).total_seconds()
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
