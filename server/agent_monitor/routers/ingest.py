"""Event ingest endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from agent_monitor.auth import resolve_user
from agent_monitor.db.session import get_db
from agent_monitor.protocol import EventBatch, EventEnvelope
from agent_monitor.services.event_service import store_event
from agent_monitor.services.session_service import upsert_session

router = APIRouter(prefix="/api", tags=["ingest"])


def _event_response(event, session) -> dict:
    return {
        "event_id": event.event_id,
        "session_id": session.session_id,
        "status": session.current_status,
    }


@router.post("/events")
async def ingest_events(
    body: EventEnvelope | EventBatch,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(resolve_user),
):
    if isinstance(body, EventEnvelope):
        event = await store_event(db, body, user_id)
        session = await upsert_session(db, body, user_id)
        await db.commit()
        return _event_response(event, session)

    results = []
    for envelope in body.events:
        event = await store_event(db, envelope, user_id)
        session = await upsert_session(db, envelope, user_id)
        results.append(_event_response(event, session))
    await db.commit()
    return {"events": results}
