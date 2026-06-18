import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { summarizeDeviceRows } from "../src/devices.ts";

describe("worker device summaries", () => {
  it("groups sessions by stable machine id and keeps the latest connection first", () => {
    const devices = summarizeDeviceRows([
      {
        session_id: "sess-old",
        machine_hostname: "studio-mac",
        machine_os: "darwin",
        machine_arch: "arm64",
        machine_user: "chunqiu",
        machine_id: "machine-1",
        current_status: "completed",
        started_at: "2026-06-18T08:00:00.000Z",
        last_event_at: "2026-06-18T08:03:00.000Z",
        last_heartbeat_at: null,
      },
      {
        session_id: "sess-live",
        machine_hostname: "studio-mac-renamed",
        machine_os: "darwin",
        machine_arch: "arm64",
        machine_user: "chunqiu",
        machine_id: "machine-1",
        current_status: "running",
        started_at: "2026-06-18T08:05:00.000Z",
        last_event_at: "2026-06-18T08:06:00.000Z",
        last_heartbeat_at: "2026-06-18T08:07:00.000Z",
      },
      {
        session_id: "sess-linux",
        machine_hostname: "linux-box",
        machine_os: "linux",
        machine_arch: "x64",
        machine_user: "runner",
        machine_id: null,
        current_status: "finished",
        started_at: "2026-06-18T07:00:00.000Z",
        last_event_at: "2026-06-18T07:01:00.000Z",
        last_heartbeat_at: null,
      },
    ]);

    assert.equal(devices.length, 2);
    assert.equal(devices[0].device_key, "id:machine-1");
    assert.equal(devices[0].device_name, "studio-mac-renamed");
    assert.equal(devices[0].last_connected_at, "2026-06-18T08:07:00.000Z");
    assert.equal(devices[0].latest_session_id, "sess-live");
    assert.equal(devices[0].open_session_count, 1);
    assert.equal(devices[0].session_count, 2);
    assert.equal(devices[1].device_key, "host:linux-box");
  });
});
