/**
 * Environment configuration for the Cloudflare Worker.
 *
 * Workers have no `process.env` — values arrive via the `env` binding. This
 * module a) types the binding and b) shims a read-only `process.env` facade so
 * the shared server/* modules that read `process.env.XXX` keep working with
 * zero changes in the Worker runtime.
 */

import type { D1Database } from "@cloudflare/workers-types";

export type WorkerEnv = {
  DB: D1Database;
  // Production secrets/configuration.
  JWT_SECRET: string;
  ADMIN_PASSWORD_HASH: string;
  ADMIN_USER_ID?: string;
  ADMIN_USERNAME?: string;
  ADMIN_DISPLAY_NAME?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  LLM_BASE_URL?: string;
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
  // Client-friendly values (also inlined at Vite build time).
  VITE_APP_ID: string;
  // Optional feature flags.
  ENABLE_INPROCESS_SCHEDULER?: string;
  PORT?: string;
  [key: string]: unknown;
};

/**
 * Install a `process.env`-style object backed by the Worker binding. Call once
 * at the top of the fetch/scheduled handler before importing any module that
 * reads `process.env` at module scope (e.g. `ENV` in `_core/env.ts`).
 */
export function installProcessEnv(env: Record<string, unknown>): void {
  const g = globalThis as Record<string, unknown>;
  const table: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") {
      table[key] = value;
    }
  }
  // Keep NODE_ENV meaningful for code that branches on it.
  table["NODE_ENV"] = "production";

  if (!g["process"]) {
    (g as Record<string, unknown>)["process"] = {};
  }
  const processObj = g["process"] as Record<string, unknown>;
  // The current request's Worker bindings must win over any values retained by
  // a warm isolate from an earlier request or deployment. This matters for
  // rotated secrets such as ADMIN_PASSWORD_HASH.
  processObj["env"] = Object.assign(Object.create(null), processObj["env"] ?? {}, table);
}

/** True when running under `wrangler dev` (NODE_ENV left unset). */
export const isWorkerLocal = (): boolean => {
  const g = globalThis as Record<string, any>;
  return g["process"]?.["env"]?.["NODE_ENV"] !== "production";
};
