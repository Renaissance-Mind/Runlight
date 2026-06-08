import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";

import {
  deleteSession,
  fetchCurrentUser,
  probeServerConnection,
} from "../src/api/client.ts";

let serverUrl = "";
let lastAuthorization: string | undefined;

const server = createServer((req, res) => {
  lastAuthorization = req.headers.authorization;
  res.setHeader("Content-Type", "application/json");

  if (req.url === "/api/health") {
    res.end(JSON.stringify({ status: "ok", service: "agent-monitor" }));
    return;
  }

  if (req.url === "/api/users/current") {
    res.end(JSON.stringify({ user_id: lastAuthorization ? "user-alice" : "default" }));
    return;
  }

  if (req.url === "/api/sessions/sess-delete" && req.method === "DELETE") {
    res.end(JSON.stringify({ deleted: "sess-delete" }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: "not found" }));
});

describe("dashboard runtime API client", () => {
  before(async () => {
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          throw new Error("missing server address");
        }
        serverUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("fetches current user with the configured token", async () => {
    const user = await fetchCurrentUser({ serverUrl, token: "tok-user-1" });

    assert.deepEqual(user, { user_id: "user-alice" });
    assert.equal(lastAuthorization, "Bearer tok-user-1");
  });

  it("probes health and current user for reusable dashboard surfaces", async () => {
    const probe = await probeServerConnection({ serverUrl, token: "" });

    assert.equal(probe.ok, true);
    assert.equal(probe.serverUrl, serverUrl);
    assert.equal(probe.userId, "default");
    assert.equal(probe.tokenConfigured, false);
    assert.equal(typeof probe.checkedAt, "string");
    assert.equal(probe.error, null);
  });

  it("deletes a session with the configured token", async () => {
    await deleteSession("sess-delete", { serverUrl, token: "tok-user-1" });

    assert.equal(lastAuthorization, "Bearer tok-user-1");
  });
});
