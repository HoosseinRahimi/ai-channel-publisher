# AI Channel Publisher

A self-hosted AI publishing system for Telegram channels. It monitors news sources, turns selected stories into channel-ready drafts with an OpenAI-compatible model, gives the owner a review window, publishes approved content, and tracks engagement from Telegram.

The project is built as a production-style full-stack application rather than a single bot script: React dashboard, typed tRPC API, Express backend, MySQL with Drizzle ORM, scheduled publishing, encrypted model credentials, Telegram webhooks, analytics, tests, and Docker deployment.

> AI Channel Publisher started as a channel-specific publisher and was later generalized so the channel, language, sources, model provider, and editorial instructions can all be configured without changing application code.

## What it does

1. Fetches enabled news homepages and RSS/Atom feeds.
2. Deduplicates candidate stories.
3. Uses an OpenAI-compatible LLM to generate a post with your editorial instructions and output language.
4. Saves the result as a draft before the scheduled publishing slot.
5. Lets the owner edit, hold, approve, or publish immediately.
6. Sends approved posts through the Telegram Bot API.
7. Receives Telegram reaction updates through a protected webhook and turns them into source and post analytics.

## Highlights

- **Configurable channel**: change the Telegram channel, display name, signature, and output language from the dashboard.
- **Bring your own model**: OpenAI, OpenRouter, Groq, Together, Ollama, or another OpenAI-compatible endpoint.
- **Encrypted model credentials**: API keys saved from the UI are encrypted with AES-256-GCM and are never returned to the browser.
- **Instruction Studio**: refine the standing editorial prompt with the same configured model before saving it.
- **Multilingual UI**: Persian, English, and German with RTL/LTR switching.
- **Multilingual publishing**: Persian, English, German, or a custom language defined by editorial guidance.
- **Review-first automation**: drafts are prepared before each publishing slot and can be edited or held.
- **Source management**: add RSS/Atom feeds or news pages, classify sources, and enable or disable them independently.
- **Engagement intelligence**: reaction tracking, audience size, source comparison, alerts, CSV export, and weekly Markdown reports.
- **Single-admin security model**: PBKDF2 password hashing plus JWT session cookies.
- **Self-hosted deployment**: Docker Compose with MySQL, or a Node/Express deployment with an external MySQL/TiDB database.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, TanStack Query, shadcn/ui, Recharts |
| API | tRPC 11 on Express |
| Backend | Node.js, TypeScript |
| Database | MySQL / TiDB with Drizzle ORM |
| AI | OpenAI-compatible Chat Completions API |
| Publishing | Telegram Bot API |
| Scheduling | `node-cron` in the self-hosted Node deployment |
| Auth | PBKDF2 password verification, JWT session cookie |
| Deployment | Docker, Docker Compose, Caddy/nginx examples |
| Validation | TypeScript checks and Vitest |

## Architecture

```mermaid
flowchart LR
    Admin[Channel Owner] -->|browser| UI[React Dashboard]
    UI -->|typed tRPC calls| API[Express + tRPC API]

    API --> Auth[Admin Auth]
    API --> DB[(MySQL / TiDB)]
    API --> Settings[Encrypted Settings]
    Settings --> LLM[OpenAI-compatible LLM]

    Scheduler[Node Scheduler] --> Pipeline[Publishing Pipeline]
    API --> Pipeline

    Sources[RSS / Atom / News Sources] --> Pipeline
    Pipeline -->|fetch + deduplicate| DB
    Pipeline -->|editorial prompt| LLM
    LLM -->|generated draft| Pipeline
    Pipeline -->|store draft| DB

    Admin -->|review / edit / hold| UI
    Pipeline -->|approved post| Telegram[Telegram Bot API]
    Telegram --> Channel[Telegram Channel]

    Telegram -->|reaction webhook| Webhook[Secure Webhook]
    Webhook --> Analytics[Engagement Analytics]
    Analytics --> DB
    DB --> API
```

### Publishing lifecycle

```text
Sources
  -> fetch and normalize
  -> deduplicate
  -> select candidate
  -> generate with LLM
  -> validate language/content
  -> save draft
  -> owner review window
  -> publish or hold
  -> Telegram channel
  -> reaction webhook
  -> analytics and reports
```

## Demo

A shared public admin instance is not required to evaluate the project. The safest demo is a local Docker deployment where publishing stays disabled until Telegram and LLM credentials are intentionally configured.

See **[DEMO.md](DEMO.md)** for two walkthroughs:

- **Dashboard demo**: run the complete web application locally without sending Telegram posts.
- **End-to-end demo**: connect a test Telegram channel and an OpenAI-compatible model, generate a draft, review it, publish it, and inspect the resulting analytics flow.

## Quick setup with Docker Compose

### Prerequisites

- Docker Engine with Docker Compose
- Git
- A browser

Telegram and LLM credentials are optional for booting the dashboard. They are required only when you want to generate or publish real content.

### 1. Clone the repository

```bash
git clone https://github.com/HoosseinRahimi/ai-channel-publisher.git
cd ai-channel-publisher
```

### 2. Create the environment file

```bash
cp .env.example .env
```

For the bundled Compose MySQL service, make sure `.env` uses the Compose service hostname instead of `localhost`:

```env
DATABASE_URL=mysql://publisher:change-me-publisher@mysql:3306/verborgene_schicht
MYSQL_ROOT_PASSWORD=change-me-root
MYSQL_DATABASE=verborgene_schicht
MYSQL_USER=publisher
MYSQL_PASSWORD=change-me-publisher
```

Generate strong production values instead of the example passwords when the service is exposed beyond your machine.

### 3. Generate the administrator password hash

Node 22+ and pnpm 10 are needed for this helper command:

```bash
pnpm install --frozen-lockfile
pnpm exec tsx scripts/generate-admin-password-hash.ts
```

Copy the generated value into:

```env
ADMIN_PASSWORD_HASH=pbkdf2$...
```

Also set a strong `JWT_SECRET` in `.env`.

### 4. Start the stack

```bash
docker compose up -d --build
```

The container entrypoint applies pending database migrations before starting the application.

### 5. Verify health

```bash
curl http://localhost:3000/api/health/live
curl http://localhost:3000/api/health
```

Then open:

```text
http://localhost:3000
```

Log in with `ADMIN_USERNAME` and the password used to generate `ADMIN_PASSWORD_HASH`.

## Enable AI generation

You can configure the provider in `.env`:

```env
LLM_BASE_URL=https://api.openai.com
LLM_API_KEY=your-key
LLM_MODEL=gpt-4o-mini
```

Or configure the model from the dashboard under **Settings -> AI model & API key**. UI-saved secrets take precedence over environment defaults and are stored encrypted in the database.

The app expects an OpenAI-compatible `/v1/chat/completions` interface.

## Enable Telegram publishing

1. Create a bot with [@BotFather](https://t.me/BotFather).
2. Add the bot as an administrator of a test or production channel.
3. Grant it **Post Messages** permission.
4. Configure:

```env
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHANNEL_HANDLE=@your_channel
TELEGRAM_WEBHOOK_SECRET=generate-a-long-random-secret
```

The channel handle and language can also be adjusted later from **Settings -> Channel & language**.

For first-time evaluation, use a private test channel before connecting a production channel.

## Bare-metal setup

Requires Node.js 22+, pnpm 10, and a reachable MySQL/TiDB database.

```bash
git clone https://github.com/HoosseinRahimi/ai-channel-publisher.git
cd ai-channel-publisher
pnpm install --frozen-lockfile
cp .env.example .env
# edit .env
pnpm db:migrate
pnpm build
ENABLE_INPROCESS_SCHEDULER=true pnpm start
```

Verify the health endpoints before enabling scheduled publishing:

```bash
curl http://localhost:3000/api/health/live
curl http://localhost:3000/api/health
```

For reverse-proxy and service examples, see [`DEPLOYMENT.md`](DEPLOYMENT.md) and [`deploy/`](deploy/).

## Important configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_APP_ID` | yes | App identifier used to namespace sessions/cookies |
| `JWT_SECRET` | yes | Signs admin session JWTs |
| `DATABASE_URL` | yes | MySQL/TiDB connection string |
| `ADMIN_USERNAME` | yes | Dashboard administrator username |
| `ADMIN_PASSWORD_HASH` | yes | PBKDF2 password hash |
| `TELEGRAM_BOT_TOKEN` | publishing | Telegram bot credentials |
| `TELEGRAM_CHANNEL_HANDLE` | publishing | Initial channel target, also editable in UI |
| `TELEGRAM_WEBHOOK_SECRET` | analytics | Protects Telegram webhook requests |
| `LLM_BASE_URL` | generation | OpenAI-compatible provider base URL |
| `LLM_API_KEY` | generation | Provider API key |
| `LLM_MODEL` | generation | Model identifier |
| `SETTINGS_SECRET` | optional | Separate encryption secret for UI-stored credentials |
| `ENABLE_INPROCESS_SCHEDULER` | optional | Enables the Node scheduler for self-hosted deployment |

See [`.env.example`](.env.example) for the full template.

## Repository structure

```text
client/                 React dashboard
  src/pages/            dashboard, posts, analytics, settings
  src/components/       feature and UI components

server/                 active Express/tRPC backend
  _core/                auth, env, LLM client, scheduler, health, crypto
  publisher/            pipeline, editorial rules, languages, Telegram, analytics
  routers.ts            application API routes

drizzle/                MySQL schema and migrations
scripts/                 migration and admin-password utilities
deploy/                  Caddy and nginx examples
cloudflare/              legacy Workers/D1 variant kept for reference
Dockerfile               production application image
docker-compose.yml       app + local MySQL stack
```

The Express/MySQL implementation under `server/` is the actively maintained deployment target. The `cloudflare/` implementation is retained as a legacy reference and is not expected to evolve in lockstep with the main backend.

## Development

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Useful checks:

```bash
pnpm check     # TypeScript type-check
pnpm test      # Vitest suite
pnpm build     # production client + server build
```

## Security notes

- Never commit a real `.env` file.
- Use a private test channel when validating Telegram publishing.
- Put production deployments behind HTTPS.
- Rotate a Telegram token or LLM key immediately if it is ever exposed.
- Use strong, unique values for `JWT_SECRET`, `SETTINGS_SECRET`, database passwords, and webhook secrets.
- Verify both health endpoints before enabling the scheduler in production.

## Current limitations

- The application currently targets a single managed Telegram channel per deployment.
- Telegram Bot API analytics are limited to information exposed by Telegram, such as reaction updates. They do not provide a complete social analytics dataset.
- Some Telegram DM reports remain Persian-specific and are candidates for future localization.
- The `cloudflare/` deployment is a legacy variant; `server/` is the primary maintained path.

## Roadmap

- Multi-channel management
- Additional publishing providers such as Mastodon, Bluesky, and X/Twitter
- AI-generated header images
- Calendar-based scheduling queue
- More export/report delivery options
- Multiple administrators and roles
- Per-source post templates
- Fully localized reports and alerts

## License

[MIT](LICENSE)
