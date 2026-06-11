"""Tests for server configuration defaults."""

from runlight.config import Settings


def test_server_port_defaults_to_adapter_port():
    settings = Settings()

    assert settings.server_port == 8766


def test_cors_origins_keeps_wildcard_default():
    settings = Settings()

    assert settings.get_cors_origins() == ["*"]


def test_token_map_ignores_blank_entries():
    settings = Settings(token_map="tok-a:user-a, ,tok-b:user-b")

    assert settings.get_token_map() == {
        "tok-a": "user-a",
        "tok-b": "user-b",
    }


def test_runlight_env_prefix_takes_precedence(monkeypatch):
    monkeypatch.setenv("RUNLIGHT_TOKEN_MAP", "tok-new:user-new")
    monkeypatch.setenv("AGENT_MONITOR_TOKEN_MAP", "tok-old:user-old")

    settings = Settings()

    assert settings.get_token_map() == {"tok-new": "user-new"}


def test_legacy_agent_monitor_env_prefix_still_works(monkeypatch):
    monkeypatch.delenv("RUNLIGHT_TOKEN_MAP", raising=False)
    monkeypatch.setenv("AGENT_MONITOR_TOKEN_MAP", "tok-old:user-old")

    settings = Settings()

    assert settings.get_token_map() == {"tok-old": "user-old"}
