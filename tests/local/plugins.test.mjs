import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  enableCodexHooksFeatureToml,
  installAllAgentPlugins,
  installAgentPlugin,
  installClaudePlugin,
  installCodexPlugin,
  pluginStatus,
  SUPPORTED_PLUGIN_TARGETS,
  uninstallClaudePlugin,
  uninstallCodexPlugin,
} from "../../src/local/plugins.js";

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
    assert.equal(hooks.hooks.PermissionRequest[0].hooks[0].timeout, 86400);
    assert.equal(hooks.hooks.PermissionRequest[0].hooks[0].async, false);

    const status = await pluginStatus({ env });
    assert.equal(status.codex.installed, true);

    await uninstallCodexPlugin({ env });
    const after = JSON.parse(await fs.readFile(result.hooksFile, "utf8"));
    assert.equal(after.hooks.SessionStart, undefined);
  });

  it("installs Codex hooks with a PATH-independent default command", async () => {
    const home = await tempDir("runlight-codex-home-");
    const env = { ...process.env, CODEX_HOME: home };

    const result = await installCodexPlugin({ env });
    const hooks = JSON.parse(await fs.readFile(result.hooksFile, "utf8"));
    const command = hooks.hooks.SessionStart[0].hooks[0].command;

    assert.match(command, /node'?/);
    assert.match(command, /bin\/runlight\.js'?\s+hook\s+codex/);
    assert.equal(command.includes("runlight hook codex"), false);
    assert.equal(result.command, command);
    assert.equal(result.hooksFeature.enabled, true);

    const codexConfig = await fs.readFile(path.join(home, "config.toml"), "utf8");
    assert.match(codexConfig, /\[features]\nhooks = true/);

    const status = await pluginStatus({ env });
    assert.equal(status.codex.installed, true);
  });

  it("enables Codex hooks in existing config.toml content", () => {
    assert.equal(
      enableCodexHooksFeatureToml('model = "gpt-5.5"\n\n[features]\nhooks = false\n\n[projects."/tmp"]\ntrust_level = "trusted"\n'),
      'model = "gpt-5.5"\n\n[features]\nhooks = true\n\n[projects."/tmp"]\ntrust_level = "trusted"\n',
    );
    assert.equal(
      enableCodexHooksFeatureToml('model = "gpt-5.5"\n'),
      'model = "gpt-5.5"\n\n[features]\nhooks = true\n',
    );
  });

  it("installs Claude hooks with a blocking approval hook", async () => {
    const dir = await tempDir("runlight-claude-home-");
    const settingsFile = path.join(dir, "settings.json");
    const env = { ...process.env, CLAUDE_SETTINGS_FILE: settingsFile };

    const result = await installClaudePlugin({ env, command: "runlight hook claude" });
    const settings = JSON.parse(await fs.readFile(result.settingsFile, "utf8"));

    assert.equal(settings.hooks.SessionStart[0].hooks[0].command, "runlight hook claude");
    assert.equal(settings.hooks.SessionStart[0].hooks[0].async, false);
    assert.equal(settings.hooks.PermissionRequest[0].hooks[0].command, "runlight hook claude");
    assert.equal(settings.hooks.PermissionRequest[0].hooks[0].timeout, 86400);
    assert.equal(settings.hooks.PermissionRequest[0].hooks[0].async, false);

    const status = await pluginStatus({ env });
    assert.equal(status.claude.installed, true);

    await uninstallClaudePlugin({ env });
    const after = JSON.parse(await fs.readFile(result.settingsFile, "utf8"));
    assert.equal(after.hooks.SessionStart, undefined);
  });

  it("exposes installers for the built-in multi-agent hook targets", async () => {
    assert.ok(SUPPORTED_PLUGIN_TARGETS.includes("gemini"));
    assert.ok(SUPPORTED_PLUGIN_TARGETS.includes("cursor"));
    assert.ok(SUPPORTED_PLUGIN_TARGETS.includes("qwen"));
    assert.ok(SUPPORTED_PLUGIN_TARGETS.includes("cline"));
  });

  it("installs a non-Claude agent hook through the shared agent installer", async () => {
    const home = await tempDir("runlight-multi-agent-home-");
    const env = { ...process.env, HOME: home };

    const result = await installAgentPlugin("qwen", { env, command: "runlight hook qwen" });
    const settings = JSON.parse(await fs.readFile(result.configFile, "utf8"));

    assert.equal(settings.hooks.SessionStart[0].hooks[0].command, "runlight hook qwen");
    assert.equal(settings.hooks.PermissionRequest[0].hooks[0].timeout, 86400);
    assert.equal(settings.hooks.PermissionRequest[0].hooks[0].async, false);
  });

  it("keeps installing all hooks when one agent config path fails", async () => {
    const home = await tempDir("runlight-plugin-all-home-");
    const codexHome = path.join(home, "codex-home");
    await fs.writeFile(path.join(home, ".claude"), "not a directory\n");
    const env = { ...process.env, HOME: home, CODEX_HOME: codexHome };

    const result = await installAllAgentPlugins({ env, command: "runlight hook codex" });

    assert.equal(result.codex.hooksFile, path.join(codexHome, "hooks.json"));
    assert.equal(result.gemini.installed, true);
    assert.equal(result.claude.installed, false);
    assert.ok(result.claude.error.message);
    assert.match(result.claude.error.path, /\.claude/);

    const codexHooks = JSON.parse(await fs.readFile(path.join(codexHome, "hooks.json"), "utf8"));
    assert.equal(codexHooks.hooks.SessionStart[0].hooks[0].command, "runlight hook codex");

    const geminiSettings = JSON.parse(await fs.readFile(path.join(home, ".gemini", "settings.json"), "utf8"));
    assert.equal(geminiSettings.hooks.SessionStart[0].hooks[0].command, "runlight hook gemini");
  });
});
