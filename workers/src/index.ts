import { Hono } from "hono";
import { cors } from "hono/cors";
import { health } from "./routes/health";
import { users } from "./routes/users";
import { sessions } from "./routes/sessions";
import { ingest } from "./routes/ingest";
import { authApi, authRoutes } from "./routes/auth";
import { tokens } from "./routes/tokens";
import { userSettings } from "./routes/userSettings";
import { connect } from "./routes/connect";
import type { Env } from "./types";
import { parseCorsOrigins } from "./cors";

const app = new Hono<{ Bindings: Env }>();

function mount(base: "" | "/server") {
  const apiBase = `${base}/api`;
  app.use(`${apiBase}/*`, async (c, next) => {
    return cors({
      origin: parseCorsOrigins(c.env.CORS_ORIGINS),
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    })(c, next);
  });

  app.route(apiBase, health);
  app.route(apiBase, users);
  app.route(apiBase, sessions);
  app.route(apiBase, ingest);
  app.route(apiBase, authApi);
  app.route(apiBase, tokens);
  app.route(apiBase, userSettings);
  app.route(apiBase, connect);
  app.route(base || "/", authRoutes);
}

mount("");
mount("/server");

app.get("*", (c) => {
  const pathname = new URL(c.req.url).pathname;
  if (pathname.startsWith("/api/") || pathname.startsWith("/server/api/")) {
    return c.json({ detail: "API route not found" }, 404);
  }
  if (c.env.ASSETS) return c.env.ASSETS.fetch(c.req.raw);
  return c.json({ detail: "Not found" }, 404);
});

export default app;
