import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";
import { promptSecret } from "../../src/local/prompts.js";

class FakeTtyInput extends EventEmitter {
  isTTY = true;
  isRaw = false;
  paused = true;
  pauseCalls = 0;
  resumeCalls = 0;
  rawModes = [];

  setRawMode(value) {
    this.isRaw = value;
    this.rawModes.push(value);
  }

  resume() {
    this.paused = false;
    this.resumeCalls += 1;
    return this;
  }

  pause() {
    this.paused = true;
    this.pauseCalls += 1;
    return this;
  }

  isPaused() {
    return this.paused;
  }
}

describe("local CLI prompts", () => {
  it("restores a paused TTY input after reading a secret", async () => {
    const stdin = new FakeTtyInput();
    const stdout = { output: "", write(chunk) { this.output += chunk; return true; } };
    const secret = promptSecret("Token", { stdin, stdout });

    stdin.emit("keypress", "s", {});
    stdin.emit("keypress", "3", {});
    stdin.emit("keypress", "", { name: "return" });

    assert.equal(await secret, "s3");
    assert.deepEqual(stdin.rawModes, [true, false]);
    assert.equal(stdin.resumeCalls, 1);
    assert.equal(stdin.pauseCalls, 1);
    assert.equal(stdin.isPaused(), true);
    assert.equal(stdout.output, "Token: **\n");
  });
});
