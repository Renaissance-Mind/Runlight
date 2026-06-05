const BASE_URL = "/api";

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!resp.ok) {
    throw new Error(`API ${resp.status}: ${resp.statusText}`);
  }
  return resp.json() as Promise<T>;
}

import type { Session, SessionEvent } from "../types/session";

export async function fetchLiveSessions(): Promise<Session[]> {
  const data = await fetchJSON<{ sessions: Session[] }>("/sessions/live");
  return data.sessions;
}

export async function fetchAllSessions(params?: {
  agent_type?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<Session[]> {
  const query = new URLSearchParams();
  if (params?.agent_type) query.set("agent_type", params.agent_type);
  if (params?.status) query.set("status", params.status);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  const qs = query.toString();
  const data = await fetchJSON<{ sessions: Session[] }>(
    `/sessions${qs ? `?${qs}` : ""}`,
  );
  return data.sessions;
}

export async function fetchSession(sessionId: string): Promise<Session> {
  return fetchJSON<Session>(`/sessions/${sessionId}`);
}

export async function fetchSessionEvents(
  sessionId: string,
): Promise<SessionEvent[]> {
  const data = await fetchJSON<{ events: SessionEvent[] }>(
    `/sessions/${sessionId}/events`,
  );
  return data.events;
}

export async function fetchHealth(): Promise<{ status: string }> {
  return fetchJSON<{ status: string }>("/health");
}
