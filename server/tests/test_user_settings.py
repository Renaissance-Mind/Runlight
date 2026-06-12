"""Tests for user dashboard settings."""


class TestUserSettings:
    async def test_defaults(self, client):
        resp = await client.get("/api/user-settings")

        assert resp.status_code == 200
        assert resp.json()["settings"] == {
            "theme": "dark",
            "language": "system",
            "updated_at": None,
        }

    async def test_save_and_read_user_settings(self, client):
        resp = await client.patch(
            "/api/user-settings",
            json={"theme": "light", "language": "zh-CN"},
            headers={"Authorization": "Bearer test-token-1"},
        )

        assert resp.status_code == 200
        assert resp.json()["settings"]["theme"] == "light"
        assert resp.json()["settings"]["language"] == "zh-CN"

        resp = await client.get(
            "/api/user-settings",
            headers={"Authorization": "Bearer test-token-1"},
        )
        assert resp.json()["settings"]["theme"] == "light"
        assert resp.json()["settings"]["language"] == "zh-CN"
