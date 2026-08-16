/**
 * VerborgeneSchicht Publisher — Cloudflare Worker entry.
 *
 * A single Worker serves both the HTTP API (tRPC + health + Telegram webhook
 * proxy + Telegram webhook) and Cloudflare Cron Triggers for the four
 * scheduled publisher phases. The Docker/Express deploy target is unchanged.
 *
 * Cron Triggers (UTC) are declared in `wrangler.toml`:
 *   - draft                every 3h (30m before publish)
 *   - publish              every 3h
 *   - weekly-report        Mondays 08:00
 *   - engagement-alerts    daily 10:00
 *
 * The `scheduled` handler runs the same service functions the Express
 * `/api/scheduled/*` callbacks ran; `*ScheduleForCallback` + run-key guards
 * keep them idempotent and pause-aware.
 */
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { D1Database } from "@cloudflare/workers-types";
import { installProcessEnv } from "./_core/workerEnv";
import { bindD1, ensureDbSeeded } from "./db";
import { ShimApp } from "./_core/expressShim";
import { registerHealthRoute } from "./_core/health";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import {
  autoPublishReadyDraft,
  DRAFT_CRON,
  ENGAGEMENT_ALERT_CRON,
  evaluateLowEngagementAlerts,
  generateDraftForReview,
  generateWeeklyPerformanceReport,
  handleTelegramWebhookUpdate,
  isValidTelegramWebhookSecret,
  WEEKLY_REPORT_CRON,
} from "./publisher";
import { jsonResponse } from "./_core/expressShim";

export interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  ADMIN_PASSWORD_HASH?: string;
  ADMIN_USER_ID?: string;
  ADMIN_USERNAME?: string;
  ADMIN_DISPLAY_NAME?: string;
  LLM_BASE_URL?: string;
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
  VITE_APP_ID?: string;
  [key: string]: unknown;
}

type ScheduledPhase = "draft" | "publish" | "weekly-report" | "engagement-alerts";


async function buildApp(env: Env): Promise<ShimApp> {
  installProcessEnv(env);
  bindD1(env.DB);
  await ensureDbSeeded().catch(err => {
    console.warn("[Worker] ensureDbSeeded failed:", err);
  });

  const app = new ShimApp();
  registerHealthRoute(app);

  app.post("/api/telegram/webhook", async (req, res) => {
    const secretHeader = req.get("X-Telegram-Bot-Api-Secret-Token");
    if (!isValidTelegramWebhookSecret(secretHeader)) {
      res.status(401).json({ error: "invalid-telegram-webhook-secret" });
      return;
    }
    try {
      const outcome = await handleTelegramWebhookUpdate(req.body as Record<string, unknown>);
      res.json({ ok: true, ...outcome });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });

  return app;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Per-request lazily built app; cheap since routes build fast and we bind
    // the D1 handle per invocation.
    const url = new URL(request.url);
    const app = await buildApp(env);

    // tRPC endpoint (before the static/shorthand paths).
    if (url.pathname.startsWith("/api/trpc")) {
      return fetchRequestHandler({
        endpoint: "/api/trpc",
        req: request,
        router: appRouter,
        createContext,
      });
    }

    // Webhook + health routes.
    const matched = await app.dispatch(request);
    if (matched) return matched;

    // Static assets (dashboard) are served by Cloudflare's `assets` binding in
    // `wrangler.toml`; anything else not matched is a 404.
    return jsonResponse(
      { error: "not found", path: url.pathname },
      404
    );
  },

  /**
   * Cloudflare Cron Trigger. `controller.cron` carries the trigger schedule text
   * (e.g. the every-three-hours schedule or the half-hour draft schedule), so we run the phase that actually fired. Each phase
   * re-checks the D1-persisted enable flags via `get*ScheduleForCallback`, and
   * the run-key guard prevents duplicate work across overlapping triggers.
   */
  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    installProcessEnv(env);
    bindD1(env.DB);
    await ensureDbSeeded().catch(err => {
      console.warn("[Worker] ensureDbSeeded failed:", err);
    });

    const cron = controller.cron ?? "";
    let outcome: unknown;

    if (cron === DRAFT_CRON) {
      outcome = await generateDraftForReview({}).catch(err => ({ error: err instanceof Error ? err.message : String(err) }));
    } else if (cron === WEEKLY_REPORT_CRON) {
      outcome = await generateWeeklyPerformanceReport().catch(err => ({ error: err instanceof Error ? err.message : String(err) }));
    } else if (cron === ENGAGEMENT_ALERT_CRON) {
      outcome = await evaluateLowEngagementAlerts().catch(err => ({ error: err instanceof Error ? err.message : String(err) }));
    } else {
      // Default (publish / every-three-hours schedule) or unknown — publishing first, and
      // we also let any trigger attempt a draft so a manual re-run repopulates.
      outcome = await autoPublishReadyDraft().catch(err => ({ error: err instanceof Error ? err.message : String(err) }));
      void generateDraftForReview({}).catch(() => undefined);
    }

    console.log("[Worker] scheduled", cron || "(unknown)", outcome);
  },
};
