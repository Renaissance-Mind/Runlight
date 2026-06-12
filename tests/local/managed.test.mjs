import assert from "node:assert/strict";
import http from "node:http";
import { after, describe, it } from "node:test";
import { findAvailablePort, normalizeListenPort } from "../../src/local/managed.js";

const servers = [];

after(async () => {
  for (const close of servers.reverse()) await close();
});

function listen(server, port) {
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve(server.address()));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

describe("managed local components", () => {
  it("normalizes port answers with a default", () => {
    assert.equal(normalizeListenPort("", 18765), 18765);
    assert.equal(normalizeListenPort("19999", 18765), 19999);
    assert.throws(() => normalizeListenPort("abc", 18765), /Invalid port/);
  });

  it("finds the next available port when the preferred port is occupied", async () => {
    const occupied = http.createServer((_req, res) => res.end("occupied"));
    const address = await listen(occupied, 0);
    servers.push(() => closeServer(occupied));

    const port = await findAvailablePort(address.port, "127.0.0.1");

    assert.notEqual(port, address.port);
    assert.equal(port > address.port, true);
  });

  it("skips ports reserved by the current setup plan", async () => {
    const port = await findAvailablePort(18765, "127.0.0.1", [18765, 18766]);

    assert.equal(port >= 18767, true);
    assert.notEqual(port, 18765);
    assert.notEqual(port, 18766);
  });
});
