export interface DashboardConnectionConfig {
  serverUrl: string;
  token: string;
}

export interface DashboardConfigEnv {
  VITE_AGENT_MONITOR_SERVER_URL?: string;
  VITE_AGENT_MONITOR_TOKEN?: string;
}

export const DASHBOARD_CONFIG_STORAGE_KEY = "agent-monitor.dashboard.connection";

function normalizeServerUrl(serverUrl: string): string {
  const trimmed = serverUrl.trim();
  if (!trimmed) return "http://127.0.0.1:8766";
  return trimmed.replace(/\/+$/, "");
}

function importMetaEnv(): DashboardConfigEnv {
  return (import.meta as ImportMeta & { env?: DashboardConfigEnv }).env ?? {};
}

export function parseStoredDashboardConfig(
  raw: string | null,
): DashboardConnectionConfig | null {
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<DashboardConnectionConfig>;
    if (typeof value.serverUrl !== "string") return null;
    if (value.token !== undefined && typeof value.token !== "string") return null;

    return {
      serverUrl: normalizeServerUrl(value.serverUrl),
      token: value.token ?? "",
    };
  } catch {
    return null;
  }
}

export function resolveDashboardConfig(
  env: DashboardConfigEnv = importMetaEnv(),
  stored?: DashboardConnectionConfig | null,
): DashboardConnectionConfig {
  const envConfig = {
    serverUrl: normalizeServerUrl(
      env.VITE_AGENT_MONITOR_SERVER_URL ?? "http://127.0.0.1:8766",
    ),
    token: env.VITE_AGENT_MONITOR_TOKEN ?? "",
  };

  if (!stored) return envConfig;
  return {
    serverUrl: normalizeServerUrl(stored.serverUrl),
    token: stored.token,
  };
}

export function readStoredDashboardConfig(
  storage: Pick<Storage, "getItem"> = window.localStorage,
): DashboardConnectionConfig | null {
  return parseStoredDashboardConfig(storage.getItem(DASHBOARD_CONFIG_STORAGE_KEY));
}

export function writeStoredDashboardConfig(
  config: DashboardConnectionConfig,
  storage: Pick<Storage, "setItem"> = window.localStorage,
): void {
  storage.setItem(
    DASHBOARD_CONFIG_STORAGE_KEY,
    JSON.stringify({
      serverUrl: normalizeServerUrl(config.serverUrl),
      token: config.token,
    }),
  );
}

export function buildApiUrl(serverUrl: string, path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeServerUrl(serverUrl)}/api${cleanPath}`;
}

export function buildRequestHeaders(token: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const trimmed = token.trim();
  if (trimmed) {
    headers.Authorization = `Bearer ${trimmed}`;
  }
  return headers;
}
