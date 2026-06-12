import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  groupSessionsByDevice,
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
        workspace_project_name: "Runlight",
        workspace_cwd: "/Users/caopu/workspace/Runlight/server",
        session_id: "s1",
      },
      {
        workspace_project_name: null,
        workspace_cwd: "/Users/caopu/workspace/Flow-Factory",
        session_id: "s2",
      },
      {
        workspace_project_name: "Runlight",
        workspace_cwd: "/Users/caopu/workspace/Runlight/dashboard",
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
        { projectName: "Runlight", sessionIds: ["s1", "s3"] },
        { projectName: "Flow-Factory", sessionIds: ["s2"] },
        { projectName: "Unknown project", sessionIds: ["s4"] },
      ],
    );
  });

  it("groups sessions by device using machine id as the stable key", () => {
    const groups = groupSessionsByDevice([
      {
        machine_id: "mid-1",
        machine_hostname: "studio-mac",
        machine_os: "darwin",
        machine_user: "chunqiu",
        session_id: "s1",
      },
      {
        machine_id: null,
        machine_hostname: "remote-linux",
        machine_os: "linux",
        machine_user: null,
        session_id: "s2",
      },
      {
        machine_id: "mid-1",
        machine_hostname: "studio-mac-renamed",
        machine_os: "darwin",
        machine_user: "chunqiu",
        session_id: "s3",
      },
      {
        machine_id: null,
        machine_hostname: "remote-linux",
        machine_os: "linux",
        machine_user: null,
        session_id: "s4",
      },
      {
        machine_id: null,
        machine_hostname: null,
        machine_os: null,
        machine_user: null,
        session_id: "s5",
      },
    ]);

    assert.deepEqual(
      groups.map((group) => ({
        deviceKey: group.deviceKey,
        deviceName: group.deviceName,
        deviceMeta: group.deviceMeta,
        sessionIds: group.sessions.map((session) => session.session_id),
      })),
      [
        {
          deviceKey: "id:mid-1",
          deviceName: "studio-mac",
          deviceMeta: "darwin / chunqiu",
          sessionIds: ["s1", "s3"],
        },
        {
          deviceKey: "host:remote-linux",
          deviceName: "remote-linux",
          deviceMeta: "linux",
          sessionIds: ["s2", "s4"],
        },
        {
          deviceKey: "unknown",
          deviceName: "Unknown device",
          deviceMeta: null,
          sessionIds: ["s5"],
        },
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
