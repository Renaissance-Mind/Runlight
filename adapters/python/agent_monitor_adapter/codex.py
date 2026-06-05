"""Codex adapter — maps Codex lifecycle events to Agent Monitor Protocol."""

from __future__ import annotations

import json
import os
from typing import Any

from agent_monitor_adapter.base import AgentMonitorClient


class CodexAdapter(AgentMonitorClient):
    """Adapter for OpenAI Codex CLI agent."""

    def __init__(self, **kwargs):
        kwargs.setdefault("agent_type", "codex")
        kwargs.setdefault("adapter_name", "codex-hook")
        super().__init__(**kwargs)

    def on_session_start(self, thread_id: str, goal: str | None = None) -> str:
        return self.start_session(session_id=thread_id, summary=goal)

    def on_goal_updated(self, goal: str, session_id: str | None = None) -> None:
        self.record_event(
            "codex.goal.updated",
            session_id=session_id,
            summary=goal,
            payload={"goal": goal},
        )

    def on_plan_updated(self, plan: str, session_id: str | None = None) -> None:
        self.record_event(
            "codex.plan.updated",
            session_id=session_id,
            summary=plan[:200],
            payload={"plan_preview": plan[:500]},
        )

    def on_tool_call(
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

    def on_command_start(
        self,
        command_label: str,
        pid: int | None = None,
        session_id: str | None = None,
    ) -> None:
        self.record_event(
            "command.started",
            session_id=session_id,
            summary=f"Command: {command_label}",
            payload={"command_label": command_label, "pid": pid},
        )

    def on_command_finish(
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
            summary=f"Command done: {command_label} (exit {exit_code})",
            payload={
                "command_label": command_label,
                "exit_code": exit_code,
                "duration_ms": duration_ms,
            },
        )

    def on_session_finish(
        self,
        result: str = "completed",
        summary: str | None = None,
        session_id: str | None = None,
    ) -> None:
        self.finish_session(result=result, summary=summary, session_id=session_id)

    @classmethod
    def from_hook_env(cls) -> CodexAdapter:
        """Create adapter from Codex hook environment variables."""
        return cls(
            server_url=os.environ.get("AGENT_MONITOR_SERVER_URL"),
            token=os.environ.get("AGENT_MONITOR_TOKEN"),
        )
