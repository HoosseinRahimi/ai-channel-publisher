# AI Channel Publisher Demo

This guide shows two ways to evaluate AI Channel Publisher without risking accidental posts to a production channel.

## Demo A: dashboard-only local demo

Use this path to inspect the application architecture, authentication, settings, source management, posts UI, and analytics screens without enabling AI generation or Telegram publishing.

### 1. Clone and configure

```bash
git clone https://github.com/HoosseinRahimi/ai-channel-publisher.git
cd ai-channel-publisher
cp .env.example .env
```

For the bundled MySQL container, set these values in `.env`:

```env
DATABASE_URL=mysql://publisher:change-me-publisher@mysql:3306/verborgene_schicht
MYSQL_ROOT_PASSWORD=change-me-root
MYSQL_DATABASE=verborgene_schicht
MYSQL_USER=publisher
MYSQL_PASSWORD=change-me-publisher
```

Generate the administrator password hash:

```bash
pnpm install --frozen-lockfile
pnpm exec tsx scripts/generate-admin-password-hash.ts
```

Copy the generated hash into `.env` and set a strong `JWT_SECRET`.

You can leave these blank for the dashboard-only demo:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
LLM_API_KEY=
```

### 2. Start the stack

```bash
docker compose up -d --build
```

Verify health:

```bash
curl http://localhost:3000/api/health/live
curl http://localhost:3000/api/health
```

Open `http://localhost:3000` and sign in.

### 3. Suggested walkthrough

1. Open the dashboard and inspect current publishing status.
2. Switch the interface between English, German, and Persian to verify RTL/LTR behavior.
3. Open **Sources** and add an RSS feed or news homepage.
4. Open **Settings** and inspect channel, language, and model configuration.
5. Open **Instruction Studio** to see where editorial guidance is managed.
6. Open **Posts** to inspect the draft/review workflow.
7. Open **Analytics** to inspect engagement and source-performance views.

No Telegram post is sent unless valid Telegram credentials are configured and a publishing action is triggered.

## Demo B: end-to-end publishing demo

Use a private Telegram test channel for this walkthrough.

### 1. Create a Telegram test channel

1. Create a private Telegram channel.
2. Create a bot with [@BotFather](https://t.me/BotFather).
3. Add the bot to the test channel as an administrator.
4. Grant **Post Messages** permission.

Set:

```env
TELEGRAM_BOT_TOKEN=your-test-bot-token
TELEGRAM_CHANNEL_HANDLE=@your_test_channel
TELEGRAM_WEBHOOK_SECRET=your-long-random-webhook-secret
```

### 2. Configure an AI provider

Either configure the provider in `.env`:

```env
LLM_BASE_URL=https://api.openai.com
LLM_API_KEY=your-api-key
LLM_MODEL=gpt-4o-mini
```

or enter an OpenAI-compatible base URL, API key, and model from the dashboard.

### 3. Add a source

Add an RSS/Atom feed or news homepage from the source-management UI and enable it.

### 4. Configure editorial behavior

In **Instruction Studio**:

1. choose the desired post language,
2. refine the standing editorial instructions,
3. save the final instructions.

### 5. Generate and review a draft

Run the normal generation workflow or wait for the scheduler. A generated item should enter the draft-review stage before publication.

Check that you can:

- edit the generated text,
- hold the draft,
- release it,
- publish immediately when appropriate.

### 6. Publish to the test channel

Publish the reviewed draft and confirm the same content appears in the Telegram test channel.

### 7. Exercise the analytics path

After the Telegram webhook is configured, add reactions to the test post and inspect the corresponding analytics/source-performance views in the dashboard.

## What this demo proves

The end-to-end path exercises the main system boundary:

```text
news source
  -> fetch and deduplicate
  -> AI generation
  -> editorial validation
  -> draft storage
  -> human review
  -> Telegram publishing
  -> reaction webhook
  -> analytics storage
  -> dashboard reporting
```

## Cleanup

Stop the local stack:

```bash
docker compose down
```

Remove the local database volume as well:

```bash
docker compose down -v
```

If you used temporary Telegram or LLM credentials, revoke or rotate them after the demo.
