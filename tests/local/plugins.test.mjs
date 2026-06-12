import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { installClaudePlugin, installCodexPlugin, pluginStatus, uninstallClaudePlugin, uninstallCodexPlugin } from "../../src/local/plugins.js";

async function tempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("local plugin installers", () => {
  it("installs Codex hooks that call the daemon CLI", async () => {
    const home = await tempDir("runlight-codex-home-");
    const env = { ...process.env, CODEX_HOME: home };

    const result = await installCodexPlugin({ env, command: "node /repo/bin/runlight.js hook codex" });
    const hooks = JSON.parse(await fs.readFile(result.hooksFile, "utf8"));

    assert.equal(hooks.hooks.SessionStart[0].hooks[0].command, "node /repo/bin/runlight.js hook codex");
    assert.equal(hooks.hooks.PreToolUse[0].hooks[0].timeout, 3);
    assert.equal(hooks.hooks.PreToolUse[0].hooks[0].timeout_ms, undefined);

    const status = await pluginStatus({ env });
    assert.equal(status.codex.installed, true);

    await uninstallCodexPlugin({ env });
    const after = JSON.parse(await fs.readFile(result.hooksFile, "utf8"));
    assert.equal(after.hooks.SessionStart, undefined);
  });

  it("installs Claude hooks as async daemon CLI commands", async () => {
    const dir = await tempDir("runlight-claude-home-");
    const settingsFile = path.join(dir, "settings.json");
    const env = { ...process.env, CLAUDE_SETTINGS_FILE: settingsFile };

    const result = await installClaudePlugin({ env, command: "runlight hook claude" });
    const settings = JSON.parse(await fs.readFile(result.settingsFile, "utf8"));

    assert.equal(settings.hooks.SessionStart[0].hooks[0].command, "runlight hook claude");
    assert.equal(settings.hooks.SessionStart[0].hooks[0].async, true);

    const status = await pluginStatus({ env });
    assert.equal(status.claude.installed, true);

    await uninstallClaudePlugin({ env });
    const after = JSON.parse(await fs.readFile(result.settingsFile, "utf8"));
    assert.equal(after.hooks.SessionStart, undefined);
  });
});
