import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function dashboardDistDir() {
  return fileURLToPath(new URL("../../dashboard/dist", import.meta.url));
}

function storageBootstrap(serverUrl) {
  const config = JSON.stringify({ serverUrl, token: "" });
  return `<script>localStorage.setItem("runlight.dashboard.connection", ${JSON.stringify(config)});</script>`;
}

async function readIndex(staticDir, serverUrl) {
  try {
    const html = await fs.readFile(path.join(staticDir, "index.html"), "utf8");
    return html.replace("</head>", `${storageBootstrap(serverUrl)}\n  </head>`);
  } catch (error) {
    if (error && error.code !== "ENOENT") throw error;
    return `<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Runlight</title>
    ${storageBootstrap(serverUrl)}
    <style>body{font-family:ui-monospace,Menlo,monospace;background:#08090a;color:#d4d4d8;padding:24px}</style>
  </head>
  <body>
    <h1>Runlight dashboard assets are not built</h1>
    <p>Run <code>cd dashboard && npm run build</code>, then restart <code>runlight dashboard</code>.</p>
  </body>
</html>`;
  }
}

function writeText(res, statusCode, contentType, text) {
  res.writeHead(statusCode, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

async function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  const data = await fs.readFile(filePath);
  res.writeHead(200, {
    "content-type": MIME_TYPES[ext] || "application/octet-stream",
    "content-length": data.length,
  });
  res.end(data);
}

export async function createDashboardServer({
  host = "127.0.0.1",
  port = 18766,
  serverUrl = "http://127.0.0.1:18765",
  staticDir = dashboardDistDir(),
} = {}) {
  const server = http.createServer((req, res) => {
    (async () => {
      const url = new URL(req.url || "/", `http://${host}:${port}`);
      const pathname = decodeURIComponent(url.pathname);
      if (pathname.startsWith("/assets/")) {
        await serveFile(res, path.join(staticDir, pathname));
        return;
      }
      const html = await readIndex(staticDir, serverUrl);
      writeText(res, 200, "text/html; charset=utf-8", html);
    })().catch((error) => {
      if (error && error.code === "ENOENT") {
        writeText(res, 404, "text/plain; charset=utf-8", "Not found");
        return;
      }
      writeText(res, 500, "text/plain; charset=utf-8", error instanceof Error ? error.message : String(error));
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  async function close() {
    await new Promise((resolve) => server.close(resolve));
  }

  return { server, close };
}
