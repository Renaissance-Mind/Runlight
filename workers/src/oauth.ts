import { createSession, nowIso, upsertOAuthUser } from "./auth.ts";
import { absoluteBaseUrl, assertString, html, redirect, sessionCookie } from "./http.ts";
import { selectGithubVerifiedEmail, selectGoogleVerifiedEmail } from "./identity.ts";
import { makeId } from "./security.ts";
import type { Env } from "./types.ts";

type Provider = "github" | "google";

export async function startOAuth(request: Request, env: Env, provider: Provider): Promise<Response> {
  const url = new URL(request.url);
  const baseUrl = absoluteBaseUrl(request, env);
  const returnTo = safeReturnTo(url.searchParams.get("return_to"));
  const state = makeId("oauth");

  await env.DB.prepare(
    "INSERT INTO oauth_states (state, provider, return_to, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)",
  )
    .bind(state, provider, returnTo, nowIso(), new Date(Date.now() + 10 * 60 * 1000).toISOString())
    .run();

  if (provider === "github") {
    if (!env.GITHUB_CLIENT_ID) return missingProvider("GitHub");
    const target = new URL("https://github.com/login/oauth/authorize");
    target.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
    target.searchParams.set("redirect_uri", `${baseUrl}/auth/callback/github`);
    target.searchParams.set("scope", "user:email");
    target.searchParams.set("state", state);
    return redirect(target.toString());
  }

  if (!env.GOOGLE_CLIENT_ID) return missingProvider("Google");
  const target = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  target.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  target.searchParams.set("redirect_uri", `${baseUrl}/auth/callback/google`);
  target.searchParams.set("response_type", "code");
  target.searchParams.set("scope", "openid email profile");
  target.searchParams.set("state", state);
  return redirect(target.toString());
}

export async function finishOAuth(request: Request, env: Env, provider: Provider): Promise<Response> {
  const url = new URL(request.url);
  const code = assertString(url.searchParams.get("code"), "code");
  const state = assertString(url.searchParams.get("state"), "state");
  const stateRow = await env.DB.prepare(
    "SELECT state, provider, return_to FROM oauth_states WHERE state = ?1 AND provider = ?2 AND expires_at > ?3",
  )
    .bind(state, provider, nowIso())
    .first<{ state: string; provider: string; return_to: string | null }>();
  if (!stateRow) return html("OAuth state expired or invalid.", { status: 400 });

  await env.DB.prepare("DELETE FROM oauth_states WHERE state = ?1").bind(state).run();

  const baseUrl = absoluteBaseUrl(request, env);
  const profile = provider === "github"
    ? await githubProfile(env, code, baseUrl)
    : await googleProfile(env, code, baseUrl);
  const userId = await upsertOAuthUser(env, provider, profile.providerUserId, profile);
  const sessionToken = await createSession(env, userId);

  return redirect(stateRow.return_to || "/", {
    headers: {
      "Set-Cookie": sessionCookie(sessionToken, request),
    },
  });
}

export function safeReturnTo(value: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed || !trimmed.startsWith("/") || trimmed.startsWith("//")) return "/";
  return trimmed;
}

function missingProvider(name: string): Response {
  return html(`${name} OAuth is not configured.`, { status: 500 });
}

async function githubProfile(env: Env, code: string, baseUrl: string) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) throw new Error("GitHub OAuth is not configured");
  const token = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${baseUrl}/auth/callback/github`,
    }),
  }).then((response) => response.json<Record<string, unknown>>());
  const accessToken = assertString(token.access_token, "access_token");
  const user = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "Runlight" },
  }).then((response) => response.json<Record<string, unknown>>());
  const emails = await fetch("https://api.github.com/user/emails", {
    headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "Runlight" },
  }).then((response) => response.json<Array<Record<string, unknown>>>());
  const providerUserId = String(user.id || "");
  return {
    providerUserId: assertString(providerUserId, "github_user_id"),
    email: selectGithubVerifiedEmail(emails),
    name: typeof user.name === "string" ? user.name : typeof user.login === "string" ? user.login : null,
  };
}

async function googleProfile(env: Env, code: string, baseUrl: string) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error("Google OAuth is not configured");
  const form = new URLSearchParams();
  form.set("client_id", env.GOOGLE_CLIENT_ID);
  form.set("client_secret", env.GOOGLE_CLIENT_SECRET);
  form.set("code", code);
  form.set("grant_type", "authorization_code");
  form.set("redirect_uri", `${baseUrl}/auth/callback/google`);
  const token = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  }).then((response) => response.json<Record<string, unknown>>());
  const accessToken = assertString(token.access_token, "access_token");
  const user = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).then((response) => response.json<Record<string, unknown>>());
  return {
    providerUserId: assertString(user.sub, "sub"),
    email: selectGoogleVerifiedEmail(user),
    name: typeof user.name === "string" ? user.name : null,
  };
}

