import { Hono } from "hono";
import { resolveRequestUser } from "../auth.ts";
import { createUploadToken } from "./tokens.ts";
import type { Env } from "../types.ts";

export const connect = new Hono<{ Bindings: Env }>();

function isValidCode(value: string): boolean {
  return /^rl_cli_[A-Za-z0-9_-]{32,}$/.test(value);
}

connect.post("/connect/cli", async (c) => {
  let userId: string;
  try {
    userId = await resolveRequestUser(c.env, c.req.raw);
  } catch {
    return c.json({ detail: "Authentication required" }, 401);
  }

  const body = await c.req.json<{ code?: string }>();
  const code = String(body.code || "").trim();
  if (!isValidCode(code)) return c.json({ detail: "Invalid connect code" }, 400);

  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const token = await createUploadToken(c.env, userId, createdAt);

  await c.env.DB.prepare(
    `INSERT INTO cli_connect_tokens (code, token_value, user_id, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(code) DO UPDATE SET
       token_value = excluded.token_value,
       user_id = excluded.user_id,
       created_at = excluded.created_at,
       expires_at = excluded.expires_at`,
  )
    .bind(code, token.token, userId, createdAt, expiresAt)
    .run();

  return c.json({ ok: true, expires_at: expiresAt });
});

connect.get("/connect/cli/:code", async (c) => {
  const code = String(c.req.param("code") || "").trim();
  if (!isValidCode(code)) return c.json({ detail: "Invalid connect code" }, 400);

  await c.env.DB.prepare("DELETE FROM cli_connect_tokens WHERE expires_at <= ?1")
    .bind(new Date().toISOString())
    .run();

  const row = await c.env.DB.prepare(
    "SELECT token_value FROM cli_connect_tokens WHERE code = ?1 AND expires_at > ?2",
  )
    .bind(code, new Date().toISOString())
    .first<{ token_value: string }>();

  if (!row?.token_value) return c.json({ status: "pending" }, 202);

  await c.env.DB.prepare("DELETE FROM cli_connect_tokens WHERE code = ?1")
    .bind(code)
    .run();

  return c.json({ status: "complete", token: row.token_value });
});
