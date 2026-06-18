"""Tests for session query endpoints."""

import json
from datetime import datetime, timedelta, timezone

from runlight.db.models import Session
from runlight.services.session_service import refresh_session_statuses

def _make_event(**overrides) -> dict:
    base = {
        "session_id": "sess-q1",
        "agent_type": "codex",
        "adapter_name": "codex-hook",
        "event_type": "session.started",
        "event_time": datetime.now(timezone.utc).isoformat(),
    }
    base.update(overrides)
    return base


class TestSessionQueries:
    async def test_live_sessions_does_not_import_local_codex_state(
        self, client, tmp_path, monkeypatch
    ):
        global_state = tmp_path / ".codex-global-state.json"
        global_state.write_text(
            json.dumps({"pinned-thread-ids": ["codex-local-only"]})
        )
        monkeypatch.setenv("RUNLIGHT_CODEX_GLOBAL_STATE", str(global_state))

        resp = await client.get("/api/sessions/live")
        assert resp.status_code == 200
        ids = {s["session_id"] for s in resp.json()["sessions"]}
        assert "codex-local-only" not in ids

    async def test_live_sessions(self, client):
        await client.post("/api/events", json=_make_event(session_id="sess-live-1"))
        await client.post("/api/events", json=_make_event(session_id="sess-live-2"))
        await client.post("/api/events", json=_make_event(
            session_id="sess-done", event_type="session.completed"
        ))
        resp = await client.get("/api/sessions/live")
        assert resp.status_code == 200
        ids = {s["session_id"] for s in resp.json()["sessions"]}
        assert "sess-live-1" in ids
        assert "sess-live-2" in ids
        assert "sess-done" not in ids

    async def test_session_api_returns_machine_identity_fields(self, client):
        await client.post(
            "/api/events",
            json=_make_event(
                session_id="sess-machine",
                machine={
                    "hostname": "studio-mac",
                    "os": "darwin",
                    "arch": "arm64",
                    "user": "chunqiu",
                    "machine_id": "machine-1",
                },
            ),
        )

        resp = await client.get("/api/sessions/sess-machine")

        assert resp.status_code == 200
        data = resp.json()
        assert data["machine_hostname"] == "studio-mac"
        assert data["machine_os"] == "darwin"
        assert data["machine_arch"] == "arm64"
        assert data["machine_user"] == "chunqiu"
        assert data["machine_id"] == "machine-1"

    async def test_refresh_session_statuses_marks_old_hook_activity_stale(
        self, db_session
    ):
        old = datetime.now(timezone.utc) - timedelta(seconds=300)
        db_session.add(
            Session(
                session_id="sess-stuck-running",
                user_id="default",
                agent_type="codex",
                adapter_name="codex-hook",
                current_status="running",
                latest_event_type="tool.started",
                started_at=old,
                last_event_at=old,
                event_count=1,
            )
        )
        await db_session.commit()

        changed = await refresh_session_statuses(db_session, "default")

        assert changed is True
        session = await db_session.get(Session, 1)
        assert session.current_status == "stale"

    async def test_refresh_session_statuses_marks_quiet_open_turn_stale_after_tool_finish(
        self, db_session
    ):
        old = datetime.now(timezone.utc) - timedelta(seconds=300)
        db_session.add(
            Session(
                session_id="sess-open-turn",
                user_id="default",
                agent_type="codex",
                adapter_name="codex-hook",
                current_status="running",
                latest_event_type="tool.finished",
                started_at=old,
                last_event_at=old,
                active_run_started_at=old,
                event_count=2,
            )
        )
        await db_session.commit()

        changed = await refresh_session_statuses(db_session, "default")

        assert changed is True
        session = await db_session.get(Session, 1)
        assert session.current_status == "stale"

    async def test_refresh_session_statuses_keeps_recent_open_turn_running_after_tool_finish(
        self, db_session
    ):
        recent = datetime.now(timezone.utc) - timedelta(seconds=30)
        active = datetime.now(timezone.utc) - timedelta(seconds=60)
        db_session.add(
            Session(
                session_id="sess-recent-open-turn",
                user_id="default",
                agent_type="codex",
                adapter_name="codex-hook",
                current_status="running",
                latest_event_type="tool.finished",
                started_at=active,
                last_event_at=recent,
                active_run_started_at=active,
                event_count=2,
            )
        )
        await db_session.commit()

        changed = await refresh_session_statuses(db_session, "default")

        assert changed is False
        session = await db_session.get(Session, 1)
        assert session.current_status == "running"

    async def test_finished_turn_stays_live(self, client):
        await client.post("/api/events", json=_make_event(session_id="sess-finished"))
        await client.post("/api/events", json=_make_event(
            session_id="sess-finished", event_type="message.finished"
        ))
        resp = await client.get("/api/sessions/live")
        assert resp.status_code == 200
        session = next(
            s for s in resp.json()["sessions"] if s["session_id"] == "sess-finished"
        )
        assert session["current_status"] == "finished"

    async def test_non_terminal_event_revives_completed_session(self, client):
        await client.post("/api/events", json=_make_event(
            session_id="sess-revived", event_type="session.completed"
        ))
        await client.post("/api/events", json=_make_event(
            session_id="sess-revived",
            event_type="message.started",
            session_name="Renamed session",
        ))
        resp = await client.get("/api/sessions/live")
        assert resp.status_code == 200
        session = next(
            s for s in resp.json()["sessions"] if s["session_id"] == "sess-revived"
        )
        assert session["current_status"] == "running"
        assert session["terminal_result"] is None
        assert session["session_name"] == "Renamed session"

    async def test_list_all_sessions(self, client):
        await client.post("/api/events", json=_make_event(session_id="sess-all-1"))
        await client.post("/api/events", json=_make_event(
            session_id="sess-all-2", event_type="session.completed"
        ))
        resp = await client.get("/api/sessions")
        assert resp.status_code == 200
        ids = {s["session_id"] for s in resp.json()["sessions"]}
        assert "sess-all-1" in ids
        assert "sess-all-2" in ids

    async def test_list_devices(self, client):
        await client.post(
            "/api/events",
            json=_make_event(
                session_id="sess-device-old",
                event_type="session.completed",
                event_time="2026-06-18T08:00:00+00:00",
                machine={
                    "hostname": "studio-mac",
                    "os": "darwin",
                    "arch": "arm64",
                    "user": "chunqiu",
                    "machine_id": "machine-1",
                },
            ),
        )
        await client.post(
            "/api/events",
            json=_make_event(
                session_id="sess-device-live",
                event_type="session.heartbeat",
                event_time="2026-06-18T08:05:00+00:00",
                machine={
                    "hostname": "studio-mac-renamed",
                    "os": "darwin",
                    "arch": "arm64",
                    "user": "chunqiu",
                    "machine_id": "machine-1",
                },
            ),
        )

        resp = await client.get("/api/devices")

        assert resp.status_code == 200
        devices = resp.json()["devices"]
        assert len(devices) == 1
        assert devices[0]["device_key"] == "id:machine-1"
        assert devices[0]["device_name"] == "studio-mac-renamed"
        assert devices[0]["last_connected_at"].startswith("2026-06-18T08:05:00")
        assert devices[0]["latest_session_id"] == "sess-device-live"
        assert devices[0]["open_session_count"] == 1
        assert devices[0]["session_count"] == 2

    async def test_filter_by_status(self, client):
        await client.post("/api/events", json=_make_event(session_id="sess-f1"))
        await client.post("/api/events", json=_make_event(
            session_id="sess-f2", event_type="session.completed"
        ))
        resp = await client.get("/api/sessions", params={"status": "completed"})
        ids = {s["session_id"] for s in resp.json()["sessions"]}
        assert "sess-f2" in ids
        assert "sess-f1" not in ids

    async def test_filter_by_agent_type(self, client):
        await client.post("/api/events", json=_make_event(
            session_id="sess-cc", agent_type="claude_code"
        ))
        await client.post("/api/events", json=_make_event(session_id="sess-cx"))
        resp = await client.get("/api/sessions", params={"agent_type": "claude_code"})
        ids = {s["session_id"] for s in resp.json()["sessions"]}
        assert "sess-cc" in ids
        assert "sess-cx" not in ids

    async def test_session_not_found(self, client):
        resp = await client.get("/api/sessions/nonexistent")
        assert resp.status_code == 404

    async def test_session_events(self, client):
        await client.post("/api/events", json=_make_event(session_id="sess-ev"))
        await client.post("/api/events", json=_make_event(
            session_id="sess-ev", event_type="session.heartbeat"
        ))
        resp = await client.get("/api/sessions/sess-ev/events")
        assert resp.status_code == 200
        events = resp.json()["events"]
        assert len(events) == 2
        assert events[0]["event_type"] == "session.started"

    async def test_recent_events_feed(self, client):
        await client.post("/api/events", json=_make_event(
            session_id="sess-msg",
            event_type="session.started",
            workspace={"project_name": "Runlight"},
        ))
        await client.post("/api/events", json=_make_event(
            session_id="sess-msg",
            event_type="message.finished",
            summary="Done",
        ))

        resp = await client.get("/api/events/recent", params={"limit": 10})

        assert resp.status_code == 200
        events = resp.json()["events"]
        assert len(events) == 1
        assert events[0]["event_type"] == "message.finished"
        assert events[0]["agent_type"] == "codex"
        assert events[0]["workspace_project_name"] == "Runlight"

    async def test_cross_user_isolation(self, client):
        await client.post(
            "/api/events",
            json=_make_event(session_id="sess-alice-private"),
            headers={"Authorization": "Bearer test-token-1"},
        )
        resp = await client.get("/api/sessions/sess-alice-private")
        assert resp.status_code == 404

    async def test_current_user_no_token(self, client):
        resp = await client.get("/api/users/current")
        assert resp.status_code == 200
        assert resp.json()["user_id"] == "default"

    async def test_current_user_with_token(self, client):
        resp = await client.get(
            "/api/users/current",
            headers={"Authorization": "Bearer test-token-1"},
        )
        assert resp.status_code == 200
        assert resp.json()["user_id"] == "user-alice"
