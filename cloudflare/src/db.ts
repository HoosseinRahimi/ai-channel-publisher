import { eq } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import type { D1Database } from "@cloudflare/workers-types";
import { users, type InsertUser } from "./schema";
import { ENV } from "./_core/env";

let _db: DrizzleD1Database<Record<string, never>> | null = null;
let _boundDb: D1Database | null = null;

/**
 * Extract the auto-increment id from a D1 insert/update result. Cloudflare D1
 * (WASM) reports the last inserted row id on `meta.last_row_id` (the SQLite
 * `last_insert_rowid()`), which differs from the MySQL `[0].insertId` shape the
 * original server layer used. Kept as a loose number | undefined so callers
 * that treat the column as `integer primary key` can `Number(...)` it safely.
 */
export function getLastInsertId(result: unknown): number | undefined {
  const meta = (result as { meta?: { last_row_id?: number } })?.meta;
  return typeof meta?.last_row_id === "number" ? meta.last_row_id : undefined;
}

/**
 * Number of rows affected/matched by a D1 update/delete. D1 reports this on
 * `meta.changes`; the MySQL layer used `[0].affectedRows`. Used to detect
 * "no matching row" so the publisher can keep its per-action error messages.
 */
export function getChangedRows(result: unknown): number {
  const meta = (result as { meta?: { changes?: number } })?.meta;
  return typeof meta?.changes === "number" ? meta.changes : 0;
}


/**
 * Point the module at the D1 binding for this request/cluster. Call this once
 * per Worker invocation (from the fetch/scheduled handler) before any service
 * code touches the DB.
 */
export function bindD1(db: D1Database): void {
  _boundDb = db;
  _db = null;
}

/**
 * Lazy drizzle handle over the D1 binding. Returns `null` (never throws) when
 * no binding has been installed, preserving the same "graceful without a DB"
 * behavior the MySQL `server/db.ts` has.
 */
export async function getDb(): Promise<DrizzleD1Database<Record<string, never>> | null> {
  if (!_db && _boundDb) {
    _db = drizzle(_boundDb);
  }
  return _db;
}

/**
 * SQLite (D1) version of `upsertUser`. D1 has no `ON DUPLICATE KEY UPDATE`
 * (MySQL syntax), so we do a select-then-insert/update.
 */
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.openId, user.openId))
      .limit(1);

    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Partial<typeof users.$inferInsert> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.adminUserId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }
    updateSet.updatedAt = new Date();

    if (existing.length > 0) {
      await db.update(users).set(updateSet).where(eq(users.openId, user.openId));
    } else {
      await db.insert(users).values(values);
    }
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

/** Ensure the singleton settings/sources rows exist (D1 analog of seed defaults). */
export async function ensureDbSeeded(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const { publisherSettings, publisherSources } = await import("./schema");
  const count = await db.select().from(publisherSettings).limit(1);
  if (count.length === 0) {
    await db.insert(publisherSettings).values({ channelHandle: "@VerborgeneSchicht" });
  }
  const src = await db.select().from(publisherSources).limit(1);
  if (src.length === 0) {
    await db
      .insert(publisherSources)
      .values([
        { name: "TechCrunch", homepage: "https://techcrunch.com", feedUrl: "https://techcrunch.com/feed/", sourceKind: "third_party" },
        { name: "OpenAI", homepage: "https://openai.com", feedUrl: "https://openai.com/blog/rss.xml", sourceKind: "primary" },
      ]);
  }
}
