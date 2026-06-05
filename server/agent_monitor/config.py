"""Server configuration from environment variables."""

from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = {"env_prefix": "AGENT_MONITOR_"}

    server_host: str = "127.0.0.1"
    server_port: int = 8765
    database_url: str = "sqlite+aiosqlite:///agent_monitor.db"
    token_map: str = ""
    heartbeat_stale_seconds: int = 120
    event_retention_days: int = 30
    session_retention_days: int = 90
    cors_origins: str = "*"
    max_payload_bytes: int = 65536

    def get_token_map(self) -> dict[str, str]:
        if not self.token_map:
            return {}
        pairs = {}
        for entry in self.token_map.split(","):
            entry = entry.strip()
            if ":" not in entry:
                continue
            token, user_id = entry.split(":", 1)
            pairs[token.strip()] = user_id.strip()
        return pairs

    def get_cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
