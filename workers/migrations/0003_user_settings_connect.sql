-- User preferences and CLI/browser setup handoff.

CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    theme TEXT NOT NULL DEFAULT 'dark',
    language TEXT NOT NULL DEFAULT 'system',
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cli_connect_tokens (
    code TEXT PRIMARY KEY,
    token_value TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_cli_connect_tokens_expires ON cli_connect_tokens(expires_at);
