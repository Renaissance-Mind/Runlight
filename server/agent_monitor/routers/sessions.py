"""Session query endpoints."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from agent_monitor.auth import resolve_user
from agent_monitor.db.session import get_db
from agent_monitor.services.codex_state_service import sync_codex_pinned_sessions
from agent_monitor.services.event_service import get_events_for_session
from agent_monitor.services.session_service import (
    get_all_sessions,
    get_live_sessions,
    get_session_by_id,
)

router = APIRouter(prefix="/api", tags=["sessions"])


async def _sync_codex_pins(db: AsyncSession, user_id: str) -> None:
    if await sync_codex_pinned_sessions(db, user_id):
        await db.commit()


def _session_dict(s) -> dict:
    return {
        "session_id": s.session_id,
        "session_name": s.session_name,
        "session_pin": s.session_pin,
        "user_id": s.user_id,
        "agent_type": s.agent_type,
        "adapter_name": s.adapter_name,
        "adapter_version": s.adapter_version,
        "summary": s.summary,
        "summary_inferred": s.summary_inferred,
        "machine_hostname": s.machine_hostname,
        "machine_os": s.machine_os,
        "workspace_cwd": s.workspace_cwd,
        "workspace_git_branch": s.workspace_git_branch,
        "workspace_project_name": s.workspace_project_name,
        "current_status": s.current_status,
        "latest_event_type": s.latest_event_type,
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "last_event_at": s.last_event_at.isoformat() if s.last_event_at else None,
        "last_heartbeat_at": s.last_heartbeat_at.isoformat() if s.last_heartbeat_at else None,
        "event_count": s.event_count,
        "terminal_result": s.terminal_result,
    }


def _event_dict(e) -> dict:
    return {
        "event_id": e.event_id,
        "session_id": e.session_id,
        "session_name": e.session_name,
        "session_pin": e.session_pin,
        "event_type": e.event_type,
        "event_time": e.event_time.isoformat() if e.event_time else None,
        "received_time": e.received_time.isoformat() if e.received_time else None,
        "severity": e.severity,
        "summary": e.summary,
        "machine_hostname": e.machine_hostname,
        "workspace_cwd": e.workspace_cwd,
        "payload": json.loads(e.payload_json) if e.payload_json else None,
    }


@router.get("/sessions/live")
async def live_sessions(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(resolve_user),
):
    await _sync_codex_pins(db, user_id)
    sessions = await get_live_sessions(db, user_id)
    return {"sessions": [_session_dict(s) for s in sessions]}


@router.get("/sessions")
async def list_sessions(
    agent_type: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(resolve_user),
):
    await _sync_codex_pins(db, user_id)
    sessions = await get_all_sessions(db, user_id, agent_type, status, limit, offset)
    return {"sessions": [_session_dict(s) for s in sessions]}


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(resolve_user),
):
    await _sync_codex_pins(db, user_id)
    session = await get_session_by_id(db, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Session not found")
    return _session_dict(session)


@router.get("/sessions/{session_id}/events")
async def get_session_events(
    session_id: str,
    limit: int = Query(200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(resolve_user),
):
    await _sync_codex_pins(db, user_id)
    session = await get_session_by_id(db, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Session not found")
    events = await get_events_for_session(db, session_id, limit)
    return {"events": [_event_dict(e) for e in events]}
