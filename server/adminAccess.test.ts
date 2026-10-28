import { describe, expect, it } from "vitest";
import type { User } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { toPublicUser } from "./_core/adminAuth";
import { validateUsername } from "./_core/adminAccounts";
import { sanitizeAuditDetail } from "./_core/auditLog";
import { ENV } from "./_core/env";
import { appRouter } from "./routers";

function userWithRole(role: User["role"]): User {
  return {
    id: 1,
    openId: `acct-${role}`,
    username: role,
    passwordHash: "pbkdf2$100000$c2FsdA==$aGFzaA==",
    name: `${role} user`,
    email: null,
    loginMethod: "password",
    role,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

function contextFor(role: User["role"] | null): TrpcContext {
  return {
    user: role ? userWithRole(role) : null,
    req: { protocol: "https", headers: {}, ip: "127.0.0.1" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("role-gated procedures", () => {
  it("rejects viewers from mutating drafts", async () => {
    const caller = appRouter.createCaller(contextFor("viewer"));
    await expect(caller.publisher.updateDraft({ id: 1, content: "x".repeat(40) })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects viewers from publishing", async () => {
    const caller = appRouter.createCaller(contextFor("viewer"));
    await expect(caller.publisher.publishNow()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects editors from owner-only infrastructure changes", async () => {
    const caller = appRouter.createCaller(contextFor("editor"));
    await expect(caller.publisher.updateLlmSettings({ model: "other" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.publisher.enableSchedule()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.publisher.createRecipientLink()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects editors from the audit log and account management", async () => {
    const caller = appRouter.createCaller(contextFor("editor"));
    await expect(caller.admin.audit()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.admin.accounts()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects unauthenticated callers", async () => {
    const caller = appRouter.createCaller(contextFor(null));
    await expect(caller.publisher.generateDraft()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("toPublicUser", () => {
  it("strips the password hash from the session payload", () => {
    const safe = toPublicUser(userWithRole("editor"));
    expect(safe).not.toHaveProperty("passwordHash");
    expect(safe.openId).toBe("acct-editor");
  });

  it("never exposes the hash through auth.me", async () => {
    const caller = appRouter.createCaller(contextFor("owner"));
    const me = await caller.auth.me();
    expect(me).not.toBeNull();
    expect(me).not.toHaveProperty("passwordHash");
  });
});

describe("sanitizeAuditDetail", () => {
  it("redacts credential-like keys at any depth", () => {
    const detail = sanitizeAuditDetail({
      password: "hunter2hunter2",
      apiKey: "sk-live-secret",
      nested: { token: "bot-token", safe: "kept" },
    });
    expect(detail).toContain("[redacted]");
    expect(detail).toContain("kept");
    expect(detail).not.toContain("hunter2hunter2");
    expect(detail).not.toContain("sk-live-secret");
    expect(detail).not.toContain("bot-token");
  });

  it("caps long payloads and arrays", () => {
    const detail = sanitizeAuditDetail({ items: Array.from({ length: 40 }, (_, index) => index) }, 60);
    expect(detail?.length).toBeLessThanOrEqual(61);
    expect(detail?.endsWith("…")).toBe(true);
    expect(sanitizeAuditDetail({ items: Array.from({ length: 40 }, (_, index) => index) })).toContain("19");
    expect(sanitizeAuditDetail({ items: Array.from({ length: 40 }, (_, index) => index) })).not.toContain("20");
  });

  it("returns null for empty detail", () => {
    expect(sanitizeAuditDetail(undefined)).toBeNull();
    expect(sanitizeAuditDetail(null)).toBeNull();
  });
});

describe("validateUsername", () => {
  it("normalizes casing and accepts valid usernames", () => {
    expect(validateUsername("  Editor.One ")).toBe("editor.one");
    expect(validateUsername("ops_2")).toBe("ops_2");
  });

  it("rejects reserved and malformed usernames", () => {
    expect(() => validateUsername(ENV.adminUsername)).toThrow(/reserved/);
    expect(() => validateUsername("ab")).toThrow(/Username/);
    expect(() => validateUsername("bad name!")).toThrow(/Username/);
    expect(() => validateUsername("-leading")).toThrow(/Username/);
  });
});
