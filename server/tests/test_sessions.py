"""Tests for session query endpoints."""

from datetime import datetime, timezone


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
