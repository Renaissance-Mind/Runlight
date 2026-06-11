-- OAuth browser login and dashboard session support.

CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    return_to TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_oauth_states_expires ON oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS oauth_identities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    email TEXT,
    display_name TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS ix_oauth_identities_user ON oauth_identities(user_id);

CREATE TABLE IF NOT EXISTS auth_sessions (
    session_token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS ix_auth_sessions_expires ON auth_sessions(expires_at);
