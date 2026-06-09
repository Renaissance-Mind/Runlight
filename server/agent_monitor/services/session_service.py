"""Session management service."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from agent_monitor.db.models import Event, Session
from agent_monitor.protocol import EventEnvelope, TERMINAL_EVENT_TYPES
from agent_monitor.services.status_engine import infer_status


async def upsert_session(db: AsyncSession, envelope: EventEnvelope, user_id: str) -> Session:
    result = await db.execute(
        select(Session).where(Session.session_id == envelope.session_id)
    )
    session = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)

    if session is None:
        session = Session(
            session_id=envelope.session_id,
            session_name=envelope.session_name,
            session_pin=envelope.session_pin,
            user_id=user_id,
            agent_type=envelope.agent_type,
            adapter_name=envelope.adapter_name,
            adapter_version=envelope.adapter_version,
            current_status="starting",
            started_at=envelope.event_time,
            event_count=0,
        )
        db.add(session)

    if envelope.session_name:
        session.session_name = envelope.session_name
    session.session_pin = envelope.session_pin

    if envelope.machine:
        session.machine_hostname = envelope.machine.hostname
        session.machine_os = envelope.machine.os
        session.machine_arch = envelope.machine.arch
        session.machine_user = envelope.machine.user
        session.machine_id = envelope.machine.machine_id

    if envelope.workspace:
        session.workspace_cwd = envelope.workspace.cwd
        session.workspace_repo_root = envelope.workspace.repo_root
        session.workspace_git_branch = envelope.workspace.git_branch
        session.workspace_git_commit = envelope.workspace.git_commit
        session.workspace_project_name = envelope.workspace.project_name

    if envelope.event_type == "session.summary.updated" and envelope.summary:
        session.summary = envelope.summary
        session.summary_inferred = False
    elif not session.summary and envelope.summary:
        session.summary = envelope.summary
        session.summary_inferred = True

    if envelope.event_type == "session.heartbeat":
        session.last_heartbeat_at = envelope.event_time

    if envelope.event_type in TERMINAL_EVENT_TYPES:
        session.terminal_result = envelope.event_type.split(".")[-1]
    else:
        session.terminal_result = None

    session.latest_event_type = envelope.event_type
    session.last_event_at = envelope.event_time
    session.event_count += 1
    session.updated_at = now

    RUNNING_STATUSES = {"starting", "running", "tool_running", "command_running", "waiting_user", "waiting_external"}
    prev_status = session.current_status

    session.current_status = infer_status(
        latest_event_type=session.latest_event_type,
        last_heartbeat_at=session.last_heartbeat_at,
        terminal_result=session.terminal_result,
        last_event_at=session.last_event_at,
    )

    if session.current_status in RUNNING_STATUSES and prev_status not in RUNNING_STATUSES:
        session.current_run_started_at = envelope.event_time

    return session


async def refresh_session_statuses(db: AsyncSession, user_id: str) -> bool:
    terminal = {"completed", "failed", "aborted"}
    result = await db.execute(
        select(Session)
        .where(Session.user_id == user_id)
        .where(Session.current_status.notin_(terminal))
    )

    changed = False
    for session in result.scalars().all():
        next_status = infer_status(
            latest_event_type=session.latest_event_type,
            last_heartbeat_at=session.last_heartbeat_at,
            terminal_result=session.terminal_result,
            last_event_at=session.last_event_at,
        )
        if session.current_status != next_status:
            session.current_status = next_status
            changed = True
    return changed


async def get_live_sessions(db: AsyncSession, user_id: str) -> list[Session]:
    terminal = {"completed", "failed", "aborted"}
    result = await db.execute(
        select(Session)
        .where(Session.user_id == user_id)
        .where(
            or_(
                Session.current_status.notin_(terminal),
                Session.session_pin.is_(True),
            )
        )
        .order_by(Session.last_event_at.desc())
    )
    return list(result.scalars().all())


async def get_all_sessions(
    db: AsyncSession,
    user_id: str,
    agent_type: str | None = None,
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Session]:
    query = select(Session).where(Session.user_id == user_id)
    if agent_type:
        query = query.where(Session.agent_type == agent_type)
    if status:
        query = query.where(Session.current_status == status)
    query = query.order_by(Session.started_at.desc()).limit(limit).offset(offset)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_session_by_id(db: AsyncSession, session_id: str) -> Session | None:
    result = await db.execute(
        select(Session).where(Session.session_id == session_id)
    )
    return result.scalar_one_or_none()


async def delete_session(db: AsyncSession, session_id: str) -> None:
    await db.execute(delete(Event).where(Event.session_id == session_id))
    await db.execute(delete(Session).where(Session.session_id == session_id))
