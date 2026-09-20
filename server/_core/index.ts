import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { autoPublishReadyDraft, evaluateLowEngagementAlerts, generateDraftForReview, generateWeeklyPerformanceReport, handleTelegramWebhookUpdate, isValidTelegramWebhookSecret } from "../publisher";
import { createContext } from "./context";
import { assertRequiredEnv } from "./env";
import { describeEnvironment, registerHealthRoute } from "./health";
import { registerSchedulerStatus, startInProcessScheduler, type ScheduledTask } from "./scheduler";
import { serveStatic, setupVite } from "./vite";

/**
 * Tasks the in-process scheduler runs when `ENABLE_INPROCESS_SCHEDULER=true`.
 * The run-key guard keeps these tasks idempotent across restarts.
 */
const inProcessTasks: ScheduledTask[] = [
  { name: "draft", cronExpression: "0 30 2-23/3 * * *", run: () => generateDraftForReview({}) },
  { name: "publish", cronExpression: "0 0 */3 * * *", run: () => autoPublishReadyDraft() },
  { name: "weekly-report", cronExpression: "0 0 8 * * 1", run: () => generateWeeklyPerformanceReport() },
  { name: "engagement-alerts", cronExpression: "0 0 10 * * *", run: () => evaluateLowEngagementAlerts() },
];

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Fail fast in production if required configuration is missing. Development
  // mode stays permissive so `tsx` tooling and local testing can run without a
  // full secret set.
  if (process.env.NODE_ENV === "production") {
    assertRequiredEnv();
  }

  const app = express();
  const server = createServer(app);
  app.disable("x-powered-by");
  // No upload route currently exists. Keep public request bodies small and
  // add a route-specific parser if uploads are introduced later.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));
  registerHealthRoute(app);
  registerSchedulerStatus(app, inProcessTasks);
  app.use("/api/trpc", (req, res, next) => {
    const origin = req.get("origin");
    const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const protocol = forwardedProto || req.protocol;
    const expectedOrigin = `${protocol}://${req.get("host")}`;
    if (req.method !== "GET" && origin && origin !== expectedOrigin) return res.status(403).json({ error: "invalid-origin" });
    return next();
  });
  app.post("/api/telegram/webhook", async (req, res) => {
    if (!isValidTelegramWebhookSecret(req.header("X-Telegram-Bot-Api-Secret-Token") ?? undefined)) return res.status(401).json({ error: "invalid-telegram-webhook-secret" });
    try {
      const outcome = await handleTelegramWebhookUpdate(req.body);
      return res.json({ ok: true, ...outcome });
    } catch (error) {
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Start the optional in-process scheduler after routes are registered.
  const stopScheduler = startInProcessScheduler(inProcessTasks);

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(
      `[boot] ${describeEnvironment().mode} server listening on http://localhost:${port}/ ` +
      `(telegram=${describeEnvironment().telegramConfigured ? "configured" : "missing"})`
    );
  });

  const shutdown = (signal: string) => {
    console.log(`[shutdown] received ${signal}, closing server and scheduler…`);
    stopScheduler();
    server.close(() => process.exit(0));
    // Force-exit if graceful close hangs (e.g. an in-flight LLM request).
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startServer().catch(error => {
  console.error("[boot] Failed to start server:", error);
  process.exit(1);
});
