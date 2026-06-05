import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  petStateFromSurface,
  type AgentMonitorPetStateId,
} from "../src/api/petSpriteState.ts";
import type { PetSurfaceSnapshot } from "../src/api/petSurface.ts";

function snapshot(
  mood: PetSurfaceSnapshot["mood"],
  overrides: Partial<PetSurfaceSnapshot> = {},
): PetSurfaceSnapshot {
  return {
    schemaVersion: "agent-monitor.pet-surface.v1",
    mood,
    attentionLevel: "none",
    counts: {
      running: 0,
      finished: 0,
      stale: 0,
      failed: 0,
      waiting: 0,
    },
    latest: null,
    generatedAt: "2026-06-05T04:30:00.000Z",
    ...overrides,
  };
}

describe("pet sprite state mapping", () => {
  it("maps AgentMonitor moods to Petdex animation states", () => {
    const cases: Array<[PetSurfaceSnapshot["mood"], AgentMonitorPetStateId]> = [
      ["alert", "failed"],
      ["waiting", "waiting"],
      ["working", "running"],
      ["offline", "review"],
      ["idle", "idle"],
    ];

    for (const [mood, state] of cases) {
      assert.equal(petStateFromSurface(snapshot(mood)), state);
    }
  });

  it("uses latest session events for expressive prompt and completion states", () => {
    assert.equal(
      petStateFromSurface(
        snapshot("working", {
          latest: {
            sessionId: "s1",
            label: "New prompt",
            eventType: "user.prompt",
            status: "running",
          },
        }),
      ),
      "jumping",
    );

    assert.equal(
      petStateFromSurface(
        snapshot("idle", {
          latest: {
            sessionId: "s2",
            label: "Done",
            eventType: "message.finished",
            status: "completed",
          },
        }),
      ),
      "waving",
    );
  });

  it("keeps high-attention moods ahead of expressive latest events", () => {
    assert.equal(
      petStateFromSurface(
        snapshot("alert", {
          latest: {
            sessionId: "s3",
            label: "New prompt",
            eventType: "user.prompt",
            status: "running",
          },
        }),
      ),
      "failed",
    );
  });
});
