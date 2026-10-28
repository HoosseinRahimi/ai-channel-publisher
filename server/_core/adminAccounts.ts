import { randomUUID } from "crypto";
import { and, eq, ne } from "drizzle-orm";
import { createPasswordHash } from "@shared/password";
import { users } from "../../drizzle/schema";
import { requireDb } from "../db";
import { isAdminRole, type AdminRole } from "./adminAuth";
import { ENV } from "./env";

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;

export type AdminAccountInput = { username: string; name: string; password: string; role: AdminRole };
export type AdminAccountPatch = { name?: string; password?: string; role?: AdminRole; isActive?: boolean };

export function validateUsername(value: string) {
  const username = value.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) throw new Error("Username must be 3-64 characters using lowercase letters, digits, dot, dash or underscore.");
  if (username === ENV.adminUsername.trim().toLowerCase()) throw new Error("That username is reserved by the environment owner account.");
  return username;
}

function validateDisplayName(value: string) {
  const name = value.trim();
  if (name.length < 2 || name.length > 120) throw new Error("Display name must be between 2 and 120 characters.");
  return name;
}

export async function listAdminAccounts() {
  const db = await requireDb();
  const rows = await db
    .select({
      id: users.id,
      openId: users.openId,
      username: users.username,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
      lastSignedIn: users.lastSignedIn,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.role, users.username);
  return rows.map(row => ({ ...row, isEnvOwner: row.openId === ENV.adminUserId }));
}

export async function createAdminAccount(input: AdminAccountInput) {
  const db = await requireDb();
  const username = validateUsername(input.username);
  const name = validateDisplayName(input.name);
  if (!isAdminRole(input.role)) throw new Error("Unsupported role.");
  const existing = (await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1))[0];
  if (existing) throw new Error("An account with that username already exists.");
  const passwordHash = await createPasswordHash(input.password);
  const inserted = await db.insert(users).values({
    openId: `acct-${randomUUID()}`,
    username,
    passwordHash,
    name,
    loginMethod: "password",
    role: input.role,
    isActive: true,
  });
  return { id: Number(inserted[0].insertId) };
}

export async function updateAdminAccount(id: number, patch: AdminAccountPatch, actor: { openId: string }) {
  const db = await requireDb();
  const target = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  if (!target) throw new Error("Account not found.");
  if (target.openId === ENV.adminUserId) throw new Error("The environment owner account cannot be modified from the dashboard.");
  if (target.openId === actor.openId && (patch.role !== undefined || patch.isActive !== undefined)) {
    throw new Error("You cannot change your own role or access.");
  }
  if (patch.role !== undefined && !isAdminRole(patch.role)) throw new Error("Unsupported role.");

  const update: { name?: string; passwordHash?: string; role?: AdminRole; isActive?: boolean } = {};
  if (patch.name !== undefined) update.name = validateDisplayName(patch.name);
  if (patch.password !== undefined) update.passwordHash = await createPasswordHash(patch.password);
  if (patch.role !== undefined) update.role = patch.role;
  if (patch.isActive !== undefined) update.isActive = patch.isActive;

  const losesOwner = target.role === "owner" && target.isActive
    && ((patch.role !== undefined && patch.role !== "owner") || patch.isActive === false);
  if (losesOwner) {
    const remainingOwners = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "owner"), eq(users.isActive, true), ne(users.id, id)));
    if (!remainingOwners.length) throw new Error("At least one active owner must remain.");
  }

  if (!Object.keys(update).length) return { id };
  await db.update(users).set(update).where(eq(users.id, id));
  return { id };
}
