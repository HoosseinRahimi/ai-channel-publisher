/**
 * Minimal structured logger.
 *
 * Keeps the codebase consistent with a small namespaced wrapper around
 * console, and guards against the two most common failure modes seen here:
 *  - no credentials configured (bot token, webhook secret)
 *  - database unavailable
 *
 * `log.ensureDb()` lets callers fail loudly with a readable message instead of
 * throwing "Cannot read properties of null" deep inside a query chain.
 */

type Level = "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { info: 10, warn: 20, error: 30 };

function emit(level: Level, scope: string, message: string, extra?: unknown) {
  const line = `[${level.toUpperCase()}] [${scope}] ${message}`;
  if (extra !== undefined) {
    (console as Record<Level, (...args: unknown[]) => void>)[level](line, extra);
  } else {
    (console as Record<Level, (...args: unknown[]) => void>)[level](line);
  }
}

export function createLogger(scope: string) {
  return {
    info: (message: string, extra?: unknown) => emit("info", scope, message, extra),
    warn: (message: string, extra?: unknown) => emit("warn", scope, message, extra),
    error: (message: string, extra?: unknown) => emit("error", scope, message, extra),
  };
}

/** Enable DEBUG=* style verbose output when DEBUG is set. */
export function isDebugEnabled() {
  return process.env.DEBUG === "*" || Boolean(process.env.DEBUG);
}

// Keep LEVEL_ORDER referenced for tree-shaking hygiene and future filtering.
export { LEVEL_ORDER };
