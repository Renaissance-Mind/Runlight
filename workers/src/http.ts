import type { Env } from "./types.ts";

export function redirect(location: string, init: ResponseInit = {}): Response {
  return new Response(null, {
    status: 302,
    ...init,
    headers: {
      Location: location,
      ...init.headers,
    },
  });
}

export function html(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    ...init,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      ...init.headers,
    },
  });
}

export function absoluteBaseUrl(request: Request, env: Env): string {
  return (env.PUBLIC_BASE_URL || new URL(request.url).origin).replace(/\/+$/, "");
}

export function bearerToken(request: Request): string | null {
  const value = request.headers.get("Authorization") || "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function getCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("Cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function sessionCookie(token: string, request: Request): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `rl_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000${secure}`;
}

export function clearSessionCookie(): string {
  return "rl_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0";
}

export function assertString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

