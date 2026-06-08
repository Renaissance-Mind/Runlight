"""Tests for the status inference engine."""

from datetime import datetime, timezone, timedelta

from agent_monitor.services.status_engine import infer_status


class TestStatusEngine:
    def test_starting(self):
        assert infer_status("session.started", None) == "starting"

    def test_running_with_heartbeat(self):
        recent = datetime.now(timezone.utc) - timedelta(seconds=10)
        assert infer_status("session.heartbeat", recent) == "running"

    def test_finished_after_message(self):
        assert infer_status("message.finished", None) == "finished"

    def test_stale_heartbeat(self):
        old = datetime.now(timezone.utc) - timedelta(seconds=300)
        assert infer_status("session.heartbeat", old) == "stale"

    def test_stale_without_heartbeat_uses_last_event_time(self):
        old = datetime.now(timezone.utc) - timedelta(seconds=300)
        assert infer_status("tool.started", None, last_event_at=old) == "stale"

    def test_finished_without_heartbeat_does_not_become_stale(self):
        old = datetime.now(timezone.utc) - timedelta(seconds=300)
        assert infer_status("message.finished", None, last_event_at=old) == "finished"

    def test_completed_action_quiet_is_finished_not_stale(self):
        old = datetime.now(timezone.utc) - timedelta(seconds=300)
        assert infer_status("tool.finished", None, last_event_at=old) == "finished"
        assert infer_status("command.finished", None, last_event_at=old) == "finished"

    def test_started_action_quiet_is_stale(self):
        old = datetime.now(timezone.utc) - timedelta(seconds=300)
        assert infer_status("tool.started", None, last_event_at=old) == "stale"
        assert infer_status("command.started", None, last_event_at=old) == "stale"

    def test_waiting_user(self):
        assert infer_status("user_input.waiting", None) == "waiting_user"

    def test_waiting_external(self):
        assert infer_status("external.waiting", None) == "waiting_external"

    def test_permission_requested_maps_to_waiting_user(self):
        assert infer_status("permission.requested", None) == "waiting_user"

    def test_completed(self):
        assert infer_status("session.completed", None) == "completed"

    def test_failed(self):
        assert infer_status("session.failed", None) == "failed"

    def test_aborted(self):
        assert infer_status("session.aborted", None) == "aborted"

    def test_terminal_result_takes_precedence(self):
        assert infer_status("session.heartbeat", None, terminal_result="completed") == "completed"

    def test_tool_running(self):
        assert infer_status(
            "tool.started", None, active_started_types=["tool.started"]
        ) == "tool_running"

    def test_command_running(self):
        assert infer_status(
            "command.started", None, active_started_types=["command.started"]
        ) == "command_running"
