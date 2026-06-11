"""Tests for database models and basic CRUD."""

from datetime import datetime, timezone

from runlight.db.models import Event, Machine, Session, Token, User


class TestModels:
    async def test_create_user(self, db_session):
        user = User(user_id="alice", display_name="Alice")
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
        assert user.id is not None
        assert user.user_id == "alice"

    async def test_create_token(self, db_session):
        token = Token(token_value="tok-123", user_id="alice")
        db_session.add(token)
        await db_session.commit()
        await db_session.refresh(token)
        assert token.id is not None

    async def test_create_session(self, db_session):
        sess = Session(
            session_id="sess-001",
            user_id="default",
            agent_type="codex",
            adapter_name="codex-hook",
            current_status="starting",
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(sess)
        await db_session.commit()
        await db_session.refresh(sess)
        assert sess.id is not None
        assert sess.current_status == "starting"
        assert sess.event_count == 0

    async def test_create_event(self, db_session):
        ev = Event(
            event_id="ev-001",
            session_id="sess-001",
            user_id="default",
            agent_type="codex",
            adapter_name="codex-hook",
            event_type="session.started",
            event_time=datetime.now(timezone.utc),
            received_time=datetime.now(timezone.utc),
        )
        db_session.add(ev)
        await db_session.commit()
        await db_session.refresh(ev)
        assert ev.id is not None

    async def test_create_machine(self, db_session):
        m = Machine(machine_id="mid-1", hostname="dev-box", os="darwin", arch="arm64")
        db_session.add(m)
        await db_session.commit()
        await db_session.refresh(m)
        assert m.id is not None


class TestHealthEndpoint:
    async def test_health(self, client):
        resp = await client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["service"] == "runlight"
