"""Tests for the base adapter and specific adapters."""

from unittest.mock import MagicMock, patch

import pytest

from agent_monitor_adapter.base import AgentMonitorClient
from agent_monitor_adapter.codex import CodexAdapter
from agent_monitor_adapter.claude_code import ClaudeCodeAdapter


class TestBaseClient:
    def test_init_defaults(self):
        client = AgentMonitorClient()
        assert client.server_url == "http://127.0.0.1:8766"
        assert client.agent_type == "generic"
        assert client.adapter_name == "python-adapter"

    def test_init_from_env(self):
        with patch.dict("os.environ", {"AGENT_MONITOR_SERVER_URL": "http://custom:9999"}):
            client = AgentMonitorClient()
            assert client.server_url == "http://custom:9999"

    def test_build_event(self):
        client = AgentMonitorClient(agent_type="test")
        event = client._build_event(
            session_id="sess-1",
            event_type="session.started",
            summary="Test",
        )
        assert event["session_id"] == "sess-1"
        assert event["event_type"] == "session.started"
        assert event["agent_type"] == "test"
        assert event["sequence"] == 1

    def test_sequence_increments(self):
        client = AgentMonitorClient()
        e1 = client._build_event("s1", "session.started")
        e2 = client._build_event("s1", "session.heartbeat")
        assert e2["sequence"] == e1["sequence"] + 1

    def test_redact_payload(self):
        client = AgentMonitorClient()
        payload = {"name": "test", "api_key": "sk-123", "nested": {"password": "pass"}}
        redacted = client._redact_payload(payload)
        assert redacted["name"] == "test"
        assert redacted["api_key"] == "***REDACTED***"
        assert redacted["nested"]["password"] == "***REDACTED***"

    def test_offline_queue_bounded(self):
        client = AgentMonitorClient(max_queue_size=3)
        for i in range(5):
            client._offline_queue.append({"event_id": str(i)})
        assert len(client._offline_queue) == 3

    def test_context_manager(self):
        with AgentMonitorClient() as client:
            assert client is not None


class TestCodexAdapter:
    def test_init(self):
        adapter = CodexAdapter()
        assert adapter.agent_type == "codex"
        assert adapter.adapter_name == "codex-hook"

    def test_build_goal_event(self):
        adapter = CodexAdapter()
        adapter._active_session_id = "sess-1"
        with patch.object(adapter, "_send_event") as mock_send:
            adapter.on_goal_updated("Fix the auth bug")
            call_args = mock_send.call_args[0][0]
            assert call_args["event_type"] == "codex.goal.updated"
            assert call_args["payload"]["goal"] == "Fix the auth bug"

    def test_build_tool_event(self):
        adapter = CodexAdapter()
        adapter._active_session_id = "sess-1"
        with patch.object(adapter, "_send_event") as mock_send:
            adapter.on_tool_call("grep", payload={"pattern": "TODO"})
            call_args = mock_send.call_args[0][0]
            assert call_args["event_type"] == "tool.started"
            assert call_args["payload"]["tool_name"] == "grep"


class TestClaudeCodeAdapter:
    def test_init(self):
        adapter = ClaudeCodeAdapter()
        assert adapter.agent_type == "claude_code"
        assert adapter.adapter_name == "claude-code-hook"

    def test_permission_requested(self):
        adapter = ClaudeCodeAdapter()
        adapter._active_session_id = "sess-1"
        with patch.object(adapter, "_send_event") as mock_send:
            adapter.on_permission_requested("Bash")
            call_args = mock_send.call_args[0][0]
            assert call_args["event_type"] == "permission.requested"
            assert call_args["payload"]["tool_name"] == "Bash"

    def test_todo_updated(self):
        adapter = ClaudeCodeAdapter()
        adapter._active_session_id = "sess-1"
        with patch.object(adapter, "_send_event") as mock_send:
            adapter.on_todo_updated("3 tasks remaining")
            call_args = mock_send.call_args[0][0]
            assert call_args["event_type"] == "claude.todo.updated"
