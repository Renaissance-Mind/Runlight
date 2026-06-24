import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildUpgradePlan,
  npmGlobalInstallCommand,
  packageSpecFromOptions,
  runUpgradePlan,
} from "../../src/local/upgrade.js";

describe("local CLI upgrade", () => {
  it("installs the latest Runlight package globally by default", () => {
    assert.equal(packageSpecFromOptions({}), "runlight@latest");
    assert.deepEqual(npmGlobalInstallCommand("runlight@latest", {}), {
      command: "npm",
      args: ["install", "-g", "runlight@latest"],
    });
  });

  it("accepts explicit versions and package specs", () => {
    assert.equal(packageSpecFromOptions({ version: "0.1.18" }), "runlight@0.1.18");
    assert.equal(packageSpecFromOptions({ version: "latest" }), "runlight@latest");
    assert.equal(packageSpecFromOptions({ package: "runlight@next" }), "runlight@next");
  });

  it("uses npm_execpath through node when npm exposes a JavaScript entrypoint", () => {
    const command = npmGlobalInstallCommand("runlight@latest", {
      npm_execpath: "/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js",
    });

    assert.equal(command.command, process.execPath);
    assert.deepEqual(command.args, [
      "/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js",
      "install",
      "-g",
      "runlight@latest",
    ]);
  });

  it("plans hook refreshes and daemon restarts unless disabled", () => {
    assert.deepEqual(buildUpgradePlan({}, {}), {
      packageSpec: "runlight@latest",
      install: { command: "npm", args: ["install", "-g", "runlight@latest"] },
      plugins: "all",
      restartDaemon: true,
      dryRun: false,
    });

    assert.deepEqual(buildUpgradePlan({ noPlugins: true, noDaemonRestart: true }, {}), {
      packageSpec: "runlight@latest",
      install: { command: "npm", args: ["install", "-g", "runlight@latest"] },
      plugins: "skip",
      restartDaemon: false,
      dryRun: false,
    });
  });

  it("executes package install before refreshing hooks and restarting the daemon", async () => {
    const calls = [];
    const result = await runUpgradePlan(
      { version: "0.1.18", plugins: "codex" },
      {
        env: {},
        runInstall: async (command, args) => {
          calls.push(["install", command, ...args]);
          return { command, args, code: 0 };
        },
        installHooks: async (target) => {
          calls.push(["hooks", target]);
          return { target, installed: true };
        },
        restartDaemon: async () => {
          calls.push(["daemon"]);
          return { restarted: true };
        },
      },
    );

    assert.deepEqual(calls, [
      ["install", "npm", "install", "-g", "runlight@0.1.18"],
      ["hooks", "codex"],
      ["daemon"],
    ]);
    assert.equal(result.package, "runlight@0.1.18");
    assert.equal(result.hooks.installed, true);
    assert.equal(result.daemon.restarted, true);
  });

  it("dry-runs without calling install, hooks, or daemon callbacks", async () => {
    const result = await runUpgradePlan(
      { dryRun: true, plugins: "all" },
      {
        env: {},
        runInstall: async () => {
          throw new Error("install should not run");
        },
        installHooks: async () => {
          throw new Error("hooks should not run");
        },
        restartDaemon: async () => {
          throw new Error("daemon should not run");
        },
      },
    );

    assert.equal(result.install.skipped, true);
    assert.equal(result.hooks.target, "all");
    assert.equal(result.daemon.restart, true);
  });
});
