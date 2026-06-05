"""Shared test fixtures."""

from __future__ import annotations

import os

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from agent_monitor.db.models import Base

os.environ["AGENT_MONITOR_DATABASE_URL"] = "sqlite+aiosqlite://"
os.environ["AGENT_MONITOR_TOKEN_MAP"] = "test-token-1:user-alice,test-token-2:user-bob"
os.environ["AGENT_MONITOR_CODEX_GLOBAL_STATE"] = (
    "/tmp/agent-monitor-test-missing-global-state.json"
)
os.environ["AGENT_MONITOR_CODEX_STATE_DB"] = (
    "/tmp/agent-monitor-test-missing-state_5.sqlite"
)
os.environ["AGENT_MONITOR_CODEX_SESSION_INDEX"] = (
    "/tmp/agent-monitor-test-missing-session_index.jsonl"
)


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite://", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session

    await engine.dispose()


@pytest_asyncio.fixture
async def client():
    import agent_monitor.db.engine as eng
    import agent_monitor.db.session as sess

    engine = create_async_engine("sqlite+aiosqlite://", echo=False)
    eng._engine = engine
    sess._session_factory = None

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    from agent_monitor.app import create_app

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    sess._session_factory = None
    eng._engine = None
    await engine.dispose()
