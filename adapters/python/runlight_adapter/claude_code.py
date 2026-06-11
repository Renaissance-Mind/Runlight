"""Claude Code adapter — maps Claude Code lifecycle events to Runlight Protocol."""

from __future__ import annotations

import os

from runlight_adapter.base import RunlightClient


class ClaudeCodeAdapter(RunlightClient):
    """Adapter for Anthropic Claude Code agent."""

    def __init__(self, **kwargs):
        kwargs.setdefault("agent_type", "claude_code")
        kwargs.setdefault("adapter_name", "claude-code-hook")
        super().__init__(**kwargs)

    def on_session_start(self, session_id: str | None = None, summary: str | None = None) -> str:
        return self.start_session(session_id=session_id, summary=summary)

    def on_tool_use(
        self,
        tool_name: str,
        session_id: str | None = None,
        payload: dict | None = None,
    ) -> None:
        self.record_event(
            "tool.started",
            session_id=session_id,
            summary=f"Tool: {tool_name}",
            payload={"tool_name": tool_name, **(payload or {})},
        )

    def on_tool_result(
        self,
        tool_name: str,
        exit_code: int | None = None,
        duration_ms: int | None = None,
        session_id: str | None = None,
    ) -> None:
        self.record_event(
            "tool.finished",
            session_id=session_id,
            summary=f"Tool done: {tool_name}",
            payload={
                "tool_name": tool_name,
                "exit_code": exit_code,
                "duration_ms": duration_ms,
            },
        )

    def on_bash_command(
        self,
        command_label: str,
        pid: int | None = None,
        session_id: str | None = None,
    ) -> None:
        self.record_event(
            "command.started",
            session_id=session_id,
            summary=f"Bash: {command_label}",
            payload={"command_label": command_label, "pid": pid},
        )

    def on_bash_result(
        self,
        command_label: str,
        exit_code: int,
        duration_ms: int | None = None,
        session_id: str | None = None,
    ) -> None:
        severity = "info" if exit_code == 0 else "warning"
        self.record_event(
            "command.finished",
            session_id=session_id,
            severity=severity,
            summary=f"Bash done: {command_label} (exit {exit_code})",
            payload={
                "command_label": command_label,
                "exit_code": exit_code,
                "duration_ms": duration_ms,
            },
        )

    def on_permission_requested(self, tool_name: str, session_id: str | None = None) -> None:
        self.record_event(
            "permission.requested",
            session_id=session_id,
            summary=f"Permission needed: {tool_name}",
            payload={"tool_name": tool_name},
        )

    def on_permission_resolved(self, tool_name: str, granted: bool, session_id: str | None = None) -> None:
        self.record_event(
            "permission.resolved",
            session_id=session_id,
            summary=f"Permission {'granted' if granted else 'denied'}: {tool_name}",
            payload={"tool_name": tool_name, "granted": granted},
        )

    def on_todo_updated(self, summary: str, session_id: str | None = None) -> None:
        self.record_event(
            "claude.todo.updated",
            session_id=session_id,
            summary=summary,
            payload={"todo_summary": summary},
        )

    def on_session_finish(
        self,
        result: str = "completed",
        summary: str | None = None,
        session_id: str | None = None,
    ) -> None:
        self.finish_session(result=result, summary=summary, session_id=session_id)

    @classmethod
    def from_hook_env(cls) -> ClaudeCodeAdapter:
        return cls(
            server_url=os.environ.get("RUNLIGHT_SERVER_URL") or os.environ.get("AGENT_MONITOR_SERVER_URL"),
            token=os.environ.get("RUNLIGHT_TOKEN") or os.environ.get("AGENT_MONITOR_TOKEN"),
        )
