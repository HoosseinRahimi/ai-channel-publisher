# VerborgeneSchicht Publisher — Independent Cloudflare Deployment

This target runs without a managed platform dependency:

- Cloudflare Worker for the API and dashboard
- Cloudflare D1 for persistent data
- Cloudflare Cron Triggers for publishing schedules
- Direct Telegram Bot API for publishing and engagement callbacks
- Any OpenAI-compatible LLM provider for post generation
- Built-in owner-only password authentication

## 1. Build the dashboard

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm build
```

## 2. Create or select the D1 database

```bash
cd cloudflare
pnpm db:create
```

Put the returned database ID in `wrangler.toml`, then apply migrations:

```bash
pnpm db:apply:remote
```

## 3. Configure secrets

Generate a password hash locally; the plaintext password is never stored in
the repository or uploaded as a Worker secret:

```bash
cd ..
pnpm exec tsx scripts/generate-admin-password-hash.ts
cd cloudflare
```

Upload the generated hash and the provider credentials:

```bash
wrangler secret put ADMIN_PASSWORD_HASH
wrangler secret put JWT_SECRET
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_WEBHOOK_SECRET
wrangler secret put LLM_API_KEY
```

Set the non-secret LLM endpoint/model in `wrangler.toml` or the Cloudflare
dashboard as `LLM_BASE_URL` and `LLM_MODEL`.

## 4. Deploy

```bash
pnpm deploy:dry
pnpm deploy
```

The Worker serves the dashboard and API from the same hostname. The login
screen uses `ADMIN_USERNAME` (default `admin`) and the password represented by
`ADMIN_PASSWORD_HASH`.

## 5. Verify

```bash
curl https://<worker-host>/api/health/live
curl https://<worker-host>/api/health
```

After logging in, verify one draft generation, one held/reviewed post, one
controlled Telegram test post, and the engagement webhook before enabling
production scheduling.

## Cron Triggers

The Worker owns these UTC schedules directly; no external heartbeat service is
used:

| Phase | Schedule |
|---|---|
| Draft | `0 30 2-23/3 * * *` |
| Publish | `0 0 */3 * * *` |
| Weekly report | `0 0 8 * * 1` |
| Engagement alerts | `0 0 10 * * *` |

The dashboard toggles only persist enable/disable state in D1. Cloudflare
Cron Triggers remain statically configured in `wrangler.toml`.
