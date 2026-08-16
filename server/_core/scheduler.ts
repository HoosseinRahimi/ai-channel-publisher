import { schedule as cronSchedule, validate as cronValidate } from "node-cron";
import type { Express } from "express";

export type ScheduledTask = {
  /** Stable identifier used for logs and idempotency. */
  name: string;
  /** 6-field cron (seconds minutes hours day-of-month month day-of-week), UTC. */
  cronExpression: string;
  /** Local method called in-process. */
  run: () => Promise<unknown>;
};

/**
 * In-process cron scheduler for the self-hosted Node deployment. Enable it with
 * `ENABLE_INPROCESS_SCHEDULER=true`; each task calls the publisher service
 * directly and remains idempotent through the existing run-key guard.
 */
export function startInProcessScheduler(tasks: ScheduledTask[]): () => void {
  if (process.env.ENABLE_INPROCESS_SCHEDULER !== "true") {
    console.log("[scheduler] in-process scheduler disabled (ENABLE_INPROCESS_SCHEDULER != true)");
    return () => undefined;
  }

  const jobs: Array<ReturnType<typeof cronSchedule>> = [];
  for (const task of tasks) {
    if (!cronValidate(task.cronExpression)) {
      console.error(`[scheduler] invalid cron expression for ${task.name}: ${task.cronExpression}`);
      continue;
    }
    const job = cronSchedule(
      task.cronExpression,
      () => {
        task.run().catch(error => {
          console.error(`[scheduler] task ${task.name} failed:`, error);
        });
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
    res.json({
      enabled: process.env.ENABLE_INPROCESS_SCHEDULER === "true",
      tasks: tasks.map(task => ({
        name: task.name,
        cron: task.cronExpression,
      })),
    });
  });
}
