"""Integration tests for the ingest API."""

from datetime import datetime, timezone


def _make_event(**overrides) -> dict:
    base = {
        "session_id": "sess-001",
        "agent_type": "codex",
        "adapter_name": "codex-hook",
        "event_type": "session.started",
        "event_time": datetime.now(timezone.utc).isoformat(),
    }
    base.update(overrides)
    return base


class TestIngestSingleEvent:
    async def test_ingest_no_token_default_user(self, client):
        resp = await client.post("/api/events", json=_make_event())
        assert resp.status_code == 200
        data = resp.json()
        assert data["session_id"] == "sess-001"
        assert data["status"] == "starting"

    async def test_ingest_valid_token(self, client):
        resp = await client.post(
            "/api/events",
            json=_make_event(session_id="sess-alice"),
            headers={"Authorization": "Bearer test-token-1"},
        )
        assert resp.status_code == 200
        assert resp.json()["session_id"] == "sess-alice"

    async def test_ingest_unknown_token_rejected(self, client):
        resp = await client.post(
            "/api/events",
            json=_make_event(),
            headers={"Authorization": "Bearer bad-token"},
        )
        assert resp.status_code == 401

    async def test_ingest_creates_session(self, client):
        await client.post("/api/events", json=_make_event(session_id="sess-new"))
        resp = await client.get("/api/sessions/sess-new")
        assert resp.status_code == 200
        data = resp.json()
        assert data["session_id"] == "sess-new"
        assert data["agent_type"] == "codex"
        assert data["current_status"] == "starting"

    async def test_ingest_updates_session_status(self, client):
        await client.post("/api/events", json=_make_event(
            session_id="sess-status", event_type="session.started"
        ))
        await client.post("/api/events", json=_make_event(
            session_id="sess-status", event_type="session.heartbeat"
        ))
        resp = await client.get("/api/sessions/sess-status")
        assert resp.json()["current_status"] == "running"

    async def test_ingest_with_machine_and_workspace(self, client):
        ev = _make_event(
            session_id="sess-meta",
            machine={"hostname": "dev-box", "os": "darwin"},
            workspace={"cwd": "/project", "git_branch": "main"},
        )
        await client.post("/api/events", json=ev)
        resp = await client.get("/api/sessions/sess-meta")
        data = resp.json()
        assert data["machine_hostname"] == "dev-box"
        assert data["workspace_cwd"] == "/project"
        assert data["workspace_git_branch"] == "main"

    async def test_ingest_summary_updated(self, client):
        await client.post("/api/events", json=_make_event(
            session_id="sess-sum", event_type="session.started"
        ))
        await client.post("/api/events", json=_make_event(
            session_id="sess-sum",
            event_type="session.summary.updated",
            summary="Fixing auth bug",
        ))
        resp = await client.get("/api/sessions/sess-sum")
        data = resp.json()
        assert data["summary"] == "Fixing auth bug"
        assert data["summary_inferred"] is False


class TestIngestBatch:
    async def test_batch_ingest(self, client):
        events = [
            _make_event(session_id="sess-batch", event_type="session.started",
                        event_id="ev-b1"),
            _make_event(session_id="sess-batch", event_type="session.heartbeat",
                        event_id="ev-b2"),
        ]
        resp = await client.post("/api/events", json={"events": events})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["events"]) == 2


class TestDeduplication:
    async def test_dedupe_key_prevents_duplicate(self, client):
        ev = _make_event(session_id="sess-dedup", dedupe_key="dk-001")
        await client.post("/api/events", json=ev)
        await client.post("/api/events", json=ev)
        resp = await client.get("/api/sessions/sess-dedup/events")
        assert len(resp.json()["events"]) == 1
