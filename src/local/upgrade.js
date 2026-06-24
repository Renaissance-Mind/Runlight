import { spawn } from "node:child_process";
import path from "node:path";

export const DEFAULT_UPGRADE_PACKAGE = "runlight@latest";

export function packageSpecFromOptions(opts = {}) {
  const explicitPackage = String(opts.package || opts.packageSpec || "").trim();
  if (explicitPackage) return explicitPackage;

  const version = String(opts.version || "").trim();
  if (version && version !== "true") {
    if (version.startsWith("runlight@")) return version;
    return `runlight@${version}`;
  }

  return DEFAULT_UPGRADE_PACKAGE;
}

export function npmGlobalInstallCommand(packageSpec, env = process.env) {
  const spec = packageSpec || DEFAULT_UPGRADE_PACKAGE;
  const configuredCommand = String(env.RUNLIGHT_NPM_COMMAND || "").trim();
  if (configuredCommand) return { command: configuredCommand, args: ["install", "-g", spec] };

  const npmExecPath = String(env.npm_execpath || "").trim();
  if (!npmExecPath) return { command: "npm", args: ["install", "-g", spec] };

  if (npmExecPath.endsWith(".js") || npmExecPath.split(path.sep).includes("npm-cli.js")) {
    return { command: process.execPath, args: [npmExecPath, "install", "-g", spec] };
  }

  return { command: npmExecPath, args: ["install", "-g", spec] };
}

export function buildUpgradePlan(opts = {}, env = process.env) {
  const packageSpec = packageSpecFromOptions(opts);
  return {
    packageSpec,
    install: npmGlobalInstallCommand(packageSpec, env),
    plugins: opts.noPlugins ? "skip" : String(opts.plugins || "all"),
    restartDaemon: !opts.noDaemonRestart && !opts.noRestart,
    dryRun: Boolean(opts.dryRun),
  };
}

export function runSubprocess(command, args, { env = process.env, stdio = "inherit" } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve({ command, args, code });
        return;
      }
      const suffix = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`${command} ${args.join(" ")} failed with ${suffix}`));
    });
  });
}

export async function runUpgradePlan(opts = {}, {
  env = process.env,
  runInstall = runSubprocess,
  installHooks,
  restartDaemon,
} = {}) {
  const plan = buildUpgradePlan(opts, env);
  if (plan.dryRun) {
    return {
      package: plan.packageSpec,
      install: { skipped: true, command: plan.install.command, args: plan.install.args },
      hooks: { skipped: true, target: plan.plugins },
      daemon: { skipped: true, restart: plan.restartDaemon },
    };
  }

  const install = await runInstall(plan.install.command, plan.install.args, { env, stdio: "inherit" });

  const hooks = plan.plugins === "skip"
    ? { skipped: true }
    : await installHooks(plan.plugins);

  const daemon = plan.restartDaemon
    ? await restartDaemon()
    : { skipped: true };

  return {
    package: plan.packageSpec,
    install,
    hooks,
    daemon,
  };
}
