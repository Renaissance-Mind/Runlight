import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  inferStatus,
  isRunningStatus,
  nextActiveRunStartedAt,
  nextCurrentRunStartedAt,
  nextTerminalResult,
} from "../src/status.ts";

function secondsAgo(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString();
}

describe("worker status inference", () => {
  it("keeps completed action sessions finished when they go quiet outside an active run", () => {
    assert.equal(inferStatus("tool.finished", null, null, secondsAgo(300), 120), "finished");
    assert.equal(inferStatus("command.finished", null, null, secondsAgo(300), 120), "finished");
  });

  it("keeps a recent active run running after an individual tool completes", () => {
    const activeRunStartedAt = secondsAgo(60);
    assert.equal(
      inferStatus("tool.finished", null, null, secondsAgo(30), 120, activeRunStartedAt),
      "running",
    );
    assert.equal(
      inferStatus("command.finished", null, null, secondsAgo(30), 120, activeRunStartedAt),
      "running",
    );
  });

  it("marks quiet active runs stale even after an individual tool completes", () => {
    const activeRunStartedAt = secondsAgo(600);
    assert.equal(
      inferStatus("tool.finished", null, null, secondsAgo(300), 120, activeRunStartedAt),
      "stale",
    );
    assert.equal(
      inferStatus("command.finished", null, null, secondsAgo(300), 120, activeRunStartedAt),
      "stale",
    );
  });

  it("marks started action sessions stale when they go quiet", () => {
    assert.equal(inferStatus("tool.started", null, null, secondsAgo(300), 120), "stale");
    assert.equal(inferStatus("command.started", null, null, secondsAgo(300), 120), "stale");
  });

  it("preserves terminal lifecycle states", () => {
    assert.equal(inferStatus("session.completed", null, null, secondsAgo(1), 120), "completed");
    assert.equal(inferStatus("session.failed", null, null, secondsAgo(1), 120), "failed");
    assert.equal(inferStatus("session.aborted", null, null, secondsAgo(1), 120), "aborted");
  });

  it("clears stale terminal result when a non-terminal event arrives", () => {
    assert.equal(nextTerminalResult("message.started"), null);
    assert.equal(nextTerminalResult("session.heartbeat"), null);
    assert.equal(nextTerminalResult("session.completed"), "completed");
  });

  it("tracks the start time when a session re-enters a running status", () => {
    assert.equal(isRunningStatus("running"), true);
    assert.equal(isRunningStatus("finished"), false);
    assert.equal(
      nextActiveRunStartedAt("message.started", "2026-06-13T19:10:00.000Z", "old"),
      "2026-06-13T19:10:00.000Z",
    );
    assert.equal(nextActiveRunStartedAt("message.finished", "2026-06-13T19:12:00.000Z", "old"), null);
    assert.equal(
      nextCurrentRunStartedAt("running", "finished", "2026-06-13T19:10:00.000Z", "old"),
      "2026-06-13T19:10:00.000Z",
    );
    assert.equal(
      nextCurrentRunStartedAt("running", "starting", "2026-06-13T19:10:00.000Z", null, "message.started"),
      "2026-06-13T19:10:00.000Z",
    );
    assert.equal(
      nextCurrentRunStartedAt("finished", "running", "2026-06-13T19:10:00.000Z", "old"),
      "old",
    );
  });
});
