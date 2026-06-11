"""Event ingestion service."""

from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from runlight.db.models import Event, Session
from runlight.protocol import EventEnvelope

# Events that represent something "finishing" — a turn completing or a
# session reaching a terminal state. These drive the message log feed.
COMPLETION_EVENT_TYPES = (
    "message.finished",
    "session.completed",
    "session.failed",
    "session.aborted",
)


async def store_event(
    db: AsyncSession, envelope: EventEnvelope, user_id: str
) -> tuple[Event, bool]:
    if envelope.dedupe_key:
        existing = await db.execute(
            select(Event).where(Event.dedupe_key == envelope.dedupe_key)
        )
        found = existing.scalar_one_or_none()
        if found:
            return found, False

    event = Event(
        event_id=envelope.event_id,
        session_id=envelope.session_id,
        session_name=envelope.session_name,
        session_pin=envelope.session_pin,
        user_id=user_id,
        agent_type=envelope.agent_type,
        adapter_name=envelope.adapter_name,
        adapter_version=envelope.adapter_version,
        event_type=envelope.event_type,
        event_time=envelope.event_time,
        received_time=datetime.now(timezone.utc),
        sequence=envelope.sequence,
        severity=envelope.severity.value,
        summary=envelope.summary,
        machine_hostname=envelope.machine.hostname if envelope.machine else None,
        workspace_cwd=envelope.workspace.cwd if envelope.workspace else None,
        payload_json=json.dumps(envelope.payload) if envelope.payload else None,
        dedupe_key=envelope.dedupe_key,
    )
    db.add(event)
    return event, True


async def get_events_for_session(
    db: AsyncSession, session_id: str, limit: int = 200
) -> list[Event]:
    result = await db.execute(
        select(Event)
        .where(Event.session_id == session_id)
        .order_by(Event.event_time.asc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_recent_events(
    db: AsyncSession,
    user_id: str,
    event_types: Sequence[str] | None = None,
    limit: int = 100,
) -> list[tuple[Event, str | None]]:
    """Recent events across all of a user's sessions, newest first.

    Returns (event, workspace_project_name) tuples.
    """
    query = (
        select(Event, Session.workspace_project_name)
        .join(Session, Event.session_id == Session.session_id, isouter=True)
        .where(Event.user_id == user_id)
    )
    if event_types:
        query = query.where(Event.event_type.in_(list(event_types)))
    query = query.order_by(Event.event_time.desc()).limit(limit)
    result = await db.execute(query)
    return list(result.tuples().all())
