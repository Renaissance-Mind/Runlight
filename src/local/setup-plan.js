import { normalizeServerUrl } from "./config.js";

export function setupModeFromOptions(opts = {}) {
  if (opts.cloud) return "cloud";
  if (opts.local) return "local";
  if (opts.selfHosted || opts.selfHostedRole || opts.role) return "self-hosted";
  return null;
}

function hasProtocol(value) {
  return /^https?:\/\//i.test(value);
}

export function normalizeSelfHostedServerUrl(value, defaultPort = 18765) {
  const trimmed = String(value || "").trim();
  if (!trimmed) throw new Error("Self-hosted server address is required");
  if (hasProtocol(trimmed)) return normalizeServerUrl(trimmed);

  const bracketedIpv6 = trimmed.startsWith("[") && trimmed.includes("]");
  const hasPort = bracketedIpv6
    ? trimmed.slice(trimmed.indexOf("]") + 1).startsWith(":")
    : trimmed.includes(":");
  return `http://${trimmed}${hasPort ? "" : `:${defaultPort}`}`;
}

export function buildLocalConfigPatch({
  serverHost = "127.0.0.1",
  serverPort = 18765,
  dashboardHost = "127.0.0.1",
  dashboardPort = 18766,
  daemonHost = "127.0.0.1",
  daemonPort = 18767,
} = {}) {
  return {
    server_url: `http://${serverHost}:${serverPort}`,
    upload_token: "",
    daemon: {
      host: daemonHost,
      port: Number(daemonPort),
    },
    managed: {
      server: {
        enabled: true,
        host: serverHost,
        port: Number(serverPort),
      },
      dashboard: {
        enabled: true,
        host: dashboardHost,
        port: Number(dashboardPort),
      },
    },
  };
}

export function buildSelfHostedClientConfigPatch({
  serverUrl,
  token = "",
  daemonHost = "127.0.0.1",
  daemonPort = 18767,
}) {
  return {
    server_url: normalizeServerUrl(serverUrl),
    upload_token: String(token || "").trim(),
    daemon: {
      host: daemonHost,
      port: Number(daemonPort),
    },
    managed: {
      server: { enabled: false },
      dashboard: { enabled: false },
    },
  };
}
