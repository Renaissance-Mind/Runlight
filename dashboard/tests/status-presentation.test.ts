import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getStatusPresentation,
  summarizeStatusPresentationCounts,
} from "../src/api/statusPresentation.ts";

describe("dashboard status presentation", () => {
  it("maps status tones to the dashboard color palette", () => {
    const nowMs = Date.parse("2026-06-08T10:00:00Z");

    assert.equal(
      getStatusPresentation("running", "2026-06-08T09:59:00Z", nowMs)
        .dotClass,
      "bg-accent-blue",
    );
    assert.equal(
      getStatusPresentation("finished", "2026-06-08T09:30:00Z", nowMs).tone,
      "recent_finished",
    );
    assert.equal(
      getStatusPresentation("completed", "2026-06-08T09:45:00Z", nowMs)
        .dotClass,
      "bg-accent-green",
    );
    assert.equal(
      getStatusPresentation("finished", "2026-06-08T09:29:59Z", nowMs).tone,
      "finished",
    );
    assert.equal(
      getStatusPresentation("finished", "2026-06-08T09:29:59Z", nowMs)
        .dotClass,
      "bg-accent-light-green",
    );
    assert.equal(
      getStatusPresentation("stale", "2026-06-08T09:50:00Z", nowMs).dotClass,
      "bg-accent-orange",
    );
  });

  it("counts sessions by the status color buckets rendered in the HUD", () => {
    const nowMs = Date.parse("2026-06-08T10:00:00Z");

    assert.deepEqual(
      summarizeStatusPresentationCounts(
        [
          { current_status: "running", last_event_at: "2026-06-08T09:59:00Z" },
          { current_status: "tool_running", last_event_at: null },
          { current_status: "finished", last_event_at: "2026-06-08T09:45:00Z" },
          { current_status: "finished", last_event_at: "2026-06-08T09:00:00Z" },
          { current_status: "stale", last_event_at: "2026-06-08T09:50:00Z" },
          { current_status: "failed", last_event_at: "2026-06-08T09:50:00Z" },
          { current_status: "waiting_user", last_event_at: null },
        ],
        nowMs,
      ),
      {
        running: 2,
        recent_finished: 1,
        finished: 1,
        stale: 1,
        failed: 1,
        waiting: 1,
        unknown: 0,
      },
    );
  });
});
