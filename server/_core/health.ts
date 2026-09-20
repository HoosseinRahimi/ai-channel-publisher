import type { Express } from "express";
import { getDb } from "../db";
import { ENV } from "./env";
import { snapshotPublisherMetrics } from "./metrics";

/**
 * Liveness/readiness probe for load balancers, orchestrators, and uptime
 * monitors. It must never require authentication and must respond quickly.
 *
 * - `liveness`  — process is up. Always 200 when the server is listening.
 * - `readiness` — process is up AND its database connection resolves. Reports
 *   503 so a scheduler/orchestrator can route traffic away during DB outages.
 */
export function registerHealthRoute(app: Express) {
  app.get("/api/health", async (_req, res) => {
    const dbAvailable = Boolean(await getDb());
    const body = {
      ok: dbAvailable,
      status: dbAvailable ? "ready" : "degraded",
      service: "verborgene-schicht-publisher",
      time: new Date().toISOString(),
      metrics: snapshotPublisherMetrics(),
    };
    res.status(dbAvailable ? 200 : 503).json(body);
  });

  // Trivial liveness endpoint for probes that should never touch the DB.
  app.get("/api/health/live", (_req, res) => {
    res.status(200).json({ ok: true, status: "alive" });
  });
}

/** Exposed for startup-time logging. */
export function describeEnvironment() {
  return {
    mode: ENV.isProduction ? "production" : "development",
    telegramConfigured: Boolean(ENV.telegramBotToken),
    engagementWebhookConfigured: Boolean(ENV.telegramWebhookSecret),
    llmConfigured: Boolean(ENV.llmApiUrl && ENV.llmApiKey),
  };
}
