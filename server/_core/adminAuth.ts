import { eq } from "drizzle-orm";
import { verifyPassword } from "@shared/password";
import type { InsertUser, User } from "../../drizzle/schema";
import { users } from "../../drizzle/schema";
import { getDb } from "../db";
import { ENV } from "./env";

export const ADMIN_ROLES = ["owner", "editor", "viewer"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}

/** The environment-configured owner. It always exists and can never be demoted or disabled from the UI. */
export function getAdminIdentity(): InsertUser {
  return {
    openId: ENV.adminUserId,
    username: ENV.adminUsername.trim().toLowerCase(),
    name: ENV.adminDisplayName,
    email: null,
    loginMethod: "password",
    role: "owner",
    isActive: true,
    lastSignedIn: new Date(),
  };
}

/** Drops credential material before a user object is returned to the browser. */
export function toPublicUser(user: User) {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

async function findAccountByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.username, username)).limit(1))[0];
}

/**
 * Verifies the environment owner first, then any DB-provisioned admin account.
 * The env username is reserved: a database account can never shadow it.
 */
export async function verifyAdminCredentials(username: string, password: string): Promise<User | InsertUser | null> {
  const normalized = username.trim().toLowerCase();
  if (!normalized) return null;

  if (normalized === ENV.adminUsername.trim().toLowerCase()) {
    return ENV.adminPasswordHash && (await verifyPassword(password, ENV.adminPasswordHash)) ? getAdminIdentity() : null;
  }

  const account = await findAccountByUsername(normalized);
  if (!account?.passwordHash || !account.isActive || !isAdminRole(account.role)) return null;
  return (await verifyPassword(password, account.passwordHash)) ? account : null;
}
