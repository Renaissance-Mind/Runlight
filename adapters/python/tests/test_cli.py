"""Tests for the CLI wrapper."""

from unittest.mock import patch, MagicMock
import argparse

from agent_monitor_adapter.cli import cmd_run, cmd_event, cmd_heartbeat, cmd_finish


class TestCLIHandlers:
    def test_cmd_event(self):
        args = argparse.Namespace(
            session="sess-1",
            type="tool.started",
            severity="info",
            summary="Running test",
        )
        with patch("agent_monitor_adapter.cli.AgentMonitorClient") as MockClient:
            instance = MockClient.return_value
            result = cmd_event(args)
            assert result == 0
            instance.record_event.assert_called_once_with(
                "tool.started",
                session_id="sess-1",
                severity="info",
                summary="Running test",
            )

    def test_cmd_heartbeat(self):
        args = argparse.Namespace(session="sess-1")
        with patch("agent_monitor_adapter.cli.AgentMonitorClient") as MockClient:
            instance = MockClient.return_value
            result = cmd_heartbeat(args)
            assert result == 0
            instance.record_event.assert_called_once()

    def test_cmd_finish(self):
        args = argparse.Namespace(session="sess-1", result="completed", summary="Done")
        with patch("agent_monitor_adapter.cli.AgentMonitorClient") as MockClient:
            instance = MockClient.return_value
            result = cmd_finish(args)
            assert result == 0
            instance.finish_session.assert_called_once_with(
                result="completed",
                summary="Done",
                session_id="sess-1",
            )
