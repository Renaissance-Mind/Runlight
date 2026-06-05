"""Tests for server configuration defaults."""

from agent_monitor.config import Settings


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
