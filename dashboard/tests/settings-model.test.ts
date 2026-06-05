import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatConnectionStatus,
  normalizeSettingsDraft,
} from "../src/api/settingsModel.ts";

describe("dashboard settings model", () => {
  it("formats server probe state for the settings entry point", () => {
    assert.deepEqual(formatConnectionStatus(null), {
      label: "Checking server",
      tone: "muted",
    });

    assert.deepEqual(
      formatConnectionStatus({
        ok: true,
        serverUrl: "http://127.0.0.1:8766",
        userId: "default",
        tokenConfigured: false,
        checkedAt: "2026-06-05T04:30:00.000Z",
        error: null,
      }),
      {
        label: "default / no token",
        tone: "ok",
      },
    );

    assert.deepEqual(
      formatConnectionStatus({
        ok: false,
        serverUrl: "http://127.0.0.1:8766",
        userId: null,
        tokenConfigured: true,
        checkedAt: "2026-06-05T04:30:00.000Z",
        error: "API 401: Unauthorized",
      }),
      {
        label: "Disconnected: API 401: Unauthorized",
        tone: "error",
      },
    );
  });

  it("normalizes settings drafts before saving", () => {
    assert.deepEqual(
      normalizeSettingsDraft({
        serverUrl: " https://monitor.example.com/// ",
        token: " tok-user-1 ",
      }),
      {
        serverUrl: "https://monitor.example.com",
        token: " tok-user-1 ",
      },
    );
  });
});
