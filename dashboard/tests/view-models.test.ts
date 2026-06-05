import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  groupSessionsByProject,
  mergeProjectOrder,
  moveProjectInOrder,
  summarizeSessionsForSurface,
} from "../src/api/viewModels.ts";

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
      {
        current_status: "completed",
        latest_event_type: "message.finished",
        session_name: "Done turn",
        summary: null,
        session_id: "s3",
      },
    ]);

    assert.deepEqual(summary.counts, {
      running: 1,
      finished: 1,
      stale: 0,
      failed: 0,
      waiting: 1,
    });
    assert.equal(summary.latest?.label, "Build");
    assert.equal(summary.latest?.eventType, "tool.started");
  });

  it("groups sessions by project while preserving session order", () => {
    const groups = groupSessionsByProject([
      {
        workspace_project_name: "AgentMonitor",
        workspace_cwd: "/Users/caopu/workspace/AgentMonitor/server",
        session_id: "s1",
      },
      {
        workspace_project_name: null,
        workspace_cwd: "/Users/caopu/workspace/Flow-Factory",
        session_id: "s2",
      },
      {
        workspace_project_name: "AgentMonitor",
        workspace_cwd: "/Users/caopu/workspace/AgentMonitor/dashboard",
        session_id: "s3",
      },
      {
        workspace_project_name: "/",
        workspace_cwd: "/",
        session_id: "s4",
      },
    ]);

    assert.deepEqual(
      groups.map((group) => ({
        projectName: group.projectName,
        sessionIds: group.sessions.map((session) => session.session_id),
      })),
      [
        { projectName: "AgentMonitor", sessionIds: ["s1", "s3"] },
        { projectName: "Flow-Factory", sessionIds: ["s2"] },
        { projectName: "Unknown project", sessionIds: ["s4"] },
      ],
    );
  });

  it("keeps saved project order and appends new projects", () => {
    assert.deepEqual(
      mergeProjectOrder(["Beta", "Alpha", "Gamma"], ["Alpha", "Beta"]),
      ["Alpha", "Beta", "Gamma"],
    );
  });

  it("removes missing projects from saved project order", () => {
    assert.deepEqual(mergeProjectOrder(["Beta", "Gamma"], ["Alpha", "Beta"]), [
      "Beta",
      "Gamma",
    ]);
  });

  it("moves projects within the saved order", () => {
    assert.deepEqual(moveProjectInOrder(["Alpha", "Beta", "Gamma"], "Beta", "up"), [
      "Beta",
      "Alpha",
      "Gamma",
    ]);
    assert.deepEqual(
      moveProjectInOrder(["Alpha", "Beta", "Gamma"], "Beta", "down"),
      ["Alpha", "Gamma", "Beta"],
    );
  });

  it("keeps project order unchanged at movement boundaries", () => {
    assert.deepEqual(
      moveProjectInOrder(["Alpha", "Beta", "Gamma"], "Alpha", "up"),
      ["Alpha", "Beta", "Gamma"],
    );
    assert.deepEqual(
      moveProjectInOrder(["Alpha", "Beta", "Gamma"], "Gamma", "down"),
      ["Alpha", "Beta", "Gamma"],
    );
    assert.deepEqual(
      moveProjectInOrder(["Alpha", "Beta", "Gamma"], "Missing", "down"),
      ["Alpha", "Beta", "Gamma"],
    );
  });
});
