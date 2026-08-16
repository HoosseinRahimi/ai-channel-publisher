/**
 * Environment configuration for the Cloudflare Worker.
 *
 * In Workers there is no module-scope `process.env` and the `env` binding is
 * only available inside the request/scheduled handler. ES module imports are
 * hoisted, so the handler cannot populate `process.env` before imported
 * modules evaluate. To keep every ported module's `ENV.xxx` read working with
 * zero changes, `ENV` is a lazy accessor: it reads a per-isolate backing store
 * (`process.env` facade) at access time, not at module load.
 *
 * The entry handler must call `installProcessEnv(env)` (from
 * `_core/workerEnv.ts`) before handling a request; `assertRequiredEnv()` stays
 * as the fail-fast guard for deployment.
 */

import type { WorkerEnv } from "./workerEnv";

type ENV_NAMES =
  | "VITE_APP_ID"
  | "JWT_SECRET"
  | "DATABASE_URL"
  | "ADMIN_USER_ID"
  | "ADMIN_USERNAME"
  | "ADMIN_DISPLAY_NAME"
  | "ADMIN_PASSWORD_HASH"
  | "PORT"
  | "TELEGRAM_BOT_TOKEN"
  | "TELEGRAM_WEBHOOK_SECRET"
  | "LLM_BASE_URL"
  | "LLM_API_KEY"
  | "LLM_MODEL"
  | "VITE_ANALYTICS_ENDPOINT"
  | "VITE_ANALYTICS_WEBSITE_ID";

const ENV_NAME_BY_KEY: Record<keyof Omit<typeof ENV, "port" | "isProduction">, ENV_NAMES> = {
  appId: "VITE_APP_ID",
  cookieSecret: "JWT_SECRET",
  databaseUrl: "DATABASE_URL",
  adminUserId: "ADMIN_USER_ID",
  adminUsername: "ADMIN_USERNAME",
  adminDisplayName: "ADMIN_DISPLAY_NAME",
  adminPasswordHash: "ADMIN_PASSWORD_HASH",
  telegramBotToken: "TELEGRAM_BOT_TOKEN",
  telegramWebhookSecret: "TELEGRAM_WEBHOOK_SECRET",
  llmApiUrl: "LLM_BASE_URL",
  llmApiKey: "LLM_API_KEY",
  llmModel: "LLM_MODEL",
  analyticsEndpoint: "VITE_ANALYTICS_ENDPOINT",
  analyticsWebsiteId: "VITE_ANALYTICS_WEBSITE_ID",
};

function raw(name: string): string | undefined {
  const g = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env?.[name] ?? undefined;
}

function read(name: string): string {
  return raw(name)?.trim() ?? "";
}

export const ENV = {
  get appId() { return read(ENV_NAME_BY_KEY.appId); },
  get cookieSecret() { return read(ENV_NAME_BY_KEY.cookieSecret); },
  get databaseUrl() { return read(ENV_NAME_BY_KEY.databaseUrl); },
  get adminUserId() { return read(ENV_NAME_BY_KEY.adminUserId) || "local-admin"; },
  get adminUsername() { return read(ENV_NAME_BY_KEY.adminUsername) || "admin"; },
  get adminDisplayName() { return read(ENV_NAME_BY_KEY.adminDisplayName) || "Administrator"; },
  get adminPasswordHash() { return read(ENV_NAME_BY_KEY.adminPasswordHash); },
  get isProduction() { return raw("NODE_ENV") === "production"; },
  get port() { return Number(raw("PORT") ?? "3000"); },
  get telegramBotToken() { return read(ENV_NAME_BY_KEY.telegramBotToken); },
  get telegramWebhookSecret() { return read(ENV_NAME_BY_KEY.telegramWebhookSecret); },
  get llmApiUrl() { return read(ENV_NAME_BY_KEY.llmApiUrl); },
  get llmApiKey() { return read(ENV_NAME_BY_KEY.llmApiKey); },
  get llmModel() { return read(ENV_NAME_BY_KEY.llmModel) || "gpt-4o-mini"; },
  get analyticsEndpoint() { return read(ENV_NAME_BY_KEY.analyticsEndpoint); },
  get analyticsWebsiteId() { return read(ENV_NAME_BY_KEY.analyticsWebsiteId); },
} as const;

/** Documented shape for reference — also used to satisfy the binding type. */
export type EnvShape = WorkerEnv;

/**
 * Fail-fast guard for production startup. Throws with a concrete list of every
 * missing REQUIRED variable so operators can fix one `.env` and retry.
 */
export function assertRequiredEnv(): void {
  const required: Array<[string, string]> = [
    ["appId", "VITE_APP_ID"],
    ["cookieSecret", "JWT_SECRET"],
    ["adminPasswordHash", "ADMIN_PASSWORD_HASH"],
  ];
  const missing = required
    .filter(([key]) => !(ENV as Record<string, unknown>)[key])
    .map(([, name]) => name);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        "Set them as Worker secrets/vars before deploying."
    );
  }
}
