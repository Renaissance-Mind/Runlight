-- Initial schema for Runlight on Cloudflare D1

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,
    display_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_value TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_tokens_value ON tokens(token_value);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE,
    session_name TEXT,
    session_pin INTEGER NOT NULL DEFAULT 0,
    user_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    adapter_name TEXT NOT NULL,
    adapter_version TEXT,
    summary TEXT,
    summary_inferred INTEGER NOT NULL DEFAULT 0,
    machine_hostname TEXT,
    machine_os TEXT,
    machine_arch TEXT,
    machine_user TEXT,
    machine_id TEXT,
    workspace_cwd TEXT,
    workspace_repo_root TEXT,
    workspace_git_branch TEXT,
    workspace_git_commit TEXT,
    workspace_project_name TEXT,
    current_status TEXT NOT NULL DEFAULT 'starting',
    latest_event_type TEXT,
    started_at TEXT NOT NULL,
    last_event_at TEXT,
    last_heartbeat_at TEXT,
    event_count INTEGER NOT NULL DEFAULT 0,
    terminal_result TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_sessions_session_id ON sessions(session_id);
CREATE INDEX IF NOT EXISTS ix_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS ix_sessions_status ON sessions(current_status);
CREATE INDEX IF NOT EXISTS ix_sessions_user_status ON sessions(user_id, current_status);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE,
    session_id TEXT NOT NULL,
    session_name TEXT,
    session_pin INTEGER NOT NULL DEFAULT 0,
    user_id TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    adapter_name TEXT NOT NULL,
    adapter_version TEXT,
    event_type TEXT NOT NULL,
    event_time TEXT NOT NULL,
    received_time TEXT NOT NULL,
    sequence INTEGER,
    severity TEXT NOT NULL DEFAULT 'info',
    summary TEXT,
    machine_hostname TEXT,
    workspace_cwd TEXT,
    payload_json TEXT,
    dedupe_key TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_events_session_id ON events(session_id);
CREATE INDEX IF NOT EXISTS ix_events_event_type ON events(event_type);
CREATE INDEX IF NOT EXISTS ix_events_session_time ON events(session_id, event_time);
CREATE INDEX IF NOT EXISTS ix_events_dedupe_key ON events(dedupe_key);
