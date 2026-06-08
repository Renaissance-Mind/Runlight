import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const wranglerPath = join(scriptDir, "..", "wrangler.toml");
const wranglerConfig = readFileSync(wranglerPath, "utf8");

if (wranglerConfig.includes('database_id = "YOUR_DATABASE_ID_HERE"')) {
  console.error(
    "workers/wrangler.toml still has the placeholder D1 database_id. Run `npm run db:create`, copy the database_id into wrangler.toml, then deploy.",
  );
  process.exit(1);
}
