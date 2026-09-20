# AI Channel Publisher — Deployment Guide

Deploy the autonomous AI channel publisher to your own host. Supported paths:

- **Docker Compose** (recommended) — self-contained app + MySQL 8, TLS via a
  reverse proxy at the edge.
- **Bare metal / VM** — Node 22 + pnpm + existing MySQL/TiDB, process run under
  systemd.
- **Cloudflare Workers / D1** (serverless) — the same product running as a
  Cloudflare Worker with a D1 (SQLite) database and Cron Triggers. See
  [`cloudflare/DEPLOYMENT.md`](cloudflare/DEPLOYMENT.md). The Docker/Express path
  stays fully supported; the two targets are parallel.

> ⚠️ **No secrets live in this repo.** Every credential is supplied via the
> runtime environment (a host secret manager, `.env`, or the container
> environment). `assertRequiredEnv()` fails fast at production startup and
> lists exactly which variables are missing.

---

## 1. Prerequisites

- **Node.js 22** (or the Docker runtime).
- **pnpm** (lockfile is `pnpm-lock.yaml`; use `pnpm install --frozen-lockfile`).
- **A MySQL-compatible database** (MySQL 8 / TiDB / MariaDB) reachable from the app.
- **Telegram**: a bot token (`@BotFather`) whose bot is an **administrator with
  Post Messages** on your channel (e.g. `@your_channel`).
- **LLM provider**: an OpenAI-compatible `v1/chat/completions` endpoint + key
  configured with `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`.
- **Authentication**: the built-in owner-only password login using
  `ADMIN_PASSWORD_HASH`.

## 2. Configure environment

```bash
cp .env.example .env
# fill every value — see comments in .env.example
```

Fields that must be real for the app to boot in production (failing these is a
hard error with a precise list):

| Variable | Purpose |
|---|---|
| `VITE_APP_ID` | App identifier (namespace for sessions/cookies). |
| `JWT_SECRET` | Signs login-session JWTs. Use `openssl rand -base64 48`. |
| `DATABASE_URL` | MySQL/TiDB connection string. |
| `ADMIN_PASSWORD_HASH` | PBKDF2 hash for the owner login. |

Optional but needed for real publishing:

| Variable | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Publishes to the channel (server-side only). |
| `TELEGRAM_WEBHOOK_SECRET` | Authenticates the engagement webhook. |
| `PUBLIC_BASE_URL` | Deployed HTTPS origin used for Telegram webhook registration. |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | OpenAI-compatible LLM configuration. |
| `ENABLE_INPROCESS_SCHEDULER=true` | Self-hosted Node scheduling. |

## 3. Deploy with Docker Compose (recommended)

```bash
cp .env.example .env          # fill every value
docker compose up --build -d
curl -s http://localhost:3000/api/health   # { "ok": true, ... }
```

- The app container runs as a **non-root** user.
- **Migrations run automatically** in the entrypoint via
  `scripts/migrate.mjs` (drizzle-orm's migrator — no build tooling in the image).
- The integrated `mysql` service is optional: point `DATABASE_URL` at an
  external server and remove that block.
- The scheduler is enabled by default in compose
  (`ENABLE_INPROCESS_SCHEDULER=true`): it runs
  draft → publish → weekly report → engagement alerts on UTC cron.

### 3.1 TLS

Terminate TLS at the edge. Ready configs:

- **Caddy** — `deploy/caddy/Caddyfile` (automatic Let's Encrypt).
- **Nginx** — `deploy/nginx.conf` (certbot-friendly).

`GET /api/health` and `GET /api/health/live` are exposed for probes/uptime.

## 4. Deploy bare-metal / VM

Restore the source, then:

```bash
pnpm install --frozen-lockfile
node scripts/migrate.mjs          # or: pnpm dlx drizzle-kit migrate
pnpm check
pnpm build                        # emits dist/index.js + dist/public/
NODE_ENV=production pnpm start
```

Run behind an HTTPS reverse proxy (example systemd unit below) and set
`ENABLE_INPROCESS_SCHEDULER=true` unless an external scheduler calls
`/api/scheduled/*`.

```ini
# /etc/systemd/system/ai-channel-publisher.service
[Unit]
Description=AI Channel Publisher
After=network.target

[Service]
WorkingDirectory=/opt/ai-channel-publisher
EnvironmentFile=/opt/ai-channel-publisher/.env
ExecStart=/usr/bin/node dist/index.js
Environment=NODE_ENV=production
Restart=always
User=publisher
Group=publisher

[Install]
WantedBy=multi-user.target
```

## 5. Verify the deployment

1. `GET /api/health` → `{ "ok": true, "status": "ok", ... }`; 503 when the DB
   is unreachable.
2. `GET /api/health/live` → always 200 (liveness).
3. `GET /api/scheduled/status` → lists the in-process scheduler tasks when
   `ENABLE_INPROCESS_SCHEDULER=true`.
4. Log in as the owner → dashboard renders with the seeded default sources.
5. In the dashboard, **generate a draft**, review it, **save tone feedback**,
   then **send one test post** (`publishNextPost` with `isTest`) to confirm
   Telegram delivers.
6. Enable the engagement webhook from the UI
   (`configureTelegramEngagementWebhook`) so reaction tracking works.
7. Confirm the weekly report / low-engagement alerts arrive at the connected
   Telegram account.

## 6. Operations

- **Logs**: stream `docker compose logs -f app` (JSON-style via the structured
  logger). Set `DEBUG=*` for verbose output.
- **Backups**: back up the MySQL database and this source tree. Secrets are not
  part of the archive — restore them from your secret manager.
- **Upgrades**: rebuild the image (`docker compose build`) and redeploy; the
  entrypoint applies new migrations automatically.
- **Scheduler caveat**: the in-process scheduler starts at boot. Tasks are
  idempotent (run-key guard), so a restart mid-cycle is safe.
