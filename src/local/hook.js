import { loadConfig } from "./config.js";
import { localDaemonUrl } from "./paths.js";

export function buildRawHookEnvelope(agent, input) {
  if (agent !== "codex" && agent !== "claude") {
    throw new Error(`Unsupported hook agent: ${agent}`);
  }
  return {
    agent,
    input,
    received_at: new Date().toISOString(),
  };
}

export async function postHookInput(agent, rawInput, { env = process.env, fetchImpl = fetch } = {}) {
  const config = await loadConfig(env);
  const text = String(rawInput || "");
  const input = text.trim() ? JSON.parse(text) : {};
  const rawEvent = buildRawHookEnvelope(agent, input);

  const response = await fetchImpl(`${localDaemonUrl(config)}/events/raw`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-runlight-local-secret": config.local_secret,
    },
    body: JSON.stringify(rawEvent),
  });
  if (!response.ok) return { sent: false, reason: `daemon HTTP ${response.status}` };
  return { sent: true, daemon: await response.json() };
}

export async function readStdin(stdin = process.stdin) {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
