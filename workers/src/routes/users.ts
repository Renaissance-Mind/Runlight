import { Hono } from "hono";
import type { Env } from "../types";
import { resolveUser } from "../auth";

export const users = new Hono<{ Bindings: Env }>();

users.get("/users/current", (c) => {
  try {
    const userId = resolveUser(c.env, c.req.header("Authorization") ?? null);
    return c.json({ user_id: userId });
  } catch {
    return c.json({ detail: "Unknown token" }, 401);
  }
});
