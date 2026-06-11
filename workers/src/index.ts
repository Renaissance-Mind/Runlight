import { Hono } from "hono";
import { cors } from "hono/cors";
import { health } from "./routes/health";
import { users } from "./routes/users";
import { sessions } from "./routes/sessions";
import { ingest } from "./routes/ingest";
import { authApi, authRoutes } from "./routes/auth";
import { tokens } from "./routes/tokens";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

function mount(base: "" | "/server") {
  const apiBase = `${base}/api`;
  app.use(`${apiBase}/*`, async (c, next) => {
  const origins = (c.env.CORS_ORIGINS || "*").split(",").map((s) => s.trim());
  return cors({ origin: origins, allowMethods: ["GET", "POST", "DELETE", "OPTIONS"], allowHeaders: ["Content-Type", "Authorization"] })(c, next);
  });

  app.route(apiBase, health);
  app.route(apiBase, users);
  app.route(apiBase, sessions);
  app.route(apiBase, ingest);
  app.route(apiBase, authApi);
  app.route(apiBase, tokens);
  app.route(base || "/", authRoutes);
}

mount("");
mount("/server");

app.get("*", (c) => {
  if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
  return c.json({ detail: "Not found" }, 404);
});

export default app;
