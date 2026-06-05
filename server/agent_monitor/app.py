"""FastAPI application factory."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agent_monitor.config import settings
from agent_monitor.db.engine import dispose_engine, get_engine
from agent_monitor.db.models import Base
from agent_monitor.db.schema import ensure_schema
from agent_monitor.db.session import reset_session_factory


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await ensure_schema(conn)
    yield
    reset_session_factory()
    await dispose_engine()


def create_app() -> FastAPI:
    app = FastAPI(
        title="AgentMonitor",
        description="Passive observability server for agent task execution",
        version="0.1.0",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.get_cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    from agent_monitor.routers import health, ingest, sessions, users

    app.include_router(health.router)
    app.include_router(ingest.router)
    app.include_router(sessions.router)
    app.include_router(users.router)

    return app


app = create_app()
