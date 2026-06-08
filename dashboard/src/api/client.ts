import {
  buildApiUrl,
  buildRequestHeaders,
  type DashboardConnectionConfig,
  resolveDashboardConfig,
} from "./config.ts";
import type { Session, SessionEvent } from "../types/session.ts";

async function fetchJSON<T>(
  config: DashboardConnectionConfig,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const resp = await fetch(buildApiUrl(config.serverUrl, path), {
    ...init,
    headers: {
      ...buildRequestHeaders(config.token),
      ...init?.headers,
    },
  });
  if (!resp.ok) {
    throw new Error(`API ${resp.status}: ${resp.statusText}`);
  }
  return resp.json() as Promise<T>;
}

const defaultConfig = resolveDashboardConfig();

export interface CurrentUser {
  user_id: string;
}

export interface ServerConnectionProbe {
  ok: boolean;
  serverUrl: string;
  userId: string | null;
  tokenConfigured: boolean;
  checkedAt: string;
  error: string | null;
}

export async function fetchLiveSessions(
  config: DashboardConnectionConfig = defaultConfig,
): Promise<Session[]> {
  const data = await fetchJSON<{ sessions: Session[] }>(config, "/sessions/live");
  return data.sessions;
}

export async function fetchAllSessions(params?: {
  agent_type?: string;
  status?: string;
  limit?: number;
  offset?: number;
  config?: DashboardConnectionConfig;
}): Promise<Session[]> {
  const query = new URLSearchParams();
  if (params?.agent_type) query.set("agent_type", params.agent_type);
  if (params?.status) query.set("status", params.status);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  const qs = query.toString();
  const data = await fetchJSON<{ sessions: Session[] }>(
    params?.config ?? defaultConfig,
    `/sessions${qs ? `?${qs}` : ""}`,
  );
  return data.sessions;
}

export async function fetchSession(
  sessionId: string,
  config: DashboardConnectionConfig = defaultConfig,
): Promise<Session> {
  return fetchJSON<Session>(config, `/sessions/${sessionId}`);
}

export async function fetchSessionEvents(
  sessionId: string,
  config: DashboardConnectionConfig = defaultConfig,
): Promise<SessionEvent[]> {
  const data = await fetchJSON<{ events: SessionEvent[] }>(
    config,
    `/sessions/${sessionId}/events`,
  );
  return data.events;
}

export async function deleteSession(
  sessionId: string,
  config: DashboardConnectionConfig = defaultConfig,
): Promise<void> {
  await fetchJSON<{ deleted: string }>(config, `/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

export async function fetchHealth(
  config: DashboardConnectionConfig = defaultConfig,
): Promise<{ status: string; service?: string }> {
  return fetchJSON<{ status: string; service?: string }>(config, "/health");
}

export async function fetchCurrentUser(
  config: DashboardConnectionConfig = defaultConfig,
): Promise<CurrentUser> {
  return fetchJSON<CurrentUser>(config, "/users/current");
}

export async function probeServerConnection(
  config: DashboardConnectionConfig = defaultConfig,
): Promise<ServerConnectionProbe> {
  const checkedAt = new Date().toISOString();
  const tokenConfigured = config.token.trim().length > 0;

  try {
    await fetchHealth(config);
    const user = await fetchCurrentUser(config);
    return {
      ok: true,
      serverUrl: config.serverUrl,
      userId: user.user_id,
      tokenConfigured,
      checkedAt,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      serverUrl: config.serverUrl,
      userId: null,
      tokenConfigured,
      checkedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
