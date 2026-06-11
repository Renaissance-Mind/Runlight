"""Base adapter client for Runlight."""

from __future__ import annotations

import json
import os
import platform
import threading
import time
import uuid
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx


def _env(primary: str, legacy: str) -> str | None:
    return os.environ.get(primary) or os.environ.get(legacy)


def _machine_info() -> dict:
    return {
        "hostname": platform.node(),
        "os": platform.system().lower(),
        "arch": platform.machine(),
        "user": os.environ.get("USER", os.environ.get("USERNAME", "")),
    }


def _workspace_info() -> dict:
    cwd = os.getcwd()
    info: dict[str, Any] = {"cwd": cwd}
    try:
        import subprocess

        result = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            cwd=cwd,
            timeout=5,
        )
        if result.returncode == 0:
            info["repo_root"] = result.stdout.strip()

        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True,
            text=True,
            cwd=cwd,
            timeout=5,
        )
        if result.returncode == 0:
            info["git_branch"] = result.stdout.strip()

        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            cwd=cwd,
            timeout=5,
        )
        if result.returncode == 0:
            info["git_commit"] = result.stdout.strip()[:12]
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass

    info["project_name"] = Path(cwd).name
    return info


class RunlightClient:
    """Client for sending events to Runlight server."""

    def __init__(
        self,
        server_url: str | None = None,
        token: str | None = None,
        agent_type: str = "generic",
        adapter_name: str = "python-adapter",
        adapter_version: str = "0.1.0",
        heartbeat_interval: int = 30,
        max_queue_size: int = 500,
        max_retries: int = 3,
        redact_keys: list[str] | None = None,
    ):
        raw_server_url = (
            server_url
            or _env("RUNLIGHT_SERVER_URL", "AGENT_MONITOR_SERVER_URL")
            or "http://127.0.0.1:8766"
        )
        self.server_url = raw_server_url.strip().rstrip("/")
        raw_token = token if token is not None else _env("RUNLIGHT_TOKEN", "AGENT_MONITOR_TOKEN")
        self.token = raw_token.strip() if raw_token is not None else None
        if self.token == "":
            self.token = None
        self.agent_type = agent_type
        self.adapter_name = adapter_name
        self.adapter_version = adapter_version
        self.heartbeat_interval = heartbeat_interval
        self.max_retries = max_retries
        self.redact_keys = set(redact_keys or [
            "api_key", "secret", "password", "token", "authorization",
            "aws_secret_access_key", "private_key",
        ])

        self._client = httpx.Client(timeout=10)
        self._offline_queue: deque[dict] = deque(maxlen=max_queue_size)
        self._heartbeat_thread: threading.Thread | None = None
        self._heartbeat_stop = threading.Event()
        self._active_session_id: str | None = None
        self._sequence = 0

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def _redact_payload(self, payload: dict | None) -> dict | None:
        if not payload:
            return payload
        redacted = {}
        for k, v in payload.items():
            if k.lower() in self.redact_keys:
                redacted[k] = "***REDACTED***"
            elif isinstance(v, dict):
                redacted[k] = self._redact_payload(v)
            else:
                redacted[k] = v
        return redacted

    def _send_event(self, event: dict) -> dict | None:
        event["payload"] = self._redact_payload(event.get("payload"))

        for attempt in range(self.max_retries):
            try:
                resp = self._client.post(
                    f"{self.server_url}/api/events",
                    json=event,
                    headers=self._headers(),
                )
                resp.raise_for_status()
                return resp.json()
            except (httpx.HTTPError, httpx.ConnectError):
                if attempt == self.max_retries - 1:
                    self._offline_queue.append(event)
                    return None
                time.sleep(0.5 * (attempt + 1))
        return None

    def _next_sequence(self) -> int:
        self._sequence += 1
        return self._sequence

    def _build_event(
        self,
        session_id: str,
        event_type: str,
        severity: str = "info",
        summary: str | None = None,
        payload: dict | None = None,
        dedupe_key: str | None = None,
        machine: dict | None = None,
        workspace: dict | None = None,
    ) -> dict:
        return {
            "event_id": str(uuid.uuid4()),
            "session_id": session_id,
            "agent_type": self.agent_type,
            "adapter_name": self.adapter_name,
            "adapter_version": self.adapter_version,
            "event_type": event_type,
            "event_time": datetime.now(timezone.utc).isoformat(),
            "sequence": self._next_sequence(),
            "severity": severity,
            "summary": summary,
            "machine": machine,
            "workspace": workspace,
            "payload": payload,
            "dedupe_key": dedupe_key,
        }

    def start_session(
        self,
        session_id: str | None = None,
        summary: str | None = None,
    ) -> str:
        sid = session_id or str(uuid.uuid4())
        self._active_session_id = sid
        self._sequence = 0

        event = self._build_event(
            session_id=sid,
            event_type="session.started",
            summary=summary,
            machine=_machine_info(),
            workspace=_workspace_info(),
        )
        self._send_event(event)
        self._start_heartbeat(sid)
        return sid

    def record_event(
        self,
        event_type: str,
        session_id: str | None = None,
        severity: str = "info",
        summary: str | None = None,
        payload: dict | None = None,
        dedupe_key: str | None = None,
    ) -> None:
        sid = session_id or self._active_session_id
        if not sid:
            raise ValueError("No active session")
        event = self._build_event(
            session_id=sid,
            event_type=event_type,
            severity=severity,
            summary=summary,
            payload=payload,
            dedupe_key=dedupe_key,
        )
        self._send_event(event)

    def update_summary(self, summary: str, session_id: str | None = None) -> None:
        self.record_event(
            "session.summary.updated",
            session_id=session_id,
            summary=summary,
        )

    def finish_session(
        self,
        result: str = "completed",
        summary: str | None = None,
        session_id: str | None = None,
        payload: dict | None = None,
    ) -> None:
        sid = session_id or self._active_session_id
        if not sid:
            raise ValueError("No active session")

        self._stop_heartbeat()

        event = self._build_event(
            session_id=sid,
            event_type=f"session.{result}",
            summary=summary,
            payload=payload,
        )
        self._send_event(event)
        self._flush_offline_queue()

        if self._active_session_id == sid:
            self._active_session_id = None

    def flush_offline_queue(self) -> int:
        return self._flush_offline_queue()

    def _flush_offline_queue(self) -> int:
        flushed = 0
        while self._offline_queue:
            event = self._offline_queue[0]
            event["dedupe_key"] = event.get("dedupe_key") or f"offline-{event['event_id']}"
            try:
                resp = self._client.post(
                    f"{self.server_url}/api/events",
                    json=event,
                    headers=self._headers(),
                )
                resp.raise_for_status()
                self._offline_queue.popleft()
                flushed += 1
            except (httpx.HTTPError, httpx.ConnectError):
                break
        return flushed

    def _start_heartbeat(self, session_id: str) -> None:
        self._heartbeat_stop.clear()

        def heartbeat_loop():
            while not self._heartbeat_stop.wait(self.heartbeat_interval):
                event = self._build_event(
                    session_id=session_id,
                    event_type="session.heartbeat",
                    severity="debug",
                )
                self._send_event(event)

        self._heartbeat_thread = threading.Thread(
            target=heartbeat_loop, daemon=True, name="runlight-heartbeat"
        )
        self._heartbeat_thread.start()

    def _stop_heartbeat(self) -> None:
        self._heartbeat_stop.set()
        if self._heartbeat_thread:
            self._heartbeat_thread.join(timeout=5)
            self._heartbeat_thread = None

    def close(self) -> None:
        self._stop_heartbeat()
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


AgentMonitorClient = RunlightClient
