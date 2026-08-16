/**
 * Centralized environment configuration.
 *
 * Reading an env value must never throw — tests and local tooling legitimately
 * run without secrets, and `getDb()` degrades gracefully when there is no
 * `DATABASE_URL`. Instead, production startup calls `assertRequiredEnv()` and
 * fails fast with a precise list of what is missing.
 */

const read = (name: string): string => process.env[name]?.trim() ?? "";

export const ENV = {
  appId: read("VITE_APP_ID"),
  cookieSecret: read("JWT_SECRET"),
  databaseUrl: read("DATABASE_URL"),
  adminUserId: read("ADMIN_USER_ID") || "local-admin",
  adminUsername: read("ADMIN_USERNAME") || "admin",
  adminDisplayName: read("ADMIN_DISPLAY_NAME") || "Administrator",
  adminPasswordHash: read("ADMIN_PASSWORD_HASH"),
  isProduction: process.env.NODE_ENV === "production",
  port: Number(process.env.PORT ?? "3000"),

  // Telegram publishing.
  telegramBotToken: read("TELEGRAM_BOT_TOKEN"),
  telegramWebhookSecret: read("TELEGRAM_WEBHOOK_SECRET"),
  telegramChannelHandle: read("TELEGRAM_CHANNEL_HANDLE"),

  // OpenAI-compatible LLM provider. These act as fallbacks; values saved in
  // the web UI (publisher_settings table) take precedence when set.
  llmApiUrl: read("LLM_BASE_URL"),
  llmApiKey: read("LLM_API_KEY"),
  llmModel: read("LLM_MODEL") || "gpt-4o-mini",

  // Encryption key for secrets stored in the database (e.g. the LLM API key
  // saved from the settings UI). Falls back to JWT_SECRET when unset.
  settingsSecret: read("SETTINGS_SECRET"),

  // Optional analytics (VITE_* are inlined at build time).
  analyticsEndpoint: read("VITE_ANALYTICS_ENDPOINT"),
  analyticsWebsiteId: read("VITE_ANALYTICS_WEBSITE_ID"),
} as const;

/**
 * Fail-fast guard for production startup. Throws with a concrete list of every
 * missing REQUIRED variable so operators can fix one `.env` and retry.
 */
export function assertRequiredEnv(env: typeof ENV = ENV): void {
  const requiredNames: Array<[keyof typeof ENV, string]> = [
    ["appId", "VITE_APP_ID"],
    ["cookieSecret", "JWT_SECRET"],
    ["databaseUrl", "DATABASE_URL"],
    ["adminPasswordHash", "ADMIN_PASSWORD_HASH"],
  ];
  const missing = requiredNames
    .filter(([key]) => !env[key])
    .map(([, name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
  "Copy .env.example to .env and fill the required values before starting."
    );
  }
}

export const hasTelegramCredentials = Boolean(
  ENV.telegramBotToken && ENV.telegramWebhookSecret
);
