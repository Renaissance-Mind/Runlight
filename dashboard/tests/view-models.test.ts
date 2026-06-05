import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { summarizeSessionsForSurface } from "../src/api/viewModels.ts";

describe("pet-ready session view models", () => {
  it("summarizes sessions without React component dependencies", () => {
    const summary = summarizeSessionsForSurface([
      {
        current_status: "running",
        latest_event_type: "tool.started",
        session_name: "Build",
        summary: null,
        session_id: "s1",
      },
      {
        current_status: "waiting_user",
        latest_event_type: "permission.requested",
        session_name: null,
        summary: "Needs approval",
        session_id: "s2",
      },
    ]);

    assert.deepEqual(summary.counts, {
      running: 1,
      stale: 0,
      failed: 0,
      waiting: 1,
    });
    assert.equal(summary.latest?.label, "Build");
    assert.equal(summary.latest?.eventType, "tool.started");
  });
});
