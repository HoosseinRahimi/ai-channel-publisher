import { COOKIE_NAME, SESSION_MAX_AGE_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { getAdminIdentity, toPublicUser, verifyAdminCredentials } from "./_core/adminAuth";
import { createAdminAccount, listAdminAccounts, updateAdminAccount } from "./_core/adminAccounts";
import { listAuditEvents, recordAuditEvent, sanitizeAuditDetail } from "./_core/auditLog";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, editorProcedure, ownerProcedure, publicProcedure, router } from "./_core/trpc";
import { chatWithEditorModel, configureTelegramEngagementWebhook, createPublisherSource, createTelegramRecipientLink, deleteAnalyticsPreset, deliverLatestWeeklyReportToOwner, discardDraft, editDraft, generateDraftForReview, generateWeeklyPerformanceReport, getLlmSettingsStatus, getPostHistory, getPublisherAnalytics, getPublisherDashboard, getSourcePerformanceAnalysis, getWeeklyReport, isTelegramEngagementConfigured, isValidTelegramTokenConfigured, listAnalyticsPresets, listAvailableModels, listDeliveryUnknownPosts, listSourceAlertConfigs, listWeeklyReports, publishDraft, reconcileDelivery, saveAnalyticsPreset, setDraftHeld, setEngagementAlertSchedule, setPublisherEnabled, setPublisherSchedules, setPublisherSourceActive, setWeeklyReportSchedule, testLlmConnection, updateEditorialPreferences, updateGeneralSettings, updateLlmSettings, updatePublisherSource, upsertSourceAlertConfig, verifyTelegramChannelAccess } from "./publisher";
import * as db from "./db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { clearLoginFailures, isLoginAllowed, loginRateLimitKey, recordLoginFailure } from "./_core/loginRateLimit";

const roleInput = z.enum(["owner", "editor", "viewer"]);

/** Parses a yyyy-mm-dd filter into a UTC boundary; invalid input is ignored. */
function parseDay(value: string | undefined, endOfDay = false) {
  if (!value) return undefined;
  const parsed = new Date(`${value}${endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z"}`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => (opts.ctx.user ? toPublicUser(opts.ctx.user) : null)),
    login: publicProcedure.input(z.object({ username: z.string().min(1).max(120), password: z.string().min(12).max(256) })).mutation(async ({ ctx, input }) => {
      const rateLimitKey = loginRateLimitKey(ctx.req.ip, input.username);
      if (!isLoginAllowed(rateLimitKey)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many failed login attempts. Try again later." });
      const verified = await verifyAdminCredentials(input.username, input.password);
      if (!verified) {
        recordLoginFailure(rateLimitKey);
        await recordAuditEvent({
          actorName: input.username.trim().slice(0, 160),
          action: "auth.login",
          outcome: "failure",
          detail: sanitizeAuditDetail({ username: input.username, reason: "invalid_credentials" }),
          ipAddress: ctx.req.ip ?? null,
        });
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or password." });
      }
      clearLoginFailures(rateLimitKey);
      const now = new Date();
      if (verified.openId === ENV.adminUserId) await db.upsertUser({ ...getAdminIdentity(), lastSignedIn: now });
      else await db.upsertUser({ openId: verified.openId, lastSignedIn: now });
      const user = await db.getUserByOpenId(verified.openId);
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not load the admin account." });
      if (!user.isActive) throw new TRPCError({ code: "UNAUTHORIZED", message: "This account is disabled." });
      const token = await sdk.createSessionToken(user.openId, { name: user.name ?? "Administrator", expiresInMs: SESSION_MAX_AGE_MS });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: SESSION_MAX_AGE_MS });
      await recordAuditEvent({
        actorOpenId: user.openId,
        actorName: user.name,
        actorRole: user.role,
        action: "auth.login",
        outcome: "success",
        ipAddress: ctx.req.ip ?? null,
      });
      return toPublicUser(user);
    }),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      if (ctx.user) {
        await recordAuditEvent({
          actorOpenId: ctx.user.openId,
          actorName: ctx.user.name,
          actorRole: ctx.user.role,
          action: "auth.logout",
          outcome: "success",
          ipAddress: ctx.req.ip ?? null,
        });
      }
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  admin: router({
    accounts: ownerProcedure.query(() => listAdminAccounts()),
    createAccount: ownerProcedure.input(z.object({
      username: z.string().min(3).max(64),
      name: z.string().min(2).max(120),
      password: z.string().min(12).max(256),
      role: roleInput,
    })).mutation(({ input }) => createAdminAccount(input)),
    updateAccount: ownerProcedure.input(z.object({
      id: z.number().int().positive(),
      name: z.string().min(2).max(120).optional(),
      password: z.string().min(12).max(256).optional(),
      role: roleInput.optional(),
      isActive: z.boolean().optional(),
    })).mutation(({ ctx, input }) => {
      const { id, ...patch } = input;
      return updateAdminAccount(id, patch, { openId: ctx.user.openId });
    }),
    audit: ownerProcedure.input(z.object({
      actor: z.string().max(160).optional(),
      action: z.string().max(120).optional(),
      outcome: z.enum(["success", "failure"]).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      page: z.number().int().min(1).max(10_000).optional(),
      pageSize: z.number().int().min(10).max(100).optional(),
    }).optional()).query(({ input }) => listAuditEvents({
      actor: input?.actor?.trim() || undefined,
      action: input?.action?.trim() || undefined,
      outcome: input?.outcome,
      from: parseDay(input?.from),
      to: parseDay(input?.to, true),
      page: input?.page,
      pageSize: input?.pageSize,
    })),
  }),
  publisher: router({
    dashboard: adminProcedure.query(() => getPublisherDashboard()),
    analytics: adminProcedure.query(() => getPublisherAnalytics()),
    sourcePerformance: adminProcedure.input(z.object({ sourceName: z.string().min(1).max(160).optional(), from: z.string().optional(), to: z.string().optional() }).optional()).query(({ input }) => getSourcePerformanceAnalysis(input)),
    analyticsPresets: adminProcedure.query(({ ctx }) => listAnalyticsPresets(ctx.user.openId)),
    saveAnalyticsPreset: editorProcedure.input(z.object({ name: z.string().min(2).max(80), sourceName: z.string().min(1).max(160).optional(), from: z.string().optional(), to: z.string().optional() })).mutation(({ ctx, input }) => saveAnalyticsPreset(ctx.user.openId, input)),
    deleteAnalyticsPreset: editorProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => deleteAnalyticsPreset(ctx.user.openId, input.id)),
    weeklyReports: adminProcedure.query(() => listWeeklyReports()),
    weeklyReport: adminProcedure.input(z.object({ id: z.number().int().positive() })).query(({ input }) => getWeeklyReport(input.id)),
    generateWeeklyReport: editorProcedure.mutation(() => generateWeeklyPerformanceReport()),
    deliverLatestWeeklyReport: editorProcedure.mutation(() => deliverLatestWeeklyReportToOwner()),
    engagementStatus: adminProcedure.query(() => ({ configured: isTelegramEngagementConfigured() })),
    sourceAlertConfigs: adminProcedure.query(() => listSourceAlertConfigs()),
    upsertSourceAlertConfig: editorProcedure.input(z.object({ sourceName: z.string().min(2).max(160), isEnabled: z.boolean(), lowEngagementRateBps: z.number().int().min(1).max(5000) })).mutation(({ input }) => upsertSourceAlertConfig(input)),
    recipientStatus: adminProcedure.query(async () => {
      const dashboard = await getPublisherDashboard();
      return { connected: Boolean(dashboard.settings.reportRecipientChatId), weeklyDeliveryEnabled: dashboard.settings.weeklyReportDeliveryEnabled };
    }),
    createRecipientLink: ownerProcedure.mutation(() => createTelegramRecipientLink()),
    history: adminProcedure.input(z.object({
      sourceName: z.string().min(1).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }).optional()).query(({ input }) => getPostHistory({
      sourceName: input?.sourceName,
      from: parseDay(input?.from),
      to: parseDay(input?.to, true),
    })),
    tokenStatus: adminProcedure.query(() => ({ configured: isValidTelegramTokenConfigured() })),
    generateDraft: editorProcedure.mutation(async () => {
      if (!isValidTelegramTokenConfigured()) {
        throw new Error("Configure the Telegram bot token in the project secrets before generating a draft.");
      }
      return generateDraftForReview({ isManual: true });
    }),
    publishDraft: editorProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input }) => publishDraft(input.id)),
    deliveryUnknown: adminProcedure.query(() => listDeliveryUnknownPosts()),
    reconcileDelivery: editorProcedure.input(z.object({ id: z.number().int().positive(), delivered: z.boolean(), telegramMessageId: z.string().max(64).optional() })).mutation(({ input }) => reconcileDelivery(input.id, input)),
    updateDraft: editorProcedure.input(z.object({ id: z.number().int().positive(), content: z.string().min(30).max(4000) })).mutation(({ input }) => editDraft(input.id, input.content)),
    setDraftHeld: editorProcedure.input(z.object({ id: z.number().int().positive(), held: z.boolean() })).mutation(({ input }) => setDraftHeld(input.id, input.held)),
    discardDraft: editorProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input }) => discardDraft(input.id)),
    publishNow: editorProcedure.mutation(async () => {
      if (!isValidTelegramTokenConfigured()) throw new Error("Configure the Telegram bot token in the project secrets before publishing.");
      const draft = await generateDraftForReview({ isManual: true, scheduledFor: new Date() });
      if (draft.status !== "draft") throw new Error(draft.reason);
      return publishDraft(draft.postId);
    }),
    enableSchedule: ownerProcedure.mutation(async () => {
      if (!isValidTelegramTokenConfigured()) {
        throw new Error("Configure the Telegram bot token in the project secrets before activating automation.");
      }
      await verifyTelegramChannelAccess();
      const taskUid = "local-publisher-schedule";
      const draftTaskUid = "local-draft-schedule";
      await setPublisherSchedules(taskUid, draftTaskUid, null);
      return { taskUid, draftTaskUid, nextExecutionAt: null };
    }),
    pauseSchedule: ownerProcedure.mutation(async () => {
      const dashboard = await getPublisherDashboard();
      if (!dashboard.settings.isEnabled) return { paused: true, nextExecutionAt: null };
      await setPublisherEnabled(false, null);
      return { paused: true, nextExecutionAt: null };
    }),
    enableWeeklyReports: ownerProcedure.mutation(async () => {
      const taskUid = "local-weekly-report-schedule";
      await setWeeklyReportSchedule(taskUid, null);
      return { taskUid, nextExecutionAt: null };
    }),
    enableEngagementAlerts: ownerProcedure.input(z.object({ thresholdBps: z.number().int().min(1).max(5000) })).mutation(async ({ input }) => {
      const dashboard = await getPublisherDashboard();
      if (!dashboard.settings.reportRecipientChatId) throw new Error("Connect your Telegram account first to receive reports and alerts.");
      if (!dashboard.settings.engagementWebhookEnabled) throw new Error("Enable Telegram reaction tracking first.");
      const taskUid = "local-engagement-alerts-schedule";
      await setEngagementAlertSchedule(taskUid, input.thresholdBps, null);
      return { taskUid, nextExecutionAt: null };
    }),
    enableTelegramEngagement: ownerProcedure.mutation(async () => {
      const configuredBaseUrl = process.env.PUBLIC_BASE_URL?.trim();
      if (!configuredBaseUrl) throw new Error("Set PUBLIC_BASE_URL to the deployed HTTPS origin before registering the webhook.");
      let url: URL;
      try { url = new URL(configuredBaseUrl); } catch { throw new Error("PUBLIC_BASE_URL must be a valid HTTPS URL."); }
      if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) throw new Error("PUBLIC_BASE_URL must be an origin such as https://publisher.example.com.");
      return configureTelegramEngagementWebhook(url.origin);
    }),
    createSource: editorProcedure.input(z.object({
      name: z.string().min(2).max(160),
      homepage: z.string().min(8).max(2048),
      feedUrl: z.string().max(2048).optional().nullable(),
      sourceKind: z.enum(["primary", "third_party"]),
      isActive: z.boolean().optional(),
    })).mutation(({ input }) => createPublisherSource(input)),
    updateSource: editorProcedure.input(z.object({
      id: z.number().int().positive(),
      name: z.string().min(2).max(160),
      homepage: z.string().min(8).max(2048),
      feedUrl: z.string().max(2048).optional().nullable(),
      sourceKind: z.enum(["primary", "third_party"]),
      isActive: z.boolean().optional(),
    })).mutation(({ input }) => updatePublisherSource(input.id, input)),
    setSourceActive: editorProcedure.input(z.object({ id: z.number().int().positive(), active: z.boolean() })).mutation(({ input }) => setPublisherSourceActive(input.id, input.active)),
    updateEditorialPreferences: editorProcedure.input(z.object({
      editorialGuidance: z.string().max(2000).optional().nullable(),
      nextPostToneFeedback: z.string().max(2000).optional().nullable(),
    })).mutation(({ input }) => updateEditorialPreferences(input)),
    updateGeneralSettings: ownerProcedure.input(z.object({
      channelHandle: z.string().min(2).max(128).optional(),
      appName: z.string().max(80).optional().nullable(),
      postSignature: z.string().max(160).optional().nullable(),
      postLanguage: z.enum(["fa", "en", "de", "custom"]).optional(),
    })).mutation(({ input }) => updateGeneralSettings(input)),
    llmStatus: adminProcedure.query(() => getLlmSettingsStatus()),
    updateLlmSettings: ownerProcedure.input(z.object({
      baseUrl: z.string().max(2048).optional().nullable(),
      model: z.string().max(160).optional().nullable(),
      apiKey: z.string().max(512).optional().nullable(),
    })).mutation(({ input }) => updateLlmSettings(input)),
    listModels: adminProcedure.query(() => listAvailableModels()),
    testLlm: ownerProcedure.mutation(() => testLlmConnection()),
    editorChat: editorProcedure.input(z.object({
      messages: z.array(z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      })).min(1).max(40),
    })).mutation(({ input }) => chatWithEditorModel(input.messages)),
  }),
});

export type AppRouter = typeof appRouter;
