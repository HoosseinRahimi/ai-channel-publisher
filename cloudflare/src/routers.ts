import { COOKIE_NAME, SESSION_MAX_AGE_MS } from "./shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { getAdminIdentity, verifyAdminCredentials } from "./_core/adminAuth";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { configureTelegramEngagementWebhook, createPublisherSource, createTelegramRecipientLink, DRAFT_CRON, deleteAnalyticsPreset, deliverLatestWeeklyReportToOwner, discardDraft, editDraft, ENGAGEMENT_ALERT_CRON, generateDraftForReview, generateWeeklyPerformanceReport, getPostHistory, getPublisherAnalytics, getPublisherDashboard, getSourcePerformanceAnalysis, getWeeklyReport, isTelegramEngagementConfigured, isValidTelegramTokenConfigured, listAnalyticsPresets, listDeliveryUnknownPosts, listSourceAlertConfigs, listWeeklyReports, PUBLISH_CRON, publishDraft, reconcileDelivery, saveAnalyticsPreset, setDraftHeld, setEngagementAlertSchedule, setPublisherEnabled, setPublisherSchedules, setPublisherSourceActive, setWeeklyReportSchedule, updateEditorialPreferences, updatePublisherSource, upsertSourceAlertConfig, verifyTelegramChannelAccess, WEEKLY_REPORT_CRON } from "./publisher";
import * as db from "./db";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { clearLoginFailures, isLoginAllowed, loginRateLimitKey, recordLoginFailure } from "./_core/loginRateLimit";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    login: publicProcedure.input(z.object({ username: z.string().min(1).max(120), password: z.string().min(12).max(256) })).mutation(async ({ ctx, input }) => {
      const rateLimitKey = loginRateLimitKey(ctx.req.headers["cf-connecting-ip"] ?? ctx.req.headers["x-forwarded-for"], input.username);
      if (!isLoginAllowed(rateLimitKey)) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "تعداد تلاش‌های ناموفق زیاد است؛ بعداً دوباره امتحان کنید." });
      if (!(await verifyAdminCredentials(input.username, input.password))) {
        recordLoginFailure(rateLimitKey);
        throw new TRPCError({ code: "UNAUTHORIZED", message: "نام کاربری یا گذرواژه نادرست است." });
      }
      clearLoginFailures(rateLimitKey);
      const identity = getAdminIdentity();
      await db.upsertUser(identity);
      const user = await db.getUserByOpenId(identity.openId);
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "ایجاد حساب مدیر انجام نشد." });
      const token = await sdk.createSessionToken(identity.openId, { name: identity.name ?? "Administrator", expiresInMs: SESSION_MAX_AGE_MS });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: SESSION_MAX_AGE_MS });
      return user;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  publisher: router({
    dashboard: adminProcedure.query(() => getPublisherDashboard()),
    analytics: adminProcedure.query(() => getPublisherAnalytics()),
    sourcePerformance: adminProcedure.input(z.object({ sourceName: z.string().min(1).max(160).optional(), from: z.string().optional(), to: z.string().optional() }).optional()).query(({ input }) => getSourcePerformanceAnalysis(input)),
    analyticsPresets: adminProcedure.query(({ ctx }) => listAnalyticsPresets(ctx.user.openId)),
    saveAnalyticsPreset: adminProcedure.input(z.object({ name: z.string().min(2).max(80), sourceName: z.string().min(1).max(160).optional(), from: z.string().optional(), to: z.string().optional() })).mutation(({ ctx, input }) => saveAnalyticsPreset(ctx.user.openId, input)),
    deleteAnalyticsPreset: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => deleteAnalyticsPreset(ctx.user.openId, input.id)),
    weeklyReports: adminProcedure.query(() => listWeeklyReports()),
    weeklyReport: adminProcedure.input(z.object({ id: z.number().int().positive() })).query(({ input }) => getWeeklyReport(input.id)),
    generateWeeklyReport: adminProcedure.mutation(() => generateWeeklyPerformanceReport()),
    deliverLatestWeeklyReport: adminProcedure.mutation(() => deliverLatestWeeklyReportToOwner()),
    engagementStatus: adminProcedure.query(() => ({ configured: isTelegramEngagementConfigured() })),
    sourceAlertConfigs: adminProcedure.query(() => listSourceAlertConfigs()),
    upsertSourceAlertConfig: adminProcedure.input(z.object({ sourceName: z.string().min(2).max(160), isEnabled: z.boolean(), lowEngagementRateBps: z.number().int().min(1).max(5000) })).mutation(({ input }) => upsertSourceAlertConfig(input)),
    recipientStatus: adminProcedure.query(async () => {
      const dashboard = await getPublisherDashboard();
      return { connected: Boolean(dashboard.settings.reportRecipientChatId), weeklyDeliveryEnabled: dashboard.settings.weeklyReportDeliveryEnabled };
    }),
    createRecipientLink: adminProcedure.mutation(() => createTelegramRecipientLink()),
    history: adminProcedure.input(z.object({
      sourceName: z.string().min(1).optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }).optional()).query(({ input }) => getPostHistory({
      sourceName: input?.sourceName,
      from: input?.from ? new Date(`${input.from}T00:00:00.000Z`) : undefined,
      to: input?.to ? new Date(`${input.to}T23:59:59.999Z`) : undefined,
    })),
    tokenStatus: adminProcedure.query(() => ({ configured: isValidTelegramTokenConfigured() })),
    generateDraft: adminProcedure.mutation(async () => {
      if (!isValidTelegramTokenConfigured()) {
        throw new Error("Configure the Telegram bot token in the project secrets before generating a draft.");
      }
      return generateDraftForReview({ isManual: true });
    }),
    publishDraft: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input }) => publishDraft(input.id)),
    deliveryUnknown: adminProcedure.query(() => listDeliveryUnknownPosts()),
    reconcileDelivery: adminProcedure.input(z.object({ id: z.number().int().positive(), delivered: z.boolean(), telegramMessageId: z.string().max(64).optional() })).mutation(({ input }) => reconcileDelivery(input.id, input)),
    updateDraft: adminProcedure.input(z.object({ id: z.number().int().positive(), content: z.string().min(30).max(4000) })).mutation(({ input }) => editDraft(input.id, input.content)),
    setDraftHeld: adminProcedure.input(z.object({ id: z.number().int().positive(), held: z.boolean() })).mutation(({ input }) => setDraftHeld(input.id, input.held)),
    discardDraft: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ input }) => discardDraft(input.id)),
    publishNow: adminProcedure.mutation(async () => {
      if (!isValidTelegramTokenConfigured()) throw new Error("Configure the Telegram bot token in the project secrets before publishing.");
      const draft = await generateDraftForReview({ isManual: true, scheduledFor: new Date() });
      if (draft.status !== "draft") throw new Error(draft.reason);
      return publishDraft(draft.postId);
    }),
    enableSchedule: adminProcedure.mutation(async () => {
      if (!isValidTelegramTokenConfigured()) {
        throw new Error("Configure the Telegram bot token in the project secrets before activating automation.");
      }
      await verifyTelegramChannelAccess();
      const taskUid = "local-publisher-schedule";
      const draftTaskUid = "local-draft-schedule";
      await setPublisherSchedules(taskUid, draftTaskUid, null);
      return { taskUid, draftTaskUid, nextExecutionAt: null };
    }),
    pauseSchedule: adminProcedure.mutation(async () => {
      const dashboard = await getPublisherDashboard();
      if (!dashboard.settings.isEnabled) return { paused: true, nextExecutionAt: null };
      await setPublisherEnabled(false, null);
      return { paused: true, nextExecutionAt: null };
    }),
    enableWeeklyReports: adminProcedure.mutation(async () => {
      const taskUid = "local-weekly-report-schedule";
      await setWeeklyReportSchedule(taskUid, null);
      return { taskUid, nextExecutionAt: null };
    }),
    enableEngagementAlerts: adminProcedure.input(z.object({ thresholdBps: z.number().int().min(1).max(5000) })).mutation(async ({ input }) => {
      const dashboard = await getPublisherDashboard();
      if (!dashboard.settings.reportRecipientChatId) throw new Error("ابتدا حساب تلگرام خود را برای دریافت گزارش و هشدار متصل کنید.");
      if (!dashboard.settings.engagementWebhookEnabled) throw new Error("ابتدا ثبت واکنش‌های تلگرام را فعال کنید.");
      const taskUid = "local-engagement-alerts-schedule";
      await setEngagementAlertSchedule(taskUid, input.thresholdBps, null);
      return { taskUid, nextExecutionAt: null };
    }),
    enableTelegramEngagement: adminProcedure.mutation(async ({ ctx }) => {
      const configuredBaseUrl = process.env.PUBLIC_BASE_URL?.trim();
      if (!configuredBaseUrl) throw new Error("پیش از ثبت وب‌هوک، PUBLIC_BASE_URL را روی مبدأ HTTPS مستقر تنظیم کنید.");
      let url: URL;
      try { url = new URL(configuredBaseUrl); } catch { throw new Error("PUBLIC_BASE_URL باید یک نشانی معتبر HTTPS باشد."); }
      if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) throw new Error("PUBLIC_BASE_URL باید فقط یک مبدأ مانند https://publisher.example.com باشد.");
      return configureTelegramEngagementWebhook(url.origin);
    }),
    createSource: adminProcedure.input(z.object({
      name: z.string().min(2).max(160),
      homepage: z.string().min(8).max(2048),
      feedUrl: z.string().max(2048).optional().nullable(),
      sourceKind: z.enum(["primary", "third_party"]),
      isActive: z.boolean().optional(),
    })).mutation(({ input }) => createPublisherSource(input)),
    updateSource: adminProcedure.input(z.object({
      id: z.number().int().positive(),
      name: z.string().min(2).max(160),
      homepage: z.string().min(8).max(2048),
      feedUrl: z.string().max(2048).optional().nullable(),
      sourceKind: z.enum(["primary", "third_party"]),
      isActive: z.boolean().optional(),
    })).mutation(({ input }) => updatePublisherSource(input.id, input)),
    setSourceActive: adminProcedure.input(z.object({ id: z.number().int().positive(), active: z.boolean() })).mutation(({ input }) => setPublisherSourceActive(input.id, input.active)),
    updateEditorialPreferences: adminProcedure.input(z.object({
      editorialGuidance: z.string().max(2000).optional().nullable(),
      nextPostToneFeedback: z.string().max(2000).optional().nullable(),
    })).mutation(({ input }) => updateEditorialPreferences(input)),
  }),
});

export type AppRouter = typeof appRouter;
