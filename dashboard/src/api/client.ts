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
  const url = buildApiUrl(config.serverUrl, path);
  const hasToken = config.token.trim().length > 0;
  const resp = await fetch(url, {
    ...init,
    credentials: hasToken ? "omit" : "include",
    headers: {
      ...buildRequestHeaders(config.token),
      ...init?.headers,
    },
  });

  const text = await resp.text();
  let data: unknown = null;
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      const preview = text.trim().slice(0, 80).replace(/\s+/g, " ");
      const looksLikeHtml = /^<!doctype html/i.test(preview) || /^<html/i.test(preview);
      if (looksLikeHtml) {
        throw new Error(
          `API returned HTML instead of JSON at ${url}. Check Server URL; use the Runlight server origin, not a dashboard route or /api endpoint.`,
        );
      }
      throw new Error(`API returned non-JSON response at ${url}: ${preview}`);
    }
  }

  if (!resp.ok) {
    const detail = typeof data === "object" && data && "detail" in data
      ? String((data as { detail: unknown }).detail)
      : resp.statusText;
    throw new Error(`API ${resp.status}: ${detail}`);
  }
  return data as T;
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

export interface UploadTokenRecord {
  id: number;
  token_preview: string;
  created_at: string;
}

export interface CreatedUploadToken extends UploadTokenRecord {
  user_id: string;
  token: string;
}

export type UserTheme = "dark" | "light" | "system";
export type UserLanguage = "system" | "en" | "zh-CN";

export interface UserSettings {
  theme: UserTheme;
  language: UserLanguage;
  updated_at: string | null;
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

export async function fetchRecentEvents(
  config: DashboardConnectionConfig = defaultConfig,
  limit = 100,
): Promise<SessionEvent[]> {
  const data = await fetchJSON<{ events: SessionEvent[] }>(
    config,
    `/events/recent?limit=${limit}`,
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

export async function logout(config: DashboardConnectionConfig = defaultConfig): Promise<void> {
  await fetchJSON<{ ok: true }>(config, "/auth/logout", { method: "POST" });
}

export async function fetchUploadTokens(
  config: DashboardConnectionConfig = defaultConfig,
): Promise<UploadTokenRecord[]> {
  const data = await fetchJSON<{ tokens: UploadTokenRecord[] }>(config, "/tokens");
  return data.tokens;
}

export async function createUploadToken(
  config: DashboardConnectionConfig = defaultConfig,
): Promise<CreatedUploadToken> {
  const data = await fetchJSON<{ token: CreatedUploadToken }>(config, "/tokens", {
    method: "POST",
  });
  return data.token;
}

export async function deleteUploadToken(
  tokenId: number,
  config: DashboardConnectionConfig = defaultConfig,
): Promise<void> {
  await fetchJSON<{ deleted: number }>(config, `/tokens/${tokenId}`, { method: "DELETE" });
}

export async function fetchUserSettings(
  config: DashboardConnectionConfig = defaultConfig,
): Promise<UserSettings> {
  const data = await fetchJSON<{ settings: UserSettings }>(config, "/user-settings");
  return data.settings;
}

export async function saveUserSettings(
  settings: Pick<UserSettings, "theme" | "language">,
  config: DashboardConnectionConfig = defaultConfig,
): Promise<UserSettings> {
  const data = await fetchJSON<{ settings: UserSettings }>(config, "/user-settings", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
  return data.settings;
}

export async function completeCliConnect(
  code: string,
  config: DashboardConnectionConfig = defaultConfig,
): Promise<void> {
  await fetchJSON<{ ok: true }>(config, "/connect/cli", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
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
