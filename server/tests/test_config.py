"""Tests for server configuration defaults."""

from agent_monitor.config import Settings


def test_server_port_defaults_to_adapter_port():
    settings = Settings()

    assert settings.server_port == 8766
