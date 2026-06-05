"""Passive synchronization from local Codex thread state."""

from __future__ import annotations

import json
import os
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from agent_monitor.db.models import Session


@dataclass(frozen=True)
class CodexThreadSnapshot:
    thread_id: str
    title: str
    cwd: str | None
    git_branch: str | None
    git_sha: str | None
    created_at: datetime
    updated_at: datetime


def _codex_path(env_name: str, default_name: str) -> Path:
    return Path(os.environ.get(env_name) or Path.home() / ".codex" / default_name)


def _timestamp_from_ms(ms_value: int | None, fallback_seconds: int | None) -> datetime:
    if ms_value:
        return datetime.fromtimestamp(ms_value / 1000, timezone.utc)
    if fallback_seconds:
        return datetime.fromtimestamp(fallback_seconds, timezone.utc)
    return datetime.now(timezone.utc)


def _timestamp_from_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _project_name(cwd: str | None) -> str | None:
    if not cwd:
        return None
    return Path(cwd).name or None


def _pinned_thread_ids() -> list[str] | None:
    path = _codex_path("AGENT_MONITOR_CODEX_GLOBAL_STATE", ".codex-global-state.json")
    if not path.is_file():
        return None

    pinned = json.loads(path.read_text()).get("pinned-thread-ids", [])
    if not isinstance(pinned, list):
        return []

    ids: list[str] = []
    seen: set[str] = set()
    for thread_id in pinned:
        if isinstance(thread_id, str) and thread_id and thread_id not in seen:
            ids.append(thread_id)
            seen.add(thread_id)
    return ids


def _session_index_titles(pinned: set[str]) -> dict[str, tuple[str, datetime | None]]:
    path = _codex_path("AGENT_MONITOR_CODEX_SESSION_INDEX", "session_index.jsonl")
    if not path.is_file():
        return {}

    titles: dict[str, tuple[str, datetime | None]] = {}
    with path.open() as f:
        for line in f:
            if not line.strip():
                continue
            item = json.loads(line)
            thread_id = item.get("id")
            if thread_id not in pinned:
                continue
            title = str(item.get("thread_name") or "").strip()
            if not title:
                continue
            updated_at = _timestamp_from_iso(item.get("updated_at"))
            current = titles.get(thread_id)
            if current is None or (
                updated_at is not None
                and (current[1] is None or updated_at > current[1])
            ):
                titles[thread_id] = (title, updated_at)
    return titles


def _codex_thread_rows(pinned_ids: list[str]) -> dict[str, sqlite3.Row]:
    path = _codex_path("AGENT_MONITOR_CODEX_STATE_DB", "state_5.sqlite")
    if not pinned_ids or not path.is_file():
        return {}

    placeholders = ", ".join("?" for _ in pinned_ids)
    with sqlite3.connect(path) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            f"""
            SELECT
                id, title, cwd, git_branch, git_sha,
                created_at, updated_at, created_at_ms, updated_at_ms
            FROM threads
            WHERE id IN ({placeholders})
            """,
            pinned_ids,
        ).fetchall()
    return {row["id"]: row for row in rows}


def _codex_pinned_snapshots() -> dict[str, CodexThreadSnapshot] | None:
    pinned_ids = _pinned_thread_ids()
    if pinned_ids is None:
        return None

    pinned = set(pinned_ids)
    rows = _codex_thread_rows(pinned_ids)
    index_titles = _session_index_titles(pinned)

    snapshots: dict[str, CodexThreadSnapshot] = {}
    now = datetime.now(timezone.utc)
    for thread_id in pinned_ids:
        row = rows.get(thread_id)
        index_title, index_updated_at = index_titles.get(thread_id, ("", None))

        title = index_title
        if not title and row is not None:
            title = str(row["title"]).strip()
        if not title:
            title = thread_id
        cwd = str(row["cwd"]).strip() if row is not None and row["cwd"] else None
        created_at = (
            _timestamp_from_ms(row["created_at_ms"], row["created_at"])
            if row is not None
            else index_updated_at or now
        )
        updated_at = (
            index_updated_at
            or (
                _timestamp_from_ms(row["updated_at_ms"], row["updated_at"])
                if row is not None
                else now
            )
        )
        snapshots[thread_id] = CodexThreadSnapshot(
            thread_id=thread_id,
            title=title,
            cwd=cwd,
            git_branch=(
                str(row["git_branch"]).strip()
                if row is not None and row["git_branch"]
                else None
            ),
            git_sha=(
                str(row["git_sha"]).strip()
                if row is not None and row["git_sha"]
                else None
            ),
            created_at=created_at,
            updated_at=updated_at,
        )
    return snapshots


async def sync_codex_pinned_sessions(db: AsyncSession, user_id: str) -> bool:
    snapshots = _codex_pinned_snapshots()
    if snapshots is None:
        return False

    pinned_ids = set(snapshots)
    sync_filter = Session.session_pin.is_(True)
    if pinned_ids:
        sync_filter = or_(sync_filter, Session.session_id.in_(pinned_ids))

    result = await db.execute(
        select(Session)
        .where(Session.user_id == user_id)
        .where(Session.agent_type == "codex")
        .where(sync_filter)
    )
    existing = {session.session_id: session for session in result.scalars().all()}

    changed = False
    for session in existing.values():
        next_pin = session.session_id in pinned_ids
        if session.session_pin != next_pin:
            session.session_pin = next_pin
            changed = True

    for thread_id, snapshot in snapshots.items():
        session = existing.get(thread_id)
        if session is None:
            session = Session(
                session_id=thread_id,
                session_name=snapshot.title,
                session_pin=True,
                user_id=user_id,
                agent_type="codex",
                adapter_name="codex-state",
                adapter_version=None,
                current_status="completed",
                started_at=snapshot.created_at,
                last_event_at=snapshot.updated_at,
                latest_event_type="codex.thread.pinned",
                terminal_result="completed",
                event_count=0,
            )
            db.add(session)
            changed = True
        else:
            if session.session_name != snapshot.title:
                session.session_name = snapshot.title
                changed = True

        if session.workspace_cwd != snapshot.cwd:
            session.workspace_cwd = snapshot.cwd
            changed = True
        if session.workspace_git_branch != snapshot.git_branch:
            session.workspace_git_branch = snapshot.git_branch
            changed = True
        if session.workspace_git_commit != snapshot.git_sha:
            session.workspace_git_commit = snapshot.git_sha
            changed = True
        project_name = _project_name(snapshot.cwd)
        if session.workspace_project_name != project_name:
            session.workspace_project_name = project_name
            changed = True

    return changed
