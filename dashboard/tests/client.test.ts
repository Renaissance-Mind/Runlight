import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";

import {
  createUploadToken,
  deleteSession,
  deleteUploadToken,
  fetchCurrentUser,
  fetchUploadTokens,
  probeServerConnection,
} from "../src/api/client.ts";

let serverUrl = "";
let lastAuthorization: string | undefined;

const server = createServer((req, res) => {
  lastAuthorization = req.headers.authorization;
  res.setHeader("Content-Type", "application/json");

  if (req.url === "/api/health") {
    res.end(JSON.stringify({ status: "ok", service: "runlight" }));
    return;
  }

  if (req.url === "/html/api/health") {
    res.setHeader("Content-Type", "text/html");
    res.end("<!doctype html><html><body>Runlight</body></html>");
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

  if (req.url === "/api/tokens" && req.method === "GET") {
    res.end(JSON.stringify({
      tokens: [
        {
          id: 42,
          token_preview: "rl_tok_abcd...7890",
          created_at: "2026-06-11T08:00:00.000Z",
        },
      ],
    }));
    return;
  }

  if (req.url === "/api/tokens" && req.method === "POST") {
    res.end(JSON.stringify({
      token: {
        id: 43,
        user_id: "user-alice",
        token: "rl_tok_secret",
        token_preview: "rl_tok_sec...cret",
        created_at: "2026-06-11T08:01:00.000Z",
      },
    }));
    return;
  }

  if (req.url === "/api/tokens/42" && req.method === "DELETE") {
    res.end(JSON.stringify({ deleted: 42 }));
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

  it("reports HTML responses as server URL mistakes instead of JSON parser errors", async () => {
    const probe = await probeServerConnection({ serverUrl: `${serverUrl}/html`, token: "" });

    assert.equal(probe.ok, false);
    assert.match(probe.error ?? "", /API returned HTML instead of JSON/);
    assert.doesNotMatch(probe.error ?? "", /Unexpected token/);
  });

  it("deletes a session with the configured token", async () => {
    await deleteSession("sess-delete", { serverUrl, token: "tok-user-1" });

    assert.equal(lastAuthorization, "Bearer tok-user-1");
  });

  it("manages upload tokens through the configured server", async () => {
    const config = { serverUrl, token: "tok-user-1" };

    assert.deepEqual(await fetchUploadTokens(config), [
      {
        id: 42,
        token_preview: "rl_tok_abcd...7890",
        created_at: "2026-06-11T08:00:00.000Z",
      },
    ]);
    assert.deepEqual(await createUploadToken(config), {
      id: 43,
      user_id: "user-alice",
      token: "rl_tok_secret",
      token_preview: "rl_tok_sec...cret",
      created_at: "2026-06-11T08:01:00.000Z",
    });
    await deleteUploadToken(42, config);

    assert.equal(lastAuthorization, "Bearer tok-user-1");
  });
});
