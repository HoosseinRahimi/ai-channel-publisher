import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { isAdminRole, type AdminRole } from "./adminAuth";
import { recordAuditEvent, sanitizeAuditDetail } from "./auditLog";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

function roleMiddleware(allowed: readonly AdminRole[]) {
  return t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || !isAdminRole(ctx.user.role) || !allowed.includes(ctx.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  });
}

/**
 * Records every mutation that passes through a role-gated procedure, with the
 * actor, outcome, sanitized input and client IP. Audit failures never surface
 * to the caller; recordAuditEvent swallows its own errors.
 */
const auditMutations = t.middleware(async opts => {
  if (opts.type !== "mutation") return opts.next();

  const result = await opts.next();
  const actor = {
    actorOpenId: opts.ctx.user?.openId ?? null,
    actorName: opts.ctx.user?.name ?? null,
    actorRole: opts.ctx.user?.role ?? null,
    action: opts.path,
    ipAddress: opts.ctx.req.ip ?? null,
  };

  if (result.ok) {
    await recordAuditEvent({ ...actor, outcome: "success", detail: sanitizeAuditDetail(opts.input) });
  } else {
    const message = result.error instanceof Error ? result.error.message : String(result.error);
    await recordAuditEvent({ ...actor, outcome: "failure", detail: sanitizeAuditDetail({ input: opts.input, error: message }) });
  }

  return result;
});

/** Any signed-in admin role: read access to the publisher workspace. */
export const adminProcedure = t.procedure.use(roleMiddleware(["owner", "editor", "viewer"]));

/** Content operations: drafts, publishing, sources, editorial guidance. */
export const editorProcedure = t.procedure
  .use(roleMiddleware(["owner", "editor"]))
  .use(auditMutations);

/** Infrastructure and account management: settings, schedules, providers, admins. */
export const ownerProcedure = t.procedure
  .use(roleMiddleware(["owner"]))
  .use(auditMutations);
