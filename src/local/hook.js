import { loadConfig } from "./config.js";
import { localDaemonUrl } from "./paths.js";
import { isSupportedAgentSource, normalizeAgentSource } from "./agent-registry.js";

export function buildRawHookEnvelope(agent, input) {
  const normalizedAgent = normalizeAgentSource(agent);
  if (!isSupportedAgentSource(normalizedAgent)) {
    throw new Error(`Unsupported hook agent: ${agent}`);
  }
  return {
    agent: normalizedAgent,
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
  const daemon = await response.json();
  return { sent: true, daemon, hookResponse: daemon.hook_response || "" };
}

export async function readStdin(stdin = process.stdin) {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
