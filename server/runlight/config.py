"""Server configuration from environment variables."""

from __future__ import annotations

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings

DEFAULT_USER_ID = "default"


class Settings(BaseSettings):
    model_config = {"env_prefix": "", "populate_by_name": True}

    server_host: str = Field(
        "127.0.0.1",
        validation_alias=AliasChoices("RUNLIGHT_SERVER_HOST", "AGENT_MONITOR_SERVER_HOST"),
    )
    server_port: int = Field(
        8766,
        validation_alias=AliasChoices("RUNLIGHT_SERVER_PORT", "AGENT_MONITOR_SERVER_PORT"),
    )
    database_url: str = Field(
        "sqlite+aiosqlite:///runlight.db",
        validation_alias=AliasChoices("RUNLIGHT_DATABASE_URL", "AGENT_MONITOR_DATABASE_URL"),
    )
    token_map: str = Field(
        "",
        validation_alias=AliasChoices("RUNLIGHT_TOKEN_MAP", "AGENT_MONITOR_TOKEN_MAP"),
    )
    allowed_tokens: str = Field(
        "",
        validation_alias=AliasChoices("RUNLIGHT_ALLOWED_TOKENS", "AGENT_MONITOR_ALLOWED_TOKENS"),
    )
    heartbeat_stale_seconds: int = Field(
        120,
        validation_alias=AliasChoices(
            "RUNLIGHT_HEARTBEAT_STALE_SECONDS",
            "AGENT_MONITOR_HEARTBEAT_STALE_SECONDS",
        ),
    )
    event_retention_days: int = Field(
        30,
        validation_alias=AliasChoices("RUNLIGHT_EVENT_RETENTION_DAYS", "AGENT_MONITOR_EVENT_RETENTION_DAYS"),
    )
    session_retention_days: int = Field(
        90,
        validation_alias=AliasChoices("RUNLIGHT_SESSION_RETENTION_DAYS", "AGENT_MONITOR_SESSION_RETENTION_DAYS"),
    )
    cors_origins: str = Field(
        "*",
        validation_alias=AliasChoices("RUNLIGHT_CORS_ORIGINS", "AGENT_MONITOR_CORS_ORIGINS"),
    )
    max_payload_bytes: int = Field(
        65536,
        validation_alias=AliasChoices("RUNLIGHT_MAX_PAYLOAD_BYTES", "AGENT_MONITOR_MAX_PAYLOAD_BYTES"),
    )

    def get_token_map(self) -> dict[str, str]:
        result: dict[str, str] = {}
        if self.allowed_tokens:
            for t in self.allowed_tokens.split(","):
                t = t.strip()
                if t:
                    result[t] = DEFAULT_USER_ID
        if self.token_map:
            for entry in self.token_map.split(","):
                entry = entry.strip()
                if ":" not in entry:
                    continue
                token, user_id = entry.split(":", 1)
                token = token.strip()
                user_id = user_id.strip()
                if token and user_id:
                    result[token] = user_id
        return result

    def get_cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
