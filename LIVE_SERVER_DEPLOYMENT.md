# Independent Live Deployment

The project no longer requires a managed application host. It supports:

- Cloudflare Workers + D1 + Cron Triggers (see `cloudflare/DEPLOYMENT.md`)
- Docker/Express + MySQL/TiDB + the built-in Node scheduler

Both paths use the same independent owner password login, OpenAI-compatible
LLM adapter, direct Telegram Bot API, and environment-based secrets.

For Docker/Express, copy `.env.example`, generate `ADMIN_PASSWORD_HASH` with
`pnpm exec tsx scripts/generate-admin-password-hash.ts`, set the provider
secrets, and start with:

```bash
pnpm install --frozen-lockfile
pnpm db:migrate
ENABLE_INPROCESS_SCHEDULER=true pnpm start
```

Keep the application behind HTTPS and verify `/api/health/live` and
`/api/health` before enabling automated publishing.
