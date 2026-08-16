# AI Channel Publisher

An autonomous Telegram channel publisher powered by AI. It watches news sources you choose, drafts posts with any OpenAI-compatible model, and publishes them to **any Telegram channel** on a three-hour review-then-publish cycle — in **Persian, English, German, or a custom language**.

Built as a full-stack self-hosted web app: React dashboard, tRPC/Express backend, MySQL (Drizzle ORM), and a draft-review workflow that keeps you in control of everything the bot posts.

> This project started as *VerborgeneSchicht Publisher* (a Persian-only publisher for one channel). It has been generalized so anyone can run it for their own channel, model, and language.

## Features

- **Works with any channel** — set the channel handle, display name, and post signature in the web UI; no code changes needed.
- **Bring your own model** — any OpenAI-compatible provider (OpenAI, OpenRouter, Groq, Together, local Ollama, …). Configure base URL, **API key, and model in the settings UI**; the key is stored AES-256-GCM encrypted in your database and never returned to the browser. Environment variables act as fallback defaults.
- **Instruction Studio** — chat with the model using your channel's live editorial prompt to draft and refine the instructions, then save the reply as your standing editorial guidance with one click.
- **Multilingual** — dashboard UI in **Persian (فارسی), English, and Deutsch** with automatic RTL/LTR switching, and a separate setting for the language the AI writes posts in (fa / en / de / custom).
- **Draft → review → publish workflow** — a draft is generated 30 minutes before each 3-hour slot so you can edit, hold, or approve it; auto-publish only sends unheld drafts.
- **Source management** — add any news homepage or RSS/Atom feed, mark sources primary/third-party, toggle them on and off.
- **Engagement analytics** — Telegram reaction tracking via secure webhook, audience size, per-source performance comparison, CSV export, weekly Markdown reports delivered to your own Telegram DM, and low-engagement alerts with per-source thresholds.
- **Single-admin auth** — PBKDF2 password + JWT session cookie; nobody else touches your dashboard.

## Screenshots

<!-- TODO: add screenshots of the Dashboard, Settings (AI model), and Instruction Studio -->

## Quick start (Docker Compose — recommended)

```bash
git clone https://github.com/<your-user>/ai-channel-publisher.git
cd ai-channel-publisher

# 1. Configure
cp .env.example .env

# 2. Generate the admin password hash and put it in .env
pnpm install
pnpm exec tsx scripts/generate-admin-password-hash.ts

# 3. Run (app + MySQL 8)
docker compose up -d --build
```

The app runs migrations automatically on boot and listens on `http://localhost:3000`. Log in with `ADMIN_USERNAME` and the password you hashed.

**Telegram setup:** create a bot with [@BotFather](https://t.me/BotFather), set `TELEGRAM_BOT_TOKEN`, add the bot as an **administrator** of your channel with **Post Messages** permission, and set `TELEGRAM_CHANNEL_HANDLE` (or just set the handle later in Settings → Channel & language).

## Quick start (bare metal)

Requires Node 22+ and pnpm 10.

```bash
pnpm install
cp .env.example .env          # fill required values
pnpm exec tsx scripts/migrate.mjs   # or: pnpm db:migrate
pnpm build
pnpm start
```

For production behind a reverse proxy, sample Caddy and nginx configs live in [`deploy/`](deploy/), and a systemd unit example is in [`DEPLOYMENT.md`](DEPLOYMENT.md).

## Configuration

All configuration lives in `.env` (see [`.env.example`](.env.example)). The essentials:

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_APP_ID` | ✅ | Opaque app identifier for sessions/cookies |
| `JWT_SECRET` | ✅ | Signs login-session JWTs (long random value) |
| `DATABASE_URL` | ✅ | MySQL connection string |
| `ADMIN_PASSWORD_HASH` | ✅ | PBKDF2 hash — generate with `pnpm exec tsx scripts/generate-admin-password-hash.ts` |
| `TELEGRAM_BOT_TOKEN` | for publishing | Bot token from @BotFather |
| `TELEGRAM_CHANNEL_HANDLE` | seed only | First-run channel handle; editable in the web UI |
| `TELEGRAM_WEBHOOK_SECRET` | for engagement | Secret token for the Telegram webhook |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | defaults | Fallback LLM config; can be overridden in the web UI |
| `SETTINGS_SECRET` | optional | Dedicated key for encrypting UI-saved secrets (falls back to `JWT_SECRET`) |
| `ENABLE_INPROCESS_SCHEDULER` | optional | Run the cron scheduler inside the Node process |

### Language settings

- **Dashboard language** — switch anytime from the sidebar (فارسی / English / Deutsch); the choice is remembered per browser and the layout flips RTL/LTR automatically.
- **Post output language** — Settings → Channel & language → *Post output language* (`fa`, `en`, `de`, or `custom`). Generated posts are validated to actually be in the configured language before they can be published. With `custom`, the output language follows your editorial guidance.

## Architecture

```
client/    React 19 + Vite SPA (shadcn/ui, TanStack Query, tRPC client, recharts)
server/    Express + tRPC 11 API
  _core/     env, LLM client (OpenAI-compatible), auth, scheduler, settings crypto
  publisher/ pipeline (draft → review → publish), editorial prompts & languages,
             Telegram delivery, analytics & reports
drizzle/   MySQL schema + migrations (Drizzle ORM)
cloudflare/ Legacy Workers/D1 variant (not maintained alongside this fork)
deploy/    Caddy / nginx samples
```

Key flows:

1. **Drafting** — every 3 hours (30 min before the publish slot) active sources are fetched, deduplicated by URL/topic/content fingerprint, and one candidate is summarized by the LLM using the language-aware editorial prompt plus your standing guidance.
2. **Review** — drafts appear on the Posts page for editing/holding; unheld drafts publish automatically at the slot, or you can publish instantly.
3. **Engagement** — a secure Telegram webhook records reaction counts; alerts and weekly reports go to the Telegram account you link with a one-time code.

## Development

```bash
pnpm install
pnpm dev        # Vite dev server + tsx watch (needs .env / DATABASE_URL)
pnpm check      # tsc --noEmit
pnpm test       # vitest
pnpm build      # production build (client + server bundle)
```

## Notes & limitations

- The Express + MySQL backend (`server/`) is the actively maintained target; the Cloudflare Workers variant in `cloudflare/` predates the generalization and is kept for reference only.
- Telegram DM alerts and weekly-report Markdown are still generated in Persian; localizing them per output language is on the roadmap.
- The Bot API exposes reaction counts only — no views, forwards, or full audience analytics.

## Roadmap ideas

- Multi-channel support (manage several channels from one dashboard)
- Cross-platform publishing (X/Twitter, Mastodon, Bluesky) via a provider abstraction
- AI-generated header images per post
- Scheduling queue with calendar view
- Analytics CSV/weekly email export in addition to Telegram DM
- Multiple admin accounts with roles
- Per-source RSS-to-post templates
- Localized Telegram reports/alerts

## License

[MIT](LICENSE)
