import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildPetSurfaceSnapshot } from "../src/api/petSurface.ts";

describe("pet surface snapshot", () => {
  it("builds a stable status snapshot for future pet clients", () => {
    const snapshot = buildPetSurfaceSnapshot(
      [
        {
          current_status: "waiting_user",
          latest_event_type: "permission.requested",
          session_name: "Approve command",
          summary: null,
          session_id: "s1",
        },
        {
          current_status: "running",
          latest_event_type: "tool.started",
          session_name: "Build",
          summary: null,
          session_id: "s2",
        },
      ],
      "2026-06-05T04:30:00.000Z",
    );

    assert.deepEqual(snapshot, {
      schemaVersion: "runlight.pet-surface.v1",
      mood: "waiting",
      attentionLevel: "medium",
      counts: {
        running: 1,
        finished: 0,
        stale: 0,
        failed: 0,
        waiting: 1,
      },
      latest: {
        sessionId: "s1",
        label: "Approve command",
        eventType: "permission.requested",
        status: "waiting_user",
      },
      generatedAt: "2026-06-05T04:30:00.000Z",
    });
  });
});
