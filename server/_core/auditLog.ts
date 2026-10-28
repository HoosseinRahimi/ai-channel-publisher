import { and, desc, eq, gte, like, lte, or, sql, type SQL } from "drizzle-orm";
import { adminAuditLog } from "../../drizzle/schema";
import { requireDb } from "../db";

const SENSITIVE_KEY = /pass(word)?|secret|token|api[-_]?key|hash|authorization|cookie/i;

function likePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, match => `\\${match}`)}%`;
}

/**
 * Serializes procedure input for the audit trail with credentials and other
 * secrets replaced, so an audit row can never become a second copy of a key.
 */
export function sanitizeAuditDetail(value: unknown, maxLength = 2000): string | null {
  if (value === undefined || value === null) return null;
  const seen = new WeakSet<object>();

  const redact = (input: unknown, depth: number): unknown => {
    if (depth > 4) return "[truncated]";
    if (Array.isArray(input)) return input.slice(0, 20).map(item => redact(item, depth + 1));
    if (input && typeof input === "object") {
      if (seen.has(input)) return "[circular]";
      seen.add(input);
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>).map(([key, entry]) => [key, SENSITIVE_KEY.test(key) ? "[redacted]" : redact(entry, depth + 1)])
      );
    }
    return input;
  };

  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(redact(value, 0));
  } catch {
    return null;
  }
  if (serialized === undefined) return null;
  return serialized.length > maxLength ? `${serialized.slice(0, maxLength)}…` : serialized;
}

export type AuditOutcome = "success" | "failure";

export type AuditEvent = {
  actorOpenId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  action: string;
  outcome: AuditOutcome;
  detail?: string | null;
  ipAddress?: string | null;
};

/** Best effort: auditing must never break the operation it describes. */
export async function recordAuditEvent(event: AuditEvent): Promise<void> {
  try {
    const db = await requireDb();
    await db.insert(adminAuditLog).values({
      actorOpenId: event.actorOpenId ?? null,
      actorName: event.actorName ?? null,
      actorRole: event.actorRole ?? null,
      action: event.action.slice(0, 120),
      outcome: event.outcome,
      detail: event.detail ? event.detail.slice(0, 4000) : null,
      ipAddress: event.ipAddress ?? null,
    });
  } catch (error) {
    console.warn("[audit] Failed to record audit event:", error);
  }
}

export type AuditFilters = {
  actor?: string;
  action?: string;
  outcome?: AuditOutcome;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
};

export async function listAuditEvents(filters: AuditFilters = {}) {
  const db = await requireDb();
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const pageSize = Math.min(100, Math.max(10, Math.floor(filters.pageSize ?? 25)));

  const conditions: SQL[] = [];
  if (filters.actor) {
    const pattern = likePattern(filters.actor);
    const actorFilter = or(like(adminAuditLog.actorName, pattern), like(adminAuditLog.actorOpenId, pattern));
    if (actorFilter) conditions.push(actorFilter);
  }
  if (filters.action) conditions.push(like(adminAuditLog.action, likePattern(filters.action)));
  if (filters.outcome) conditions.push(eq(adminAuditLog.outcome, filters.outcome));
  if (filters.from) conditions.push(gte(adminAuditLog.createdAt, filters.from));
  if (filters.to) conditions.push(lte(adminAuditLog.createdAt, filters.to));
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(adminAuditLog)
      .where(where)
      .orderBy(desc(adminAuditLog.createdAt), desc(adminAuditLog.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: sql<number>`count(*)` }).from(adminAuditLog).where(where),
  ]);

  return { rows, total: Number(totals[0]?.total ?? 0), page, pageSize };
}
