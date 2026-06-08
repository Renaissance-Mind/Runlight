import { Hono } from "hono";
import { cors } from "hono/cors";
import { health } from "./routes/health";
import { users } from "./routes/users";
import { sessions } from "./routes/sessions";
import { ingest } from "./routes/ingest";
import type { Env } from "./types";

const api = new Hono<{ Bindings: Env }>();

api.use("*", async (c, next) => {
  const origins = (c.env.CORS_ORIGINS || "*").split(",").map((s) => s.trim());
  return cors({ origin: origins, allowMethods: ["GET", "POST", "DELETE", "OPTIONS"], allowHeaders: ["Content-Type", "Authorization"] })(c, next);
});

api.route("/api", health);
api.route("/api", users);
api.route("/api", sessions);
api.route("/api", ingest);

// Support both root deployment and /server prefix deployment.
// - Workers.dev:  https://agent-monitor.xxx.workers.dev/api/health
// - Custom domain: https://agentmonitor.xxx.com/server/api/health
const app = new Hono<{ Bindings: Env }>();
app.route("/", api);
app.route("/server", api);

export default app;
