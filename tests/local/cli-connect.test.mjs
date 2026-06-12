import assert from "node:assert/strict";
import http from "node:http";
import { after, describe, it } from "node:test";
import {
  buildCliConnectUrl,
  waitForCliConnectToken,
} from "../../src/local/cli.js";

const servers = [];

after(async () => {
  for (const close of servers.reverse()) await close();
});

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address()));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

describe("CLI browser connect handoff", () => {
  it("builds a dashboard connect URL with the one-time CLI code", () => {
    assert.equal(
      buildCliConnectUrl("https://runlight.example.com/api/health", "rl_cli_abc123"),
      "https://runlight.example.com/connect?cli_code=rl_cli_abc123",
    );
  });

  it("polls until the browser-created token is available", async () => {
    const requests = [];
    const server = http.createServer((req, res) => {
      requests.push(req.url);
      res.setHeader("Content-Type", "application/json");
      if (requests.length === 1) {
        res.writeHead(202);
        res.end(JSON.stringify({ status: "pending" }));
        return;
      }
      res.end(JSON.stringify({ status: "complete", token: "rl_tok_connected" }));
    });
    const address = await listen(server);
    servers.push(() => closeServer(server));

    const token = await waitForCliConnectToken(
      `http://127.0.0.1:${address.port}`,
      "rl_cli_abcdefghijklmnopqrstuvwxyz123456",
      { timeoutMs: 1000, intervalMs: 1 },
    );

    assert.equal(token, "rl_tok_connected");
    assert.deepEqual(requests, [
      "/api/connect/cli/rl_cli_abcdefghijklmnopqrstuvwxyz123456",
      "/api/connect/cli/rl_cli_abcdefghijklmnopqrstuvwxyz123456",
    ]);
  });
});
