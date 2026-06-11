import type { Env } from "./types.ts";
import { bearerToken, getCookie } from "./http.ts";
import { generateToken, hashToken } from "./security.ts";
import { normalizeEmail } from "./identity.ts";

const DEFAULT_USER = "default";

export class AuthError extends Error {}

export function resolveUser(env: Env, authorization: string | null): string {
  if (!authorization) return DEFAULT_USER;

  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!token) return DEFAULT_USER;

  const tokenMap = parseTokenMap(env.RUNLIGHT_TOKEN_MAP ?? env.TOKEN_MAP);
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

export async function resolveRequestUser(env: Env, request: Request): Promise<string> {
  const token = bearerToken(request);
  if (token) {
    const row = await env.DB.prepare("SELECT user_id FROM tokens WHERE token_value = ?1")
      .bind(token)
      .first<{ user_id: string }>();
    if (row?.user_id) return row.user_id;

    try {
      return resolveUser(env, `Bearer ${token}`);
    } catch {
      throw new AuthError("Unknown token");
    }
  }

  const sessionToken = getCookie(request, "rl_session");
  if (sessionToken) {
    const tokenHash = await hashToken(sessionToken);
    const row = await env.DB.prepare(
      "SELECT user_id FROM auth_sessions WHERE session_token_hash = ?1 AND expires_at > ?2",
    )
      .bind(tokenHash, nowIso())
      .first<{ user_id: string }>();
    if (row?.user_id) return row.user_id;
  }

  if (requiresAuth(env)) throw new AuthError("Authentication required");
  return DEFAULT_USER;
}

export async function createSession(env: Env, userId: string): Promise<string> {
  const token = generateToken("rl_sess");
  const tokenHash = await hashToken(token);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare(
    "INSERT INTO auth_sessions (session_token_hash, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)",
  )
    .bind(tokenHash, userId, createdAt, expiresAt)
    .run();
  return token;
}

export async function upsertOAuthUser(
  env: Env,
  provider: string,
  providerUserId: string,
  profile: { email: string | null; name: string | null },
): Promise<string> {
  const email = normalizeEmail(profile.email);
  const fallbackUserId = `${provider}:${providerUserId}`;
  const userId = email || fallbackUserId;
  const displayName = profile.name || email || fallbackUserId;
  const now = nowIso();

  const existingIdentity = await env.DB.prepare(
    "SELECT user_id FROM oauth_identities WHERE provider = ?1 AND provider_user_id = ?2",
  )
    .bind(provider, providerUserId)
    .first<{ user_id: string }>();
  const resolvedUserId = existingIdentity?.user_id || userId;

  await env.DB.prepare(
    "INSERT OR IGNORE INTO users (user_id, display_name, created_at) VALUES (?1, ?2, ?3)",
  )
    .bind(resolvedUserId, displayName, now)
    .run();
  await env.DB.prepare("UPDATE users SET display_name = COALESCE(?1, display_name) WHERE user_id = ?2")
    .bind(displayName, resolvedUserId)
    .run();

  await env.DB.prepare(
    `INSERT INTO oauth_identities (provider, provider_user_id, user_id, email, display_name, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT(provider, provider_user_id) DO UPDATE SET
       user_id = excluded.user_id,
       email = excluded.email,
       display_name = excluded.display_name,
       updated_at = excluded.updated_at`,
  )
    .bind(provider, providerUserId, resolvedUserId, email, displayName, now, now)
    .run();

  return resolvedUserId;
}

export function nowIso(): string {
  return new Date().toISOString();
}

function requiresAuth(env: Env): boolean {
  return ["1", "true", "yes"].includes((env.RUNLIGHT_REQUIRE_AUTH || "").trim().toLowerCase());
}
