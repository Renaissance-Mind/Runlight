"""Tests for the Agent Monitor Protocol schema."""

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from agent_monitor.protocol import (
    EventBatch,
    EventEnvelope,
    MachineInfo,
    Severity,
    WorkspaceInfo,
)


def _make_event(**overrides) -> dict:
    base = {
        "session_id": "sess-001",
        "session_name": "Investigate sessions",
        "session_pin": True,
        "agent_type": "codex",
        "adapter_name": "codex-hook",
        "event_type": "session.started",
        "event_time": datetime.now(timezone.utc).isoformat(),
    }
    base.update(overrides)
    return base


class TestEventEnvelope:
    def test_valid_minimal_event(self):
        ev = EventEnvelope(**_make_event())
        assert ev.session_id == "sess-001"
        assert ev.session_name == "Investigate sessions"
        assert ev.session_pin is True
        assert ev.agent_type == "codex"
        assert ev.severity == Severity.INFO
        assert ev.event_id  # auto-generated

    def test_valid_full_event(self):
        ev = EventEnvelope(
            **_make_event(
                adapter_version="1.0.0",
                sequence=1,
                severity="warning",
                summary="Session started",
                machine={"hostname": "dev-box", "os": "darwin", "arch": "arm64"},
                workspace={"cwd": "/home/user/project", "git_branch": "main"},
                payload={"pid": 1234},
                dedupe_key="dedup-001",
            )
        )
        assert ev.severity == Severity.WARNING
        assert ev.machine.hostname == "dev-box"
        assert ev.workspace.git_branch == "main"
        assert ev.payload["pid"] == 1234

    def test_missing_required_fields(self):
        with pytest.raises(ValidationError):
            EventEnvelope(event_type="session.started", event_time=datetime.now(timezone.utc))

    def test_invalid_severity(self):
        with pytest.raises(ValidationError):
            EventEnvelope(**_make_event(severity="critical"))

    def test_is_standard_event(self):
        ev = EventEnvelope(**_make_event(event_type="session.started"))
        assert ev.is_standard_event()
        assert not ev.is_adapter_event()

    def test_is_adapter_event(self):
        ev = EventEnvelope(**_make_event(event_type="codex.goal.updated"))
        assert ev.is_adapter_event()
        assert not ev.is_standard_event()

    def test_is_terminal_event(self):
        for et in ["session.completed", "session.failed", "session.aborted"]:
            ev = EventEnvelope(**_make_event(event_type=et))
            assert ev.is_terminal_event()

        ev = EventEnvelope(**_make_event(event_type="session.started"))
        assert not ev.is_terminal_event()

    def test_event_id_auto_generated(self):
        e1 = EventEnvelope(**_make_event())
        e2 = EventEnvelope(**_make_event())
        assert e1.event_id != e2.event_id


class TestMachineInfo:
    def test_all_optional(self):
        m = MachineInfo()
        assert m.hostname is None

    def test_full(self):
        m = MachineInfo(hostname="box", os="linux", arch="x86_64", user="dev", machine_id="mid-1")
        assert m.hostname == "box"


class TestWorkspaceInfo:
    def test_all_optional(self):
        w = WorkspaceInfo()
        assert w.cwd is None

    def test_full(self):
        w = WorkspaceInfo(
            cwd="/project",
            repo_root="/project",
            git_branch="feat",
            git_commit="abc123",
            project_name="my-app",
        )
        assert w.project_name == "my-app"


class TestEventBatch:
    def test_valid_batch(self):
        events = [_make_event(event_type=f"session.started") for _ in range(3)]
        batch = EventBatch(events=events)
        assert len(batch.events) == 3

    def test_empty_batch_fails(self):
        with pytest.raises(ValidationError):
            EventBatch(events=[])

    def test_oversized_batch_fails(self):
        events = [_make_event() for _ in range(101)]
        with pytest.raises(ValidationError):
            EventBatch(events=events)
