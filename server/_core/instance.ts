import os from "node:os";

/**
 * Identity for this process. Health and scheduler responses include it so
 * operators can tell replicas apart; set INSTANCE_ID to a stable value when
 * running more than one.
 */
export const INSTANCE_ID =
  process.env.INSTANCE_ID?.trim() || `${os.hostname()}:${process.pid}`;
export const PROCESS_STARTED_AT = new Date().toISOString();
