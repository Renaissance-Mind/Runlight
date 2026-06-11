# Runlight - Cloudflare Workers + D1

Serverless deployment of Runlight on Cloudflare. API-compatible with the
Python/FastAPI server. Hosted users sign in to the dashboard with GitHub or
Google, generate an upload token, and configure the local npm CLI/daemon to
upload agent events.

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free plan works)
- Node.js 20+
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

### 4. Set Secrets

For hosted browser login, create GitHub and Google OAuth apps with these
callbacks:

```text
https://runlight.your-domain.com/auth/callback/github
https://runlight.your-domain.com/auth/callback/google
```

Set the public origin and provider credentials:

```bash
npx wrangler secret put PUBLIC_BASE_URL
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

For agent hook uploads, sign in to the deployed dashboard after the first
deploy, open Settings, and generate an upload token. Static `RUNLIGHT_TOKEN_MAP`
secrets are still supported for controlled small-team deployments, but they are
not required for the hosted OAuth flow.

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
| `PUBLIC_BASE_URL` | request origin | Public dashboard origin used for OAuth callback URLs. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | (empty) | GitHub OAuth login credentials. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | (empty) | Google OAuth login credentials. |
| `RUNLIGHT_REQUIRE_AUTH` | unset | Set to `true` in hosted deployments to require OAuth session or bearer token. |
| `HEARTBEAT_STALE_SECONDS` | `120` | Seconds before a session is marked stale |
| `CORS_ORIGINS` | `*` | Allowed CORS origins, comma-separated |

## Usage

Open the dashboard, sign in, and create an upload token in Settings. Then
configure the local daemon:

```bash
npm install -g runlight
runlight login --server https://runlight.YOUR.workers.dev
runlight daemon start
runlight plugin codex
runlight plugin claude
runlight status
runlight health
```

Hooks do not upload directly to the Worker. Codex and Claude Code hooks call the
local daemon; the daemon queues and uploads to `POST /api/events`.
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
- `GET /api/ingest/health` — Bearer-token ingest credential check
- `GET /api/users/current` — Current user from token
- `GET /api/sessions/live` — Live (non-terminal + pinned) sessions
- `GET /api/sessions` — All sessions (with `?agent_type=`, `?status=`, `?limit=`, `?offset=`)
- `GET /api/sessions/:id` — Single session
- `GET /api/sessions/:id/events` — Session events
- `DELETE /api/sessions/:id` — Delete a session and its events
- `GET /api/tokens` — List upload token previews for the signed-in user
- `POST /api/tokens` — Generate an upload token for agent hooks
- `DELETE /api/tokens/:id` — Delete one upload token
- `POST /api/events` — Ingest single event or batch (`{events: [...]}`)

## Costs

Cloudflare Workers free plan includes:
- 100,000 requests/day
- 10M D1 row reads/day, 100K writes/day

For personal or small-team Runlight usage this is more than enough.
