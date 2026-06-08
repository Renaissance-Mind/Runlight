import { Hono } from "hono";
import type { Env } from "../types";

export const health = new Hono<{ Bindings: Env }>();

health.get("/health", (c) => {
  return c.json({ status: "ok", service: "agent-monitor" });
});
