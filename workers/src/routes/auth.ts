import { Hono } from "hono";
import { clearSessionCookie } from "../http.ts";
import { resolveRequestUser } from "../auth.ts";
import { finishOAuth, startOAuth } from "../oauth.ts";
import type { Env } from "../types.ts";

export const authRoutes = new Hono<{ Bindings: Env }>();
export const authApi = new Hono<{ Bindings: Env }>();

authRoutes.get("/auth/login/:provider", async (c) => {
  const provider = c.req.param("provider");
  if (provider !== "github" && provider !== "google") return c.text("Unsupported provider", 404);
  return startOAuth(c.req.raw, c.env, provider);
});

authRoutes.get("/auth/callback/:provider", async (c) => {
  const provider = c.req.param("provider");
  if (provider !== "github" && provider !== "google") return c.text("Unsupported provider", 404);
  return finishOAuth(c.req.raw, c.env, provider);
});

authApi.get("/auth/me", async (c) => {
  try {
    const userId = await resolveRequestUser(c.env, c.req.raw);
    return c.json({ user_id: userId });
  } catch {
    return c.json({ detail: "Authentication required" }, 401);
  }
});

authApi.post("/auth/logout", (c) =>
  c.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": clearSessionCookie(),
      },
    },
  ),
);

