"""Tests for session query endpoints."""

import json
import sqlite3
from datetime import datetime, timedelta, timezone

from agent_monitor.db.models import Session
from agent_monitor.services.session_service import refresh_session_statuses

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


def _write_codex_state(tmp_path, monkeypatch, pinned_ids, rows):
    global_state = tmp_path / ".codex-global-state.json"
    state_db = tmp_path / "state_5.sqlite"
    session_index = tmp_path / "session_index.jsonl"

    global_state.write_text(json.dumps({"pinned-thread-ids": pinned_ids}))
    session_index.write_text("")

    conn = sqlite3.connect(state_db)
    conn.execute(
        """
        CREATE TABLE threads (
            id TEXT PRIMARY KEY,
            rollout_path TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            source TEXT NOT NULL,
            model_provider TEXT NOT NULL,
            cwd TEXT NOT NULL,
            title TEXT NOT NULL,
            sandbox_policy TEXT NOT NULL,
            approval_mode TEXT NOT NULL,
            git_sha TEXT,
            git_branch TEXT,
            archived INTEGER NOT NULL DEFAULT 0,
            created_at_ms INTEGER,
            updated_at_ms INTEGER
        )
        """
    )
    for row in rows:
        conn.execute(
            """
            INSERT INTO threads (
                id, rollout_path, created_at, updated_at, source, model_provider,
                cwd, title, sandbox_policy, approval_mode, git_sha, git_branch,
                archived, created_at_ms, updated_at_ms
            ) VALUES (?, '', 1780000000, 1780000100, 'vscode', 'openai',
                ?, ?, 'danger-full-access', 'never', ?, ?, 0,
                1780000000000, 1780000100000)
            """,
            (
                row["id"],
                row["cwd"],
                row["title"],
                row.get("git_sha"),
                row.get("git_branch"),
            ),
        )
    conn.commit()
    conn.close()

    monkeypatch.setenv("AGENT_MONITOR_CODEX_GLOBAL_STATE", str(global_state))
    monkeypatch.setenv("AGENT_MONITOR_CODEX_STATE_DB", str(state_db))
    monkeypatch.setenv("AGENT_MONITOR_CODEX_SESSION_INDEX", str(session_index))


class TestSessionQueries:
    async def test_live_sessions_imports_codex_pinned_threads(
        self, client, tmp_path, monkeypatch
    ):
        _write_codex_state(
            tmp_path,
            monkeypatch,
            pinned_ids=["codex-pin-1"],
            rows=[
                {
                    "id": "codex-pin-1",
                    "title": "Pinned Codex thread",
                    "cwd": "/Users/caopu/workspace/AgentMonitor",
                    "git_sha": "abc1234",
                    "git_branch": "main",
                }
            ],
        )

        resp = await client.get("/api/sessions/live")
        assert resp.status_code == 200
        session = next(
            (
                s
                for s in resp.json()["sessions"]
                if s["session_id"] == "codex-pin-1"
            ),
            None,
        )
        assert session is not None
        assert session["session_pin"] is True
        assert session["session_name"] == "Pinned Codex thread"
        assert session["adapter_name"] == "codex-state"
        assert session["workspace_cwd"] == "/Users/caopu/workspace/AgentMonitor"

    async def test_live_sessions_keeps_terminal_codex_pinned_threads(
        self, client, tmp_path, monkeypatch
    ):
        _write_codex_state(
            tmp_path,
            monkeypatch,
            pinned_ids=["sess-done-pinned"],
            rows=[
                {
                    "id": "sess-done-pinned",
                    "title": "Pinned completed thread",
                    "cwd": "/Users/caopu/workspace/AgentMonitor",
                }
            ],
        )
        await client.post(
            "/api/events",
            json=_make_event(
                session_id="sess-done-pinned",
                event_type="session.completed",
                session_pin=False,
            ),
        )

        resp = await client.get("/api/sessions/live")
        assert resp.status_code == 200
        session = next(
            (
                s
                for s in resp.json()["sessions"]
                if s["session_id"] == "sess-done-pinned"
            ),
            None,
        )
        assert session is not None
        assert session["session_pin"] is True
        assert session["current_status"] == "completed"

    async def test_live_sessions_keeps_codex_pin_without_thread_metadata(
        self, client, tmp_path, monkeypatch
    ):
        _write_codex_state(
            tmp_path,
            monkeypatch,
            pinned_ids=["codex-pin-without-thread-row"],
            rows=[],
        )

        resp = await client.get("/api/sessions/live")
        assert resp.status_code == 200
        session = next(
            (
                s
                for s in resp.json()["sessions"]
                if s["session_id"] == "codex-pin-without-thread-row"
            ),
            None,
        )
        assert session is not None
        assert session["session_pin"] is True
        assert session["session_name"] == "codex-pin-without-thread-row"

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
