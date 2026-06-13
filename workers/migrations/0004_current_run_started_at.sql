-- Track when the current active run/turn began for cloud dashboard sessions.

ALTER TABLE sessions ADD COLUMN current_run_started_at TEXT;
