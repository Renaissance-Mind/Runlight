"""Tests for MCP Gateway — verify MCP tools produce equivalent events to HTTP ingest."""

from datetime import datetime, timezone

from runlight.mcp_gateway import MCP_TOOLS, build_envelope_from_tool_call


class TestMCPToolDefinitions:
    def test_all_tools_defined(self):
        names = {t["name"] for t in MCP_TOOLS}
        assert names == {
            "runlight_start_session",
            "runlight_record_event",
            "runlight_heartbeat",
            "runlight_finish_session",
            "runlight_get_session_status",
        }

    def test_all_have_required_fields(self):
        for tool in MCP_TOOLS:
            assert "name" in tool
            assert "description" in tool
            assert "inputSchema" in tool


class TestBuildEnvelope:
    def test_start_session(self):
        env = build_envelope_from_tool_call("runlight_start_session", {
            "session_id": "mcp-sess-1",
            "agent_type": "codex",
            "adapter_name": "codex-mcp",
            "summary": "Working on auth",
            "machine": {"hostname": "dev", "os": "darwin"},
            "workspace": {"cwd": "/project", "git_branch": "main"},
        })
        assert env is not None
        assert env.event_type == "session.started"
        assert env.session_id == "mcp-sess-1"
        assert env.machine.hostname == "dev"
        assert env.workspace.git_branch == "main"
        assert env.summary == "Working on auth"

    def test_record_event(self):
        env = build_envelope_from_tool_call("runlight_record_event", {
            "session_id": "mcp-sess-1",
            "agent_type": "codex",
            "adapter_name": "codex-mcp",
            "event_type": "tool.started",
            "severity": "info",
            "summary": "Running grep",
            "payload": {"tool_name": "grep"},
        })
        assert env is not None
        assert env.event_type == "tool.started"
        assert env.payload == {"tool_name": "grep"}

    def test_heartbeat(self):
        env = build_envelope_from_tool_call("runlight_heartbeat", {
            "session_id": "mcp-sess-1",
            "agent_type": "codex",
            "adapter_name": "codex-mcp",
        })
        assert env is not None
        assert env.event_type == "session.heartbeat"
        assert env.severity.value == "debug"

    def test_finish_session_completed(self):
        env = build_envelope_from_tool_call("runlight_finish_session", {
            "session_id": "mcp-sess-1",
            "agent_type": "codex",
            "adapter_name": "codex-mcp",
            "result": "completed",
            "summary": "Task done",
        })
        assert env is not None
        assert env.event_type == "session.completed"
        assert env.summary == "Task done"

    def test_finish_session_failed(self):
        env = build_envelope_from_tool_call("runlight_finish_session", {
            "session_id": "mcp-sess-1",
            "agent_type": "codex",
            "adapter_name": "codex-mcp",
            "result": "failed",
        })
        assert env.event_type == "session.failed"

    def test_finish_session_aborted(self):
        env = build_envelope_from_tool_call("runlight_finish_session", {
            "session_id": "mcp-sess-1",
            "agent_type": "codex",
            "adapter_name": "codex-mcp",
            "result": "aborted",
        })
        assert env.event_type == "session.aborted"

    def test_get_session_status_returns_none(self):
        env = build_envelope_from_tool_call("runlight_get_session_status", {
            "session_id": "mcp-sess-1",
        })
        assert env is None

    def test_unknown_tool_returns_none(self):
        env = build_envelope_from_tool_call("unknown_tool", {})
        assert env is None


class TestMCPViaHTTP:
    """Verify MCP-generated events produce the same server state as direct HTTP ingest."""

    async def test_mcp_start_then_query(self, client):
        env = build_envelope_from_tool_call("runlight_start_session", {
            "session_id": "mcp-http-1",
            "agent_type": "codex",
            "adapter_name": "codex-mcp",
            "machine": {"hostname": "mcp-host"},
            "workspace": {"cwd": "/mcp-project"},
        })
        resp = await client.post("/api/events", json=env.model_dump(mode="json"))
        assert resp.status_code == 200

        resp = await client.get("/api/sessions/mcp-http-1")
        assert resp.status_code == 200
        data = resp.json()
        assert data["agent_type"] == "codex"
        assert data["machine_hostname"] == "mcp-host"

    async def test_mcp_lifecycle(self, client):
        base = {"session_id": "mcp-lc-1", "agent_type": "codex", "adapter_name": "codex-mcp"}

        start = build_envelope_from_tool_call("runlight_start_session", base)
        await client.post("/api/events", json=start.model_dump(mode="json"))

        hb = build_envelope_from_tool_call("runlight_heartbeat", base)
        await client.post("/api/events", json=hb.model_dump(mode="json"))

        resp = await client.get("/api/sessions/mcp-lc-1")
        assert resp.json()["current_status"] == "running"

        finish = build_envelope_from_tool_call("runlight_finish_session", {
            **base, "result": "completed", "summary": "Done via MCP"
        })
        await client.post("/api/events", json=finish.model_dump(mode="json"))

        resp = await client.get("/api/sessions/mcp-lc-1")
        data = resp.json()
        assert data["current_status"] == "completed"
        assert data["summary"] == "Done via MCP"
