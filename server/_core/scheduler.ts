import { schedule as cronSchedule, validate as cronValidate } from "node-cron";
import type { Express } from "express";
import { INSTANCE_ID } from "./instance";

export type ScheduledTask = {
  /** Stable identifier used for logs and idempotency. */
  name: string;
  /** 6-field cron (seconds minutes hours day-of-month month day-of-week), UTC. */
  cronExpression: string;
  /** Local method called in-process. */
  run: () => Promise<unknown>;
};

type RuntimeTaskStatus = {
  status: "idle" | "running" | "completed" | "failed";
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastError: string | null;
};

const runtimeStatus = new Map<string, RuntimeTaskStatus>();

function statusFor(task: ScheduledTask) {
  const existing = runtimeStatus.get(task.name);
  if (existing) return existing;
  const initial: RuntimeTaskStatus = { status: "idle", lastStartedAt: null, lastCompletedAt: null, lastError: null };
  runtimeStatus.set(task.name, initial);
  return initial;
}

async function runScheduledTask(task: ScheduledTask) {
  const state = statusFor(task);
  state.status = "running";
  state.lastStartedAt = new Date().toISOString();
  state.lastError = null;
  try {
    await task.run();
    state.status = "completed";
  } catch (error) {
    state.status = "failed";
    state.lastError = error instanceof Error ? error.message : String(error);
    console.error(`[scheduler] task ${task.name} failed:`, error);
  } finally {
    state.lastCompletedAt = new Date().toISOString();
  }
}

/**
 * In-process cron scheduler for the self-hosted Node deployment. Enable it with
 * `ENABLE_INPROCESS_SCHEDULER=true`; each task calls the publisher service
 * directly and remains idempotent through the existing run-key guard.
 */
export function startInProcessScheduler(tasks: ScheduledTask[]): () => void {
  if (process.env.ENABLE_INPROCESS_SCHEDULER !== "true") {
    console.log("[scheduler] in-process scheduler disabled on this instance (ENABLE_INPROCESS_SCHEDULER != true)");
    return () => undefined;
  }

  console.log(`[scheduler] in-process cron enabled for ${INSTANCE_ID}; keep it enabled on exactly one replica.`);

  const jobs: Array<ReturnType<typeof cronSchedule>> = [];
  for (const task of tasks) {
    statusFor(task);
    if (!cronValidate(task.cronExpression)) {
      console.error(`[scheduler] invalid cron expression for ${task.name}: ${task.cronExpression}`);
      continue;
    }
    const job = cronSchedule(
      task.cronExpression,
      () => {
        void runScheduledTask(task);
      },
      { timezone: "UTC" }
    );
    jobs.push(job);
    console.log(`[scheduler] registered ${task.name} @ ${task.cronExpression} UTC`);
  }

  return () => {
    jobs.forEach(job => job.stop());
    console.log("[scheduler] stopped all in-process jobs");
  };
}

/**
 * Expose a lightweight status route so operators can confirm the in-process
 * scheduler is alive. Registered only when the scheduler is enabled.
 */
export function registerSchedulerStatus(app: Express, tasks: ScheduledTask[]) {
  app.get("/api/scheduled/status", (_req, res) => {
    const enabled = process.env.ENABLE_INPROCESS_SCHEDULER === "true";
    res.json({
      enabled,
      instanceId: INSTANCE_ID,
      scope: "process",
      note: enabled
        ? "This cron only runs on this instance. If you run replicas, keep ENABLE_INPROCESS_SCHEDULER=true on exactly one of them."
        : null,
      tasks: tasks.map(task => ({
        name: task.name,
        cron: task.cronExpression,
        runtime: statusFor(task),
      })),
    });
  });
}
