import { Hono } from "hono";
import { resolveRequestUser } from "../auth.ts";
import { generateToken } from "../security.ts";
import type { Env } from "../types.ts";

export interface UploadTokenRecord {
  id: number;
  token_preview: string;
  created_at: string;
}

export interface CreatedUploadToken extends UploadTokenRecord {
  user_id: string;
  token: string;
}

interface TokenRow {
  id: number;
  token_value: string;
  created_at: string;
}

export const tokens = new Hono<{ Bindings: Env }>();

export function previewToken(token: string): string {
  if (token.length <= 16) return token;
  return `${token.slice(0, 11)}...${token.slice(-4)}`;
}

export async function createUploadToken(
  env: Env,
  userId: string,
  createdAt = new Date().toISOString(),
): Promise<CreatedUploadToken> {
  const token = generateToken("rl_tok");
  const result = await env.DB.prepare(
    "INSERT INTO tokens (token_value, user_id, created_at) VALUES (?1, ?2, ?3)",
  )
    .bind(token, userId, createdAt)
    .run();

  return {
    id: Number(result.meta?.last_row_id ?? 0),
    user_id: userId,
    token,
    token_preview: previewToken(token),
    created_at: createdAt,
  };
}

tokens.get("/tokens", async (c) => {
  let userId: string;
  try {
    userId = await resolveRequestUser(c.env, c.req.raw);
  } catch {
    return c.json({ detail: "Authentication required" }, 401);
  }

  const result = await c.env.DB.prepare(
    "SELECT id, token_value, created_at FROM tokens WHERE user_id = ?1 ORDER BY created_at DESC",
  )
    .bind(userId)
    .all<TokenRow>();

  return c.json({
    tokens: (result.results || []).map((row) => ({
      id: row.id,
      token_preview: previewToken(row.token_value),
      created_at: row.created_at,
    })),
  });
});

tokens.post("/tokens", async (c) => {
  let userId: string;
  try {
    userId = await resolveRequestUser(c.env, c.req.raw);
  } catch {
    return c.json({ detail: "Authentication required" }, 401);
  }

  const token = await createUploadToken(c.env, userId);
  return c.json({ token }, 201);
});

tokens.delete("/tokens/:tokenId", async (c) => {
  let userId: string;
  try {
    userId = await resolveRequestUser(c.env, c.req.raw);
  } catch {
    return c.json({ detail: "Authentication required" }, 401);
  }

  const tokenId = Number(c.req.param("tokenId"));
  if (!Number.isInteger(tokenId) || tokenId <= 0) {
    return c.json({ detail: "Invalid token id" }, 400);
  }

  await c.env.DB.prepare("DELETE FROM tokens WHERE id = ?1 AND user_id = ?2")
    .bind(tokenId, userId)
    .run();

  return c.json({ deleted: tokenId });
});
