import type { Env } from "./types";

const DEFAULT_USER = "default";

export function resolveUser(env: Env, authorization: string | null): string {
  if (!authorization) return DEFAULT_USER;

  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!token) return DEFAULT_USER;

  const tokenMap = parseTokenMap(env.TOKEN_MAP);
  if (Object.keys(tokenMap).length === 0) return DEFAULT_USER;

  const userId = tokenMap[token];
  if (!userId) throw new Error("Unknown token");

  return userId;
}

function parseTokenMap(raw?: string): Record<string, string> {
  if (!raw) return {};
  const map: Record<string, string> = {};
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx < 0) continue;
    const token = trimmed.slice(0, colonIdx).trim();
    const userId = trimmed.slice(colonIdx + 1).trim();
    if (token && userId) map[token] = userId;
  }
  return map;
}
