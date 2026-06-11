# Runlight - Cloudflare Workers + D1

Serverless deployment of Runlight on Cloudflare. API-compatible with the Python/FastAPI server — just point your dashboard/menubar/hooks to the Worker URL instead.

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free plan works)
- Node.js 18+
- `npm install` in this directory

## Deployment Steps

Before deploying, verify the Worker code:

```bash
npm run verify
```

### 1. Login to Cloudflare

```bash
npx wrangler login
```

### 2. Create the D1 Database

```bash
npx wrangler d1 create runlight-db
```

This prints a `database_id`. Copy it and update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "runlight-db"
database_id = "YOUR_ACTUAL_DATABASE_ID"
```

`npm run deploy` refuses to run while `wrangler.toml` still has the placeholder
database id.

### 3. Run Database Migration

```bash
npx wrangler d1 migrations apply runlight-db --remote
```

### 4. Set Secrets (Optional)

If you want token-based auth (recommended):

```bash
npx wrangler secret put RUNLIGHT_TOKEN_MAP
# Enter value like: mytoken123:myuser,anothertoken:anotheruser
```

### 5. Deploy

```bash
npx wrangler deploy
```

Your API is now live at `https://runlight.<your-subdomain>.workers.dev`

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `RUNLIGHT_TOKEN_MAP` | (empty) | `token:user_id` pairs, comma-separated. Set via `wrangler secret put`. |
| `TOKEN_MAP` | (empty) | Legacy alias for `RUNLIGHT_TOKEN_MAP`. |
| `HEARTBEAT_STALE_SECONDS` | `120` | Seconds before a session is marked stale |
| `CORS_ORIGINS` | `*` | Allowed CORS origins, comma-separated |

## Usage

Point your agent hooks and dashboard to the Worker URL:

```bash
# Dashboard / MenuBar
Server URL: https://runlight.YOUR.workers.dev

# Hook adapter
export RUNLIGHT_SERVER_URL=https://runlight.YOUR.workers.dev
export RUNLIGHT_TOKEN=mytoken123
```

## Local Development

```bash
# Run locally with D1 simulator
npx wrangler dev

# Apply migrations locally
npx wrangler d1 migrations apply runlight-db --local
```

## API Endpoints

All endpoints match the Python server exactly:

- `GET /api/health` — Health check
- `GET /api/users/current` — Current user from token
- `GET /api/sessions/live` — Live (non-terminal + pinned) sessions
- `GET /api/sessions` — All sessions (with `?agent_type=`, `?status=`, `?limit=`, `?offset=`)
- `GET /api/sessions/:id` — Single session
- `GET /api/sessions/:id/events` — Session events
- `DELETE /api/sessions/:id` — Delete a session and its events
- `POST /api/events` — Ingest single event or batch (`{events: [...]}`)

## Costs

Cloudflare Workers free plan includes:
- 100,000 requests/day
- 10M D1 row reads/day, 100K writes/day

For personal or small-team Runlight usage this is more than enough.
