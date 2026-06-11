export interface DashboardConnectionConfig {
  serverUrl: string;
  token: string;
}

export interface DashboardConfigEnv {
  VITE_RUNLIGHT_SERVER_URL?: string;
  VITE_RUNLIGHT_TOKEN?: string;
  VITE_AGENT_MONITOR_SERVER_URL?: string;
  VITE_AGENT_MONITOR_TOKEN?: string;
}

export const DASHBOARD_CONFIG_STORAGE_KEY = "runlight.dashboard.connection";
const LEGACY_DASHBOARD_CONFIG_STORAGE_KEY = "agent-monitor.dashboard.connection";

function normalizeServerUrl(serverUrl: string): string {
  const trimmed = serverUrl.trim();
  if (!trimmed) return "http://127.0.0.1:8766";
  const withoutTrailingSlash = trimmed.replace(/\/+$/, "");

  try {
    const url = new URL(withoutTrailingSlash);
    const segments = url.pathname.split("/").filter(Boolean);
    const apiIndex = segments.indexOf("api");
    if (apiIndex >= 0) {
      url.pathname = `/${segments.slice(0, apiIndex).join("/")}`.replace(/\/+$/, "");
      url.search = "";
      url.hash = "";
      return url.toString().replace(/\/+$/, "");
    }

    if (
      url.pathname === "/settings"
      || url.pathname === "/messages"
      || url.pathname.startsWith("/sessions/")
    ) {
      url.pathname = "";
      url.search = "";
      url.hash = "";
      return url.toString().replace(/\/+$/, "");
    }
  } catch {
    return withoutTrailingSlash;
  }

  return withoutTrailingSlash;
}

function importMetaEnv(): DashboardConfigEnv {
  return (import.meta as ImportMeta & { env?: DashboardConfigEnv }).env ?? {};
}

function defaultServerUrl(): string {
  if (typeof window === "undefined") return "http://127.0.0.1:8766";
  const origin = window.location.origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|$)/.test(origin)) {
    return "http://127.0.0.1:8766";
  }
  return origin;
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
      env.VITE_RUNLIGHT_SERVER_URL
        ?? env.VITE_AGENT_MONITOR_SERVER_URL
        ?? defaultServerUrl(),
    ),
    token: env.VITE_RUNLIGHT_TOKEN ?? env.VITE_AGENT_MONITOR_TOKEN ?? "",
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
  return (
    parseStoredDashboardConfig(storage.getItem(DASHBOARD_CONFIG_STORAGE_KEY))
    ?? parseStoredDashboardConfig(storage.getItem(LEGACY_DASHBOARD_CONFIG_STORAGE_KEY))
  );
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

export function buildAuthLoginUrl(serverUrl: string, provider: "github" | "google", returnTo = "/"): string {
  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  const url = new URL(`${normalizeServerUrl(serverUrl)}/auth/login/${provider}`);
  url.searchParams.set("return_to", safeReturnTo);
  return url.toString();
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
