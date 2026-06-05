"""Event ingestion service."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from agent_monitor.db.models import Event
from agent_monitor.protocol import EventEnvelope


async def store_event(db: AsyncSession, envelope: EventEnvelope, user_id: str) -> Event:
    if envelope.dedupe_key:
        existing = await db.execute(
            select(Event).where(Event.dedupe_key == envelope.dedupe_key)
        )
        found = existing.scalar_one_or_none()
        if found:
            return found

    event = Event(
        event_id=envelope.event_id,
        session_id=envelope.session_id,
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
    return event


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
