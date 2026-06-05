"""MCP Gateway — exposes Agent Monitor tools via MCP protocol.

MCP tools write the same events as the HTTP ingest API, keeping
hooks, CLI wrappers, and MCP-capable agents compatible.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from agent_monitor.protocol import EventEnvelope, MachineInfo, Severity, WorkspaceInfo


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


MCP_TOOLS = [
    {
        "name": "agent_monitor_start_session",
        "description": "Start monitoring a new agent session",
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string", "description": "Unique session identifier"},
                "agent_type": {"type": "string", "description": "Agent product (codex, claude_code, generic)"},
                "adapter_name": {"type": "string", "description": "Integration name"},
                "adapter_version": {"type": "string"},
                "summary": {"type": "string", "description": "Initial session summary"},
                "machine": {
                    "type": "object",
                    "properties": {
                        "hostname": {"type": "string"},
                        "os": {"type": "string"},
                        "arch": {"type": "string"},
                        "user": {"type": "string"},
                        "machine_id": {"type": "string"},
                    },
                },
                "workspace": {
                    "type": "object",
                    "properties": {
                        "cwd": {"type": "string"},
                        "repo_root": {"type": "string"},
                        "git_branch": {"type": "string"},
                        "git_commit": {"type": "string"},
                        "project_name": {"type": "string"},
                    },
                },
            },
            "required": ["session_id", "agent_type", "adapter_name"],
        },
    },
    {
        "name": "agent_monitor_record_event",
        "description": "Record an event for a monitored session",
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string"},
                "agent_type": {"type": "string"},
                "adapter_name": {"type": "string"},
                "event_type": {"type": "string", "description": "Standard or adapter-specific event type"},
                "severity": {"type": "string", "enum": ["debug", "info", "warning", "error"]},
                "summary": {"type": "string"},
                "payload": {"type": "object"},
                "dedupe_key": {"type": "string"},
            },
            "required": ["session_id", "agent_type", "adapter_name", "event_type"],
        },
    },
    {
        "name": "agent_monitor_heartbeat",
        "description": "Send a heartbeat for an active session",
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string"},
                "agent_type": {"type": "string"},
                "adapter_name": {"type": "string"},
            },
            "required": ["session_id", "agent_type", "adapter_name"],
        },
    },
    {
        "name": "agent_monitor_finish_session",
        "description": "Mark a session as completed, failed, or aborted",
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string"},
                "agent_type": {"type": "string"},
                "adapter_name": {"type": "string"},
                "result": {"type": "string", "enum": ["completed", "failed", "aborted"]},
                "summary": {"type": "string", "description": "Final session summary"},
                "payload": {"type": "object"},
            },
            "required": ["session_id", "agent_type", "adapter_name", "result"],
        },
    },
    {
        "name": "agent_monitor_get_session_status",
        "description": "Get the current status of a monitored session (read-only)",
        "inputSchema": {
            "type": "object",
            "properties": {
                "session_id": {"type": "string"},
            },
            "required": ["session_id"],
        },
    },
]


def build_envelope_from_tool_call(tool_name: str, args: dict[str, Any]) -> EventEnvelope | None:
    """Convert an MCP tool call into an EventEnvelope for ingest."""

    if tool_name == "agent_monitor_start_session":
        return EventEnvelope(
            event_id=str(uuid.uuid4()),
            session_id=args["session_id"],
            agent_type=args["agent_type"],
            adapter_name=args["adapter_name"],
            adapter_version=args.get("adapter_version"),
            event_type="session.started",
            event_time=datetime.now(timezone.utc),
            severity=Severity.INFO,
            summary=args.get("summary"),
            machine=MachineInfo(**args["machine"]) if args.get("machine") else None,
            workspace=WorkspaceInfo(**args["workspace"]) if args.get("workspace") else None,
        )

    if tool_name == "agent_monitor_record_event":
        return EventEnvelope(
            event_id=str(uuid.uuid4()),
            session_id=args["session_id"],
            agent_type=args["agent_type"],
            adapter_name=args["adapter_name"],
            event_type=args["event_type"],
            event_time=datetime.now(timezone.utc),
            severity=Severity(args.get("severity", "info")),
            summary=args.get("summary"),
            payload=args.get("payload"),
            dedupe_key=args.get("dedupe_key"),
        )

    if tool_name == "agent_monitor_heartbeat":
        return EventEnvelope(
            event_id=str(uuid.uuid4()),
            session_id=args["session_id"],
            agent_type=args["agent_type"],
            adapter_name=args["adapter_name"],
            event_type="session.heartbeat",
            event_time=datetime.now(timezone.utc),
            severity=Severity.DEBUG,
        )

    if tool_name == "agent_monitor_finish_session":
        result = args["result"]
        event_type = f"session.{result}"
        return EventEnvelope(
            event_id=str(uuid.uuid4()),
            session_id=args["session_id"],
            agent_type=args["agent_type"],
            adapter_name=args["adapter_name"],
            event_type=event_type,
            event_time=datetime.now(timezone.utc),
            severity=Severity.INFO,
            summary=args.get("summary"),
            payload=args.get("payload"),
        )

    return None
