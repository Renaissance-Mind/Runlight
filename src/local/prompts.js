import readline from "node:readline";
import { createInterface } from "node:readline/promises";
import { spawnSync } from "node:child_process";

export function intro(title) {
  process.stdout.write(`\n${title}\n${"=".repeat(title.length)}\n`);
}

export function outro(message) {
  process.stdout.write(`\n${message}\n`);
}

export function note(title, lines) {
  process.stdout.write(`\n${title}\n`);
  for (const line of Array.isArray(lines) ? lines : [lines]) {
    process.stdout.write(`  ${line}\n`);
  }
}

export async function promptText(message, { defaultValue = "" } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  const value = await rl.question(`${message}${suffix}: `);
  rl.close();
  return value.trim() || defaultValue;
}

export async function promptSecret(message, { stdin = process.stdin, stdout = process.stdout } = {}) {
  if (!stdin.isTTY) return promptText(message);
  return new Promise((resolve, reject) => {
    let value = "";
    const wasRaw = stdin.isRaw;
    const wasPaused = typeof stdin.isPaused === "function" ? stdin.isPaused() : false;
    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    stdout.write(`${message}: `);

    function restoreInput() {
      stdin.off("keypress", onKeypress);
      stdin.setRawMode(Boolean(wasRaw));
      if (wasPaused && typeof stdin.pause === "function") stdin.pause();
      stdout.write("\n");
    }

    function done(result) {
      restoreInput();
      resolve(result);
    }

    function onKeypress(str, key) {
      if (key?.ctrl && key.name === "c") {
        restoreInput();
        reject(new Error("Cancelled"));
        return;
      }
      if (key?.name === "return") {
        done(value.trim());
        return;
      }
      if (key?.name === "backspace" || key?.name === "delete") {
        if (value.length > 0) {
          value = value.slice(0, -1);
          stdout.write("\b \b");
        }
        return;
      }
      if (str && !key?.meta && !key?.ctrl) {
        value += str;
        stdout.write("*");
      }
    }

    stdin.on("keypress", onKeypress);
  });
}

export async function confirm(message, { defaultValue = true } = {}) {
  const hint = defaultValue ? "Y/n" : "y/N";
  const answer = (await promptText(`${message} [${hint}]`)).toLowerCase();
  if (!answer) return defaultValue;
  return ["y", "yes"].includes(answer);
}

export async function select(message, options, { defaultIndex = 0 } = {}) {
  process.stdout.write(`\n${message}\n`);
  options.forEach((option, index) => {
    const hint = option.hint ? ` - ${option.hint}` : "";
    process.stdout.write(`  ${index + 1}. ${option.label}${hint}\n`);
  });
  const answer = await promptText("Select", { defaultValue: String(defaultIndex + 1) });
  const idx = Number(answer) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) {
    throw new Error(`Invalid selection: ${answer}`);
  }
  return options[idx].value;
}

export function openUrl(url) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  spawnSync(command, args, { stdio: "ignore" });
}
