import { Hono } from "hono";
import type { Env } from "../types";
import { resolveRequestUser } from "../auth";

export const users = new Hono<{ Bindings: Env }>();

users.get("/users/current", async (c) => {
  try {
    const userId = await resolveRequestUser(c.env, c.req.raw);
    return c.json({ user_id: userId });
  } catch {
    return c.json({ detail: "Authentication required" }, 401);
  }
});
