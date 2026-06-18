"""Session management service."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from runlight.db.models import Event, Session
from runlight.protocol import EventEnvelope, TERMINAL_EVENT_TYPES
from runlight.services.status_engine import (
    infer_status,
    is_run_finish_event,
    is_run_start_event,
)

RUNNING_STATUSES = {
    "starting",
    "running",
    "tool_running",
    "command_running",
    "waiting_user",
    "waiting_external",
}
TERMINAL_STATUSES = {"completed", "failed", "aborted"}


def _clean(value: str | None) -> str | None:
    cleaned = value.strip() if value else None
    return cleaned or None


def _time_value(value: datetime | None) -> float:
    return value.timestamp() if value else 0


def _latest_datetime(*values: datetime | None) -> datetime | None:
    present = [value for value in values if value is not None]
    return max(present, key=_time_value) if present else None


def _earliest_datetime(*values: datetime | None) -> datetime | None:
    present = [value for value in values if value is not None]
    return min(present, key=_time_value) if present else None


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _device_key(session: Session) -> str:
    machine_id = _clean(session.machine_id)
    if machine_id:
        return f"id:{machine_id}"
    hostname = _clean(session.machine_hostname)
    if hostname:
        return f"host:{hostname}"
    return "unknown"


def _device_name(session: Session) -> str:
    return (
        _clean(session.machine_hostname)
        or _clean(session.machine_id)
        or "Unknown device"
    )


def _device_meta(session: Session) -> str | None:
    parts = [
        part
        for part in (_clean(session.machine_os), _clean(session.machine_user))
        if part
    ]
    return " / ".join(parts) if parts else None


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

    prev_status = session.current_status

    if is_run_start_event(envelope.event_type):
        session.active_run_started_at = envelope.event_time
    elif is_run_finish_event(envelope.event_type):
        session.active_run_started_at = None

    session.current_status = infer_status(
        latest_event_type=session.latest_event_type,
        last_heartbeat_at=session.last_heartbeat_at,
        terminal_result=session.terminal_result,
        last_event_at=session.last_event_at,
        active_run_started_at=session.active_run_started_at,
    )

    if is_run_start_event(envelope.event_type):
        session.current_run_started_at = envelope.event_time
    elif session.current_status in RUNNING_STATUSES and prev_status not in RUNNING_STATUSES:
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
            active_run_started_at=session.active_run_started_at,
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


async def get_devices(db: AsyncSession, user_id: str) -> list[dict]:
    result = await db.execute(
        select(Session).where(Session.user_id == user_id)
    )

    devices: dict[str, dict] = {}
    for session in result.scalars().all():
        key = _device_key(session)
        row_last_connected = _latest_datetime(
            session.last_heartbeat_at,
            session.last_event_at,
            session.started_at,
        )
        row_first_seen = _earliest_datetime(
            session.started_at,
            session.last_event_at,
            session.last_heartbeat_at,
        )
        open_increment = 0 if session.current_status in TERMINAL_STATUSES else 1
        existing = devices.get(key)

        if existing is None:
            devices[key] = {
                "device_key": key,
                "device_name": _device_name(session),
                "device_meta": _device_meta(session),
                "machine_hostname": _clean(session.machine_hostname),
                "machine_os": _clean(session.machine_os),
                "machine_arch": _clean(session.machine_arch),
                "machine_user": _clean(session.machine_user),
                "machine_id": _clean(session.machine_id),
                "first_seen_at": row_first_seen,
                "last_connected_at": row_last_connected,
                "last_event_at": session.last_event_at,
                "last_heartbeat_at": session.last_heartbeat_at,
                "latest_session_id": session.session_id,
                "latest_session_status": session.current_status,
                "open_session_count": open_increment,
                "session_count": 1,
            }
            continue

        next_last_connected = _latest_datetime(
            existing["last_connected_at"],
            row_last_connected,
        )
        row_is_latest = (
            row_last_connected is not None
            and _time_value(row_last_connected) >= _time_value(existing["last_connected_at"])
        )
        if row_is_latest:
            existing["device_name"] = _device_name(session)
            existing["device_meta"] = _device_meta(session) or existing["device_meta"]
            existing["machine_hostname"] = _clean(session.machine_hostname) or existing["machine_hostname"]
            existing["machine_os"] = _clean(session.machine_os) or existing["machine_os"]
            existing["machine_arch"] = _clean(session.machine_arch) or existing["machine_arch"]
            existing["machine_user"] = _clean(session.machine_user) or existing["machine_user"]
            existing["machine_id"] = _clean(session.machine_id) or existing["machine_id"]
            existing["latest_session_id"] = session.session_id
            existing["latest_session_status"] = session.current_status

        existing["first_seen_at"] = _earliest_datetime(existing["first_seen_at"], row_first_seen)
        existing["last_connected_at"] = next_last_connected
        existing["last_event_at"] = _latest_datetime(existing["last_event_at"], session.last_event_at)
        existing["last_heartbeat_at"] = _latest_datetime(existing["last_heartbeat_at"], session.last_heartbeat_at)
        existing["open_session_count"] += open_increment
        existing["session_count"] += 1

    def serialize(device: dict) -> dict:
        return {
            **device,
            "first_seen_at": _iso(device["first_seen_at"]),
            "last_connected_at": _iso(device["last_connected_at"]),
            "last_event_at": _iso(device["last_event_at"]),
            "last_heartbeat_at": _iso(device["last_heartbeat_at"]),
        }

    return [
        serialize(device)
        for device in sorted(
            devices.values(),
            key=lambda item: _time_value(item["last_connected_at"]),
            reverse=True,
        )
    ]


async def get_session_by_id(db: AsyncSession, session_id: str) -> Session | None:
    result = await db.execute(
        select(Session).where(Session.session_id == session_id)
    )
    return result.scalar_one_or_none()


async def delete_session(db: AsyncSession, session_id: str) -> None:
    await db.execute(delete(Event).where(Event.session_id == session_id))
    await db.execute(delete(Session).where(Session.session_id == session_id))
