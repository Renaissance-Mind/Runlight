import {
  buildApiUrl,
  buildRequestHeaders,
  type DashboardConnectionConfig,
  resolveDashboardConfig,
} from "./config";

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

import type { Session, SessionEvent } from "../types/session";

const defaultConfig = resolveDashboardConfig();

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

export async function fetchHealth(
  config: DashboardConnectionConfig = defaultConfig,
): Promise<{ status: string }> {
  return fetchJSON<{ status: string }>(config, "/health");
}
