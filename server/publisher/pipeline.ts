import { randomUUID } from "crypto";
import { and, desc, eq, gte, lte, or } from "drizzle-orm";
import { invokeLLM, listLLMModels, type Message } from "../_core/llm";
import { decryptSecret, encryptSecret } from "../_core/settingsCrypto";
import { getDb } from "../db";
import {
  publisherPosts,
  publisherEngagementAlerts,
  publisherAnalyticsPresets,
  publisherPostEngagement,
  publisherRuns,
  publisherSettings,
  publisherSourceAlertConfigs,
  publisherSourceEngagementAlerts,
  publisherSources,
  publisherWeeklyReports,
  type PublisherSettings,
  type PublisherSource,
} from "../../drizzle/schema";
import {
  DEFAULT_CHANNEL_HANDLE,
  DEFAULT_SOURCES,
  PUBLISH_CRON,
  buildRunKey,
  calculateEngagementRateBps,
  canAutoPublishDraft,
  extractCandidates,
  hashText,
  isLowEngagement,
  isReviewableDraftStatus,
  matchesDuplicate,
  nextThreeHourBoundary,
  normalizeChannelHandle,
  normalizeEditedDraftContent,
  normalizeEditorialGuidance,
  normalizeEngagementThresholdBps,
  normalizeTopic,
  postSignature,
  renderChannelPost,
  stripMarkup,
  titleFromContent,
  validatePublisherSource,
  type GeneratedPost,
  type NewsCandidate,
  type SourceInput,
  type TelegramReactionUpdate,
  type TelegramWebhookUpdate,
} from "./editorial";
import {
  buildDailySourcePerformanceTrend,
  buildEngagementAnalytics,
  buildPublisherAnalytics,
  buildSourceEngagementComparison,
  buildSourceLowEngagementCandidates,
  buildTelegramRecipientCode,
  buildWeeklyReportDeliveryUpdate,
  buildWeeklyReportMarkdown,
  canDeliverWeeklyReport,
  getCompletedWeekRange,
  getSourceAlertWeekRange,
  isValidTelegramRecipientCode,
  normalizeAnalyticsPresetName,
  normalizeSourcePerformanceFilters,
  selectLatestWeeklyReport,
  summarizeTelegramReactions,
} from "./analytics";
import {
  buildEditorialSystemPrompt,
  buildPostGenerationPrompt,
  isPostLanguage,
  languageName,
  outputMatchesLanguage,
  type PostLanguage,
} from "./languages";
import { resolveLlmConfig } from "./llmConfig";
import {
  dbUpdateEngagementWebhookEnabled,
  deliverToTelegram,
  fetchTelegramChannelAudienceSize,
  sendTelegramMessage,
  verifyTelegramChannelAccess,
} from "./telegram";

export async function ensurePublisherDefaults() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");

  const existingSettings = await db.select().from(publisherSettings).limit(1);
  if (!existingSettings[0]) {
    await db.insert(publisherSettings).values({ channelHandle: process.env.TELEGRAM_CHANNEL_HANDLE?.trim() || DEFAULT_CHANNEL_HANDLE });
  }

  for (const source of DEFAULT_SOURCES) {
    const existing = await db.select({ id: publisherSources.id }).from(publisherSources).where(eq(publisherSources.name, source.name)).limit(1);
    if (!existing[0]) await db.insert(publisherSources).values(source);
  }

  return (await db.select().from(publisherSettings).limit(1))[0] as PublisherSettings;
}

function settingsPostLanguage(settings: PublisherSettings): PostLanguage {
  return isPostLanguage(settings.postLanguage) ? settings.postLanguage : "fa";
}

function renderOptions(settings: PublisherSettings) {
  return {
    language: settingsPostLanguage(settings),
    channelHandle: settings.channelHandle,
    signature: settings.postSignature,
  };
}

export async function getPublisherDashboard() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const settings = await ensurePublisherDefaults();
  const [posts, sources, reviewPosts, llm] = await Promise.all([
    db.select().from(publisherPosts).orderBy(desc(publisherPosts.createdAt)).limit(30),
    db.select().from(publisherSources).orderBy(publisherSources.name),
    db.select().from(publisherPosts).where(or(eq(publisherPosts.deliveryStatus, "draft"), eq(publisherPosts.deliveryStatus, "held"))).orderBy(desc(publisherPosts.createdAt)).limit(4),
    resolveLlmConfig(),
  ]);
  return {
    settings,
    posts,
    sources,
    reviewPosts,
    tokenConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    scheduleExpression: PUBLISH_CRON,
    llm: {
      model: llm.model,
      apiKeyConfigured: llm.apiKeyConfigured,
      baseUrlConfigured: Boolean(llm.baseUrl),
    },
  };
}

export async function getPostHistory(filters: { sourceName?: string; from?: Date; to?: Date } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const conditions = [eq(publisherPosts.deliveryStatus, "delivered")];
  if (filters.sourceName) conditions.push(eq(publisherPosts.sourceName, filters.sourceName));
  if (filters.from) conditions.push(gte(publisherPosts.createdAt, filters.from));
  if (filters.to) conditions.push(lte(publisherPosts.createdAt, filters.to));
  return db.select().from(publisherPosts).where(and(...conditions)).orderBy(desc(publisherPosts.createdAt)).limit(100);
}

export async function getSourcePerformanceAnalysis(input: { sourceName?: string; from?: string; to?: string } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const filters = normalizeSourcePerformanceFilters(input);
  const conditions = [eq(publisherPosts.deliveryStatus, "delivered")];
  if (filters.sourceName) conditions.push(eq(publisherPosts.sourceName, filters.sourceName));
  if (filters.from) conditions.push(gte(publisherPosts.publishedAt, filters.from));
  if (filters.to) conditions.push(lte(publisherPosts.publishedAt, filters.to));
  const [settings, posts, engagement, sources] = await Promise.all([
    ensurePublisherDefaults(),
    db.select({ id: publisherPosts.id, sourceName: publisherPosts.sourceName, deliveryStatus: publisherPosts.deliveryStatus, publishedAt: publisherPosts.publishedAt }).from(publisherPosts).where(and(...conditions)).orderBy(desc(publisherPosts.publishedAt)).limit(500),
    db.select().from(publisherPostEngagement),
    db.select({ name: publisherSources.name }).from(publisherSources).orderBy(publisherSources.name),
  ]);
  return {
    filters: { sourceName: filters.sourceName ?? null, from: filters.from?.toISOString().slice(0, 10) ?? null, to: filters.to?.toISOString().slice(0, 10) ?? null },
    availableSources: sources.map(source => source.name),
    filteredPosts: posts.length,
    sourceComparison: buildSourceEngagementComparison(posts, engagement, settings.lastKnownAudienceSize),
    dailyTrend: buildDailySourcePerformanceTrend(posts, engagement, settings.lastKnownAudienceSize),
  };
}

export async function listAnalyticsPresets(ownerOpenId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  return db.select().from(publisherAnalyticsPresets).where(eq(publisherAnalyticsPresets.ownerOpenId, ownerOpenId)).orderBy(desc(publisherAnalyticsPresets.updatedAt)).limit(30);
}

export async function saveAnalyticsPreset(ownerOpenId: string, input: { name: string; sourceName?: string; from?: string; to?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const name = normalizeAnalyticsPresetName(input.name);
  const filters = normalizeSourcePerformanceFilters(input);
  await db.insert(publisherAnalyticsPresets).values({ ownerOpenId, name, sourceName: filters.sourceName ?? null, dateFrom: filters.from ?? null, dateTo: filters.to ?? null }).onDuplicateKeyUpdate({ set: { sourceName: filters.sourceName ?? null, dateFrom: filters.from ?? null, dateTo: filters.to ?? null, updatedAt: new Date() } });
  return (await db.select().from(publisherAnalyticsPresets).where(and(eq(publisherAnalyticsPresets.ownerOpenId, ownerOpenId), eq(publisherAnalyticsPresets.name, name))).limit(1))[0];
}

export async function deleteAnalyticsPreset(ownerOpenId: string, presetId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.delete(publisherAnalyticsPresets).where(and(eq(publisherAnalyticsPresets.id, presetId), eq(publisherAnalyticsPresets.ownerOpenId, ownerOpenId)));
  return { deleted: true };
}

export async function getPublisherAnalytics() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const [settings, posts, engagement] = await Promise.all([ensurePublisherDefaults(), db.select({
    id: publisherPosts.id,
    title: publisherPosts.title,
    createdAt: publisherPosts.createdAt,
    deliveryStatus: publisherPosts.deliveryStatus,
    sourceName: publisherPosts.sourceName,
    postKind: publisherPosts.postKind,
    publishedAt: publisherPosts.publishedAt,
  }).from(publisherPosts).orderBy(desc(publisherPosts.createdAt)).limit(500), db.select().from(publisherPostEngagement)]);
  const postTitles = new Map(posts.map(post => [post.id, post.title]));
  const audienceSize = settings.lastKnownAudienceSize;
  const topPosts = engagement.map(record => ({
    ...record,
    title: postTitles.get(record.publisherPostId) ?? "Deleted post",
    engagementRateBps: audienceSize ? Math.round((record.reactionCount / audienceSize) * 10000) : null,
  })).sort((a, b) => b.reactionCount - a.reactionCount).slice(0, 10);
  return { ...buildPublisherAnalytics(posts), engagement: {
    ...buildEngagementAnalytics(engagement),
    enabled: settings.engagementWebhookEnabled,
    audienceSize,
    alertEnabled: settings.engagementAlertEnabled,
    thresholdBps: settings.lowEngagementRateBps,
    sourceComparison: buildSourceEngagementComparison(posts, engagement, audienceSize),
    leaderboard: topPosts,
    topPosts,
  } };
}

export async function recordTelegramReactionUpdate(update: TelegramReactionUpdate) {
  const change = update.message_reaction_count;
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const settings = await ensurePublisherDefaults();
  const channelUsername = change?.chat?.username?.toLowerCase();
  if (!change?.message_id || (channelUsername && `@${channelUsername}` !== settings.channelHandle.toLowerCase())) return { tracked: false };
  const telegramMessageId = String(change.message_id);
  const post = (await db.select({ id: publisherPosts.id }).from(publisherPosts).where(eq(publisherPosts.telegramMessageId, telegramMessageId)).limit(1))[0];
  if (!post) return { tracked: false };
  const reactionSummary = summarizeTelegramReactions(change.reactions ?? []);
  const reactionCount = reactionSummary.reduce((total, reaction) => total + reaction.count, 0);
  const changedAt = change.date ? new Date(change.date * 1000) : new Date();
  await db.insert(publisherPostEngagement).values({ publisherPostId: post.id, telegramMessageId, reactionCount, reactionSummary: JSON.stringify(reactionSummary), lastReactionAt: changedAt }).onDuplicateKeyUpdate({ set: { reactionCount, reactionSummary: JSON.stringify(reactionSummary), lastReactionAt: changedAt } });
  await db.update(publisherSettings).set({ engagementLastUpdatedAt: changedAt }).where(eq(publisherSettings.id, settings.id));
  return { tracked: true, postId: post.id, reactionCount };
}

export async function handleTelegramWebhookUpdate(update: TelegramWebhookUpdate) {
  const text = update.message?.text?.trim() ?? "";
  const match = text.match(/^\/start\s+(VS-[A-Z0-9]+)$/i);
  const chatId = update.message?.chat?.id;
  if (match && chatId !== undefined) {
    const recipient = await connectTelegramRecipient(chatId, match[1]);
    return { kind: "recipient-link" as const, ...recipient };
  }
  const reaction = await recordTelegramReactionUpdate(update);
  return { kind: "reaction" as const, ...reaction };
}

export async function generateWeeklyPerformanceReport(now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const { start, end } = getCompletedWeekRange(now);
  const posts = await db.select().from(publisherPosts).where(and(gte(publisherPosts.createdAt, start), lte(publisherPosts.createdAt, end))).orderBy(desc(publisherPosts.createdAt));
  const postIds = posts.map(post => post.id);
  const engagement = postIds.length ? (await db.select().from(publisherPostEngagement)).filter(record => postIds.includes(record.publisherPostId)) : [];
  const reportMarkdown = buildWeeklyReportMarkdown({ periodStart: start, periodEnd: end, posts, engagement });
  const metricsJson = JSON.stringify({ posts: posts.length, delivered: posts.filter(post => post.deliveryStatus === "delivered").length, failed: posts.filter(post => post.deliveryStatus === "failed").length, reactions: engagement.reduce((total, record) => total + record.reactionCount, 0) });
  await db.insert(publisherWeeklyReports).values({ periodStart: start, periodEnd: end, reportMarkdown, metricsJson }).onDuplicateKeyUpdate({ set: { reportMarkdown, metricsJson, generatedAt: new Date() } });
  const report = (await db.select().from(publisherWeeklyReports).where(and(eq(publisherWeeklyReports.periodStart, start), eq(publisherWeeklyReports.periodEnd, end))).limit(1))[0];
  await deliverWeeklyReportToOwner(report.id);
  return report;
}

export async function listWeeklyReports() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  return db.select({ id: publisherWeeklyReports.id, periodStart: publisherWeeklyReports.periodStart, periodEnd: publisherWeeklyReports.periodEnd, generatedAt: publisherWeeklyReports.generatedAt, reportMarkdown: publisherWeeklyReports.reportMarkdown }).from(publisherWeeklyReports).orderBy(desc(publisherWeeklyReports.periodStart)).limit(24);
}

export async function getWeeklyReport(reportId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const report = (await db.select().from(publisherWeeklyReports).where(eq(publisherWeeklyReports.id, reportId)).limit(1))[0];
  if (!report) throw new Error("Weekly report not found.");
  return report;
}

export async function listSourceAlertConfigs() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await ensurePublisherDefaults();
  return db.select().from(publisherSourceAlertConfigs).orderBy(publisherSourceAlertConfigs.sourceName);
}

export async function upsertSourceAlertConfig(input: { sourceName: string; isEnabled: boolean; lowEngagementRateBps: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const sourceName = input.sourceName.trim();
  if (!sourceName) throw new Error("A source is required for the alert.");
  const thresholdBps = normalizeEngagementThresholdBps(input.lowEngagementRateBps);
  const source = (await db.select({ id: publisherSources.id }).from(publisherSources).where(eq(publisherSources.name, sourceName)).limit(1))[0];
  if (!source) throw new Error("The selected source does not exist in the monitored sources list.");
  await db.insert(publisherSourceAlertConfigs).values({ sourceName, isEnabled: input.isEnabled, lowEngagementRateBps: thresholdBps }).onDuplicateKeyUpdate({ set: { isEnabled: input.isEnabled, lowEngagementRateBps: thresholdBps, updatedAt: new Date() } });
  return (await db.select().from(publisherSourceAlertConfigs).where(eq(publisherSourceAlertConfigs.sourceName, sourceName)).limit(1))[0];
}

export async function createTelegramRecipientLink() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const settings = await ensurePublisherDefaults();
  const code = buildTelegramRecipientCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await db.update(publisherSettings).set({ reportRecipientCodeHash: hashText(code), reportRecipientCodeExpiresAt: expiresAt }).where(eq(publisherSettings.id, settings.id));
  return { code, expiresAt };
}

export async function connectTelegramRecipient(chatId: string | number, code: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const settings = await ensurePublisherDefaults();
  const valid = isValidTelegramRecipientCode({ code, codeHash: settings.reportRecipientCodeHash, expiresAt: settings.reportRecipientCodeExpiresAt });
  if (!valid) return { connected: false };
  await db.update(publisherSettings).set({ reportRecipientChatId: String(chatId), reportRecipientCodeHash: null, reportRecipientCodeExpiresAt: null, weeklyReportDeliveryEnabled: true }).where(eq(publisherSettings.id, settings.id));
  await sendTelegramMessage(String(chatId), `✅ Your account is now connected for weekly reports and engagement alerts from ${settings.appName}.`);
  return { connected: true };
}

export async function deliverWeeklyReportToOwner(reportId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const settings = await ensurePublisherDefaults();
  const report = await getWeeklyReport(reportId);
  const recipientChatId = settings.reportRecipientChatId;
  if (!canDeliverWeeklyReport(settings.weeklyReportDeliveryEnabled, recipientChatId) || !recipientChatId) return { delivered: false, reason: "no-recipient" as const };
  try {
    await sendTelegramMessage(recipientChatId, report.reportMarkdown);
    await db.update(publisherWeeklyReports).set(buildWeeklyReportDeliveryUpdate()).where(eq(publisherWeeklyReports.id, report.id));
    return { delivered: true };
  } catch (error) {
    await db.update(publisherWeeklyReports).set(buildWeeklyReportDeliveryUpdate(error)).where(eq(publisherWeeklyReports.id, report.id));
    return { delivered: false, reason: "delivery-failed" as const };
  }
}

export async function deliverLatestWeeklyReportToOwner() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const reports = await db.select({ id: publisherWeeklyReports.id, generatedAt: publisherWeeklyReports.generatedAt }).from(publisherWeeklyReports).orderBy(desc(publisherWeeklyReports.generatedAt)).limit(24);
  const latest = selectLatestWeeklyReport(reports);
  if (!latest) throw new Error("No weekly report is available to deliver yet. Generate one first.");
  return { reportId: latest.id, ...(await deliverWeeklyReportToOwner(latest.id)) };
}

export async function evaluateLowEngagementAlerts(now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const settings = await ensurePublisherDefaults();
  if (!settings.engagementAlertEnabled || !settings.reportRecipientChatId) return { status: "skipped" as const, reason: "alerts-disabled-or-recipient-missing" };
  const audienceSize = await fetchTelegramChannelAudienceSize();
  await db.update(publisherSettings).set({ lastKnownAudienceSize: audienceSize, audienceMeasuredAt: now }).where(eq(publisherSettings.id, settings.id));
  const earliest = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
  const matureBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const posts = await db.select().from(publisherPosts).where(and(eq(publisherPosts.deliveryStatus, "delivered"), eq(publisherPosts.isTest, false), gte(publisherPosts.publishedAt, earliest), lte(publisherPosts.publishedAt, matureBefore)));
  const engagement = await db.select().from(publisherPostEngagement);
  const reactionsByPost = new Map(engagement.map(record => [record.publisherPostId, record.reactionCount]));
  const existingAlerts = new Set((await db.select({ publisherPostId: publisherEngagementAlerts.publisherPostId }).from(publisherEngagementAlerts)).map(alert => alert.publisherPostId));
  const qualifying = posts.filter(post => !existingAlerts.has(post.id) && isLowEngagement(reactionsByPost.get(post.id) ?? 0, audienceSize, settings.lowEngagementRateBps));
  const sourceConfigs = await db.select().from(publisherSourceAlertConfigs);
  const sourcePeriod = getSourceAlertWeekRange(now);
  const sourcePosts = posts.filter(post => Boolean(post.publishedAt) && post.publishedAt! >= sourcePeriod.start && post.publishedAt! < matureBefore);
  const sourceCandidates = buildSourceLowEngagementCandidates({ posts: sourcePosts, engagement, audienceSize, configs: sourceConfigs });
  const existingSourceAlerts = new Set((await db.select().from(publisherSourceEngagementAlerts)).filter(alert => alert.periodStart.getTime() === sourcePeriod.start.getTime() && alert.periodEnd.getTime() === sourcePeriod.end.getTime()).map(alert => alert.sourceName));
  let sent = 0;
  let sourceAlertsSent = 0;
  for (const post of qualifying) {
    const reactionCount = reactionsByPost.get(post.id) ?? 0;
    const rateBps = calculateEngagementRateBps(reactionCount, audienceSize) ?? 0;
    const rateText = (rateBps / 100).toLocaleString("fa-IR", { maximumFractionDigits: 2 });
    await sendTelegramMessage(settings.reportRecipientChatId, `⚠️ هشدار تعامل پایین\n\nپست «${post.title}» پس از ۲۴ ساعت ${reactionCount} واکنش داشته است. نرخ تعامل ثبت‌شده: ${rateText}% (آستانه: ${(settings.lowEngagementRateBps / 100).toLocaleString("fa-IR")}% ).\n\nمنبع: ${post.sourceName}`);
    await db.insert(publisherEngagementAlerts).values({ publisherPostId: post.id, reactionCount, audienceSize, engagementRateBps: rateBps });
    sent += 1;
  }
  for (const source of sourceCandidates.filter(candidate => !existingSourceAlerts.has(candidate.sourceName))) {
    const averageEngagementRateBps = source.averageEngagementRateBps;
    if (averageEngagementRateBps === null) continue;
    const rateText = (averageEngagementRateBps / 100).toLocaleString("fa-IR", { maximumFractionDigits: 2 });
    const thresholdText = (source.thresholdBps / 100).toLocaleString("fa-IR", { maximumFractionDigits: 2 });
    await sendTelegramMessage(settings.reportRecipientChatId, `⚠️ هشدار عملکرد پایین منبع\n\nمنبع «${source.sourceName}» در هفتهٔ جاری، در ${source.deliveredPosts} پست تحویل‌شده مجموعاً ${source.totalReactions} واکنش داشته است. نرخ تعامل میانگین: ${rateText}% (آستانه: ${thresholdText}%).\n\nاین هشدار فقط یک‌بار برای هر منبع در هر هفته ارسال می‌شود.`);
    await db.insert(publisherSourceEngagementAlerts).values({ sourceName: source.sourceName, periodStart: sourcePeriod.start, periodEnd: sourcePeriod.end, deliveredPosts: source.deliveredPosts, totalReactions: source.totalReactions, audienceSize, averageEngagementRateBps, thresholdBps: source.thresholdBps });
    sourceAlertsSent += 1;
  }
  return { status: "completed" as const, audienceSize, evaluated: posts.length, sent, sourceCandidates: sourceCandidates.length, sourceAlertsSent };
}

export async function setPublisherSchedule(taskUid: string, nextExecutionAt?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await ensurePublisherDefaults();
  await db.update(publisherSettings).set({
    isEnabled: true,
    scheduleCronTaskUid: taskUid,
    nextRunAt: nextExecutionAt ? new Date(nextExecutionAt) : null,
  }).where(eq(publisherSettings.id, 1));
}

export async function setPublisherEnabled(enabled: boolean, nextExecutionAt?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await ensurePublisherDefaults();
  await db.update(publisherSettings).set({
    isEnabled: enabled,
    nextRunAt: nextExecutionAt ? new Date(nextExecutionAt) : null,
  }).where(eq(publisherSettings.id, 1));
}

export async function setPublisherSchedules(autoTaskUid: string, draftTaskUid: string, nextExecutionAt?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await ensurePublisherDefaults();
  await db.update(publisherSettings).set({
    isEnabled: true,
    scheduleCronTaskUid: autoTaskUid,
    draftCronTaskUid: draftTaskUid,
    nextRunAt: nextExecutionAt ? new Date(nextExecutionAt) : null,
  }).where(eq(publisherSettings.id, 1));
}

export async function setWeeklyReportSchedule(taskUid: string, nextExecutionAt?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const settings = await ensurePublisherDefaults();
  await db.update(publisherSettings).set({
    weeklyReportCronTaskUid: taskUid,
    weeklyReportNextRunAt: nextExecutionAt ? new Date(nextExecutionAt) : null,
  }).where(eq(publisherSettings.id, settings.id));
}

export async function setEngagementAlertSchedule(taskUid: string, thresholdBps: number, nextExecutionAt?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const settings = await ensurePublisherDefaults();
  if (!settings.reportRecipientChatId) throw new Error("Connect your Telegram account first to receive reports and alerts.");
  await db.update(publisherSettings).set({
    engagementAlertCronTaskUid: taskUid,
    engagementAlertNextRunAt: nextExecutionAt ? new Date(nextExecutionAt) : null,
    engagementAlertEnabled: true,
    lowEngagementRateBps: normalizeEngagementThresholdBps(thresholdBps),
  }).where(eq(publisherSettings.id, settings.id));
}

export async function createPublisherSource(input: SourceInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const source = validatePublisherSource(input);
  const inserted = await db.insert(publisherSources).values(source);
  return { id: Number(inserted[0].insertId) };
}

export async function updatePublisherSource(id: number, input: SourceInput) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const source = validatePublisherSource(input);
  const result = await db.update(publisherSources).set(source).where(eq(publisherSources.id, id));
  if (!result[0].affectedRows) throw new Error("Source not found.");
  return { id };
}

export async function setPublisherSourceActive(id: number, active: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const result = await db.update(publisherSources).set({ isActive: active }).where(eq(publisherSources.id, id));
  if (!result[0].affectedRows) throw new Error("Source not found.");
  return { id, active };
}

export async function updateEditorialPreferences(input: { editorialGuidance?: string | null; nextPostToneFeedback?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const settings = await ensurePublisherDefaults();
  const update: { editorialGuidance?: string | null; nextPostToneFeedback?: string | null } = {};
  if (input.editorialGuidance !== undefined) update.editorialGuidance = normalizeEditorialGuidance(input.editorialGuidance, "Standing editorial guidance");
  if (input.nextPostToneFeedback !== undefined) update.nextPostToneFeedback = normalizeEditorialGuidance(input.nextPostToneFeedback, "Next-post feedback");
  await db.update(publisherSettings).set(update).where(eq(publisherSettings.id, settings.id));
  return { ...update };
}

export async function updateGeneralSettings(input: {
  channelHandle?: string;
  appName?: string | null;
  postSignature?: string | null;
  postLanguage?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const settings = await ensurePublisherDefaults();
  const update: { channelHandle?: string; appName?: string; postSignature?: string | null; postLanguage?: string } = {};
  if (input.channelHandle !== undefined) update.channelHandle = normalizeChannelHandle(input.channelHandle);
  if (input.appName !== undefined) {
    const appName = (input.appName ?? "").trim();
    if (appName.length < 2 || appName.length > 80) throw new Error("App name must be between 2 and 80 characters.");
    update.appName = appName;
  }
  if (input.postSignature !== undefined) {
    const signature = (input.postSignature ?? "").trim();
    if (signature.length > 160) throw new Error("Post signature must be at most 160 characters.");
    update.postSignature = signature || null;
  }
  if (input.postLanguage !== undefined) {
    if (!isPostLanguage(input.postLanguage)) throw new Error("Unsupported output language.");
    update.postLanguage = input.postLanguage;
  }
  await db.update(publisherSettings).set(update).where(eq(publisherSettings.id, settings.id));
  return (await db.select().from(publisherSettings).where(eq(publisherSettings.id, settings.id)).limit(1))[0];
}

export async function getLlmSettingsStatus() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const [settings, resolved] = await Promise.all([ensurePublisherDefaults(), resolveLlmConfig()]);
  return {
    baseUrl: settings.llmBaseUrl ?? "",
    model: settings.llmModel ?? "",
    apiKeyConfigured: Boolean(settings.llmApiKeyEncrypted),
    apiKeyLast4: resolved.dbApiKeyLast4,
    effective: {
      baseUrl: resolved.baseUrl,
      model: resolved.model,
      apiKeyConfigured: resolved.apiKeyConfigured,
      baseUrlSource: resolved.baseUrlSource,
      modelSource: resolved.modelSource,
      apiKeySource: resolved.apiKeySource,
    },
  };
}

export async function updateLlmSettings(input: {
  baseUrl?: string | null;
  model?: string | null;
  apiKey?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const settings = await ensurePublisherDefaults();
  const update: { llmBaseUrl?: string | null; llmModel?: string | null; llmApiKeyEncrypted?: string | null } = {};
  if (input.baseUrl !== undefined) {
    const baseUrl = (input.baseUrl ?? "").trim();
    if (baseUrl) {
      try {
        const url = new URL(baseUrl);
        if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Unsupported protocol");
      } catch {
        throw new Error("LLM base URL must be a valid http or https URL.");
      }
      update.llmBaseUrl = baseUrl;
    } else {
      update.llmBaseUrl = null;
    }
  }
  if (input.model !== undefined) {
    const model = (input.model ?? "").trim();
    if (model.length < 1 || model.length > 160) throw new Error("Model name must be between 1 and 160 characters.");
    update.llmModel = model;
  }
  if (input.apiKey !== undefined) {
    const apiKey = (input.apiKey ?? "").trim();
    update.llmApiKeyEncrypted = apiKey ? encryptSecret(apiKey) : null;
  }
  await db.update(publisherSettings).set(update).where(eq(publisherSettings.id, settings.id));
  return getLlmSettingsStatus();
}

export async function listAvailableModels() {
  const resolved = await resolveLlmConfig();
  const response = await listLLMModels({ baseUrl: resolved.baseUrl, apiKey: resolved.apiKey });
  return response.data
    .map(model => model.id)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

export async function testLlmConnection() {
  const resolved = await resolveLlmConfig();
  const response = await invokeLLM({
    connection: { baseUrl: resolved.baseUrl, apiKey: resolved.apiKey },
    model: resolved.model,
    maxTokens: 32,
    messages: [
      { role: "system", content: "You are a connectivity check. Reply with exactly: ok" },
      { role: "user", content: "ping" },
    ],
  });
  const reply = response.choices[0]?.message?.content;
  return { ok: true, model: response.model || resolved.model, reply: typeof reply === "string" ? reply.trim().slice(0, 200) : "" };
}

/**
 * Instruction Studio: chats with the configured model using the channel's
 * live editorial prompt and guidance preloaded, so the editor can iterate on
 * the instructions conversationally before saving them as standing guidance.
 */
export async function chatWithEditorModel(messages: Array<{ role: "user" | "assistant"; content: string }>) {
  const settings = await ensurePublisherDefaults();
  const language = settingsPostLanguage(settings);
  const llm = await resolveLlmConfig();
  const guidanceContext = settings.editorialGuidance
    ? `\n\nCurrent standing editorial guidance (the instructions you are helping to refine):\n${settings.editorialGuidance}`
    : "";
  const chatMessages: Message[] = [
    {
      role: "system",
      content:
        buildEditorialSystemPrompt(language) +
        guidanceContext +
        "\n\nYou are now in an instruction-tuning session with the channel editor. Help them draft, test and refine the editorial instructions and tone guidance for the channel's posts. When asked, produce a concise, ready-to-save instruction block. Reply in the same language the editor writes in. This conversation never gets published to the channel.",
    },
    ...messages.map(message => ({ role: message.role, content: message.content })),
  ];
  const response = await invokeLLM({
    connection: { baseUrl: llm.baseUrl, apiKey: llm.apiKey },
    model: llm.model,
    maxTokens: 2000,
    messages: chatMessages,
  });
  const reply = response.choices[0]?.message?.content;
  if (!reply || typeof reply !== "string") throw new Error("The language model returned no reply.");
  return { reply: reply.trim(), model: response.model || llm.model };
}

async function fetchCandidates(source: PublisherSource): Promise<NewsCandidate[]> {
  const url = source.feedUrl ?? source.homepage;
  const response = await fetch(url, {
    headers: { "user-agent": "AIChannelPublisher/1.0 (+news aggregation)" },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error(`${source.name} returned ${response.status}`);
  return extractCandidates(source, await response.text());
}

async function isDuplicate(candidate: NewsCandidate) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const urlHash = hashText(candidate.url);
  const topic = normalizeTopic(candidate.title);
  const existing = await db.select({ sourceUrlHash: publisherPosts.sourceUrlHash, normalizedTopic: publisherPosts.normalizedTopic, contentFingerprint: publisherPosts.contentFingerprint }).from(publisherPosts).where(and(
    eq(publisherPosts.deliveryStatus, "delivered"),
    or(eq(publisherPosts.sourceUrlHash, urlHash), eq(publisherPosts.normalizedTopic, topic))
  )).limit(10);
  return matchesDuplicate(existing, { sourceUrlHash: urlHash, normalizedTopic: topic });
}

async function isDuplicateContent(content: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const fingerprint = hashText(content);
  const existing = await db.select({ sourceUrlHash: publisherPosts.sourceUrlHash, normalizedTopic: publisherPosts.normalizedTopic, contentFingerprint: publisherPosts.contentFingerprint }).from(publisherPosts).where(and(
    eq(publisherPosts.deliveryStatus, "delivered"),
    eq(publisherPosts.contentFingerprint, fingerprint)
  )).limit(1);
  return matchesDuplicate(existing, { contentFingerprint: fingerprint });
}

async function pickCandidate() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const sources = await db.select().from(publisherSources).where(eq(publisherSources.isActive, true));
  const batches = await Promise.allSettled(sources.map(fetchCandidates));
  const candidates = batches.flatMap(batch => batch.status === "fulfilled" ? batch.value : []);
  for (const candidate of candidates) {
    if (!(await isDuplicate(candidate))) return candidate;
  }
  throw new Error("No unposted verified source item is currently available.");
}

async function addArticleContext(candidate: NewsCandidate) {
  try {
    const response = await fetch(candidate.url, {
      headers: { "user-agent": "AIChannelPublisher/1.0 (+news aggregation)" },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return candidate;
    const html = await response.text();
    const withoutScripts = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ");
    return { ...candidate, sourceText: stripMarkup(withoutScripts).slice(0, 6500) };
  } catch {
    return candidate;
  }
}

async function generatePost(candidate: NewsCandidate, postKind: "source" | "explainer") {
  const settings = await ensurePublisherDefaults();
  const language = settingsPostLanguage(settings);
  const guidanceLabel = language === "fa" ? "راهنمای ثابت تحریریه" : language === "de" ? "Feste redaktionelle Vorgaben" : "Editorial guidance";
  const feedbackLabel = language === "fa" ? "بازخورد فقط برای همین پست" : language === "de" ? "Feedback nur für diesen Beitrag" : "Feedback for this post only";
  const editorialNotes = [
    settings.editorialGuidance ? `${guidanceLabel}: ${settings.editorialGuidance}` : null,
    settings.nextPostToneFeedback ? `${feedbackLabel}: ${settings.nextPostToneFeedback}` : null,
  ].filter(Boolean).join("\n");
  const llm = await resolveLlmConfig();
  const response = await invokeLLM({
    connection: { baseUrl: llm.baseUrl, apiKey: llm.apiKey },
    model: llm.model,
    messages: [
      {
        role: "system",
        content: buildEditorialSystemPrompt(language),
      },
      {
        role: "user",
        content: buildPostGenerationPrompt({ language, postKind, editorialNotes, candidate }),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "telegram_channel_post",
        strict: true,
        schema: {
          type: "object",
          properties: {
            headline: { type: "string" },
            summary: { type: "string" },
            keyPoints: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
            realWorldImpact: { type: "string" },
          },
          required: ["headline", "summary", "keyPoints", "realWorldImpact"],
          additionalProperties: false,
        },
      },
    },
  });
  const content = response.choices[0]?.message?.content;
  if (!content || typeof content !== "string") throw new Error("The language model returned no post content.");
  const generated = JSON.parse(content) as GeneratedPost;
  if (!outputMatchesLanguage(`${generated.headline}${generated.summary}`, language)) {
    throw new Error(`The language model did not return content in the configured output language (${languageName(language)}).`);
  }
  return generated;
}

export async function configureTelegramEngagementWebhook(origin: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !secret) throw new Error("The bot token and TELEGRAM_WEBHOOK_SECRET are required to register the engagement webhook securely.");
  const baseUrl = origin.replace(/\/$/, "");
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: `${baseUrl}/api/telegram/webhook`, secret_token: secret, allowed_updates: ["message_reaction_count", "message"] }),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json().catch(() => null) as { ok?: boolean; description?: string } | null;
  if (!response.ok || !result?.ok) throw new Error(`Registering the Telegram engagement webhook failed: ${result?.description ?? response.status}`);
  const settings = await ensurePublisherDefaults();
  await dbUpdateEngagementWebhookEnabled(settings.id, true);
  return { webhookUrl: `${baseUrl}/api/telegram/webhook` };
}

async function createRun(runKey: string, taskUid?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  try {
    await db.insert(publisherRuns).values({ runKey, scheduleCronTaskUid: taskUid ?? null });
    return true;
  } catch {
    return false;
  }
}

async function finishRun(runKey: string, status: "completed" | "failed" | "skipped", detail?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  await db.update(publisherRuns).set({ status, detail: detail?.slice(0, 4000) ?? null, completedAt: new Date() }).where(eq(publisherRuns.runKey, runKey));
}

export async function generateDraftForReview(options: { taskUid?: string; scheduledFor?: Date; isManual?: boolean } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const settings = await ensurePublisherDefaults();
  const scheduledFor = options.scheduledFor ?? nextThreeHourBoundary();
  const runKey = options.isManual ? `manual-draft-${randomUUID()}` : `draft-${options.taskUid ?? "schedule"}-${scheduledFor.getTime()}`;
  if (!(await createRun(runKey, options.taskUid))) return { status: "skipped" as const, reason: "Draft already generated for this review window." };

  try {
    const existingDraft = await db.select({ id: publisherPosts.id }).from(publisherPosts).where(and(
      eq(publisherPosts.deliveryStatus, "draft"),
      eq(publisherPosts.scheduledFor, scheduledFor)
    )).limit(1);
    if (existingDraft[0]) {
      await finishRun(runKey, "skipped", "A draft already exists for this review window.");
      return { status: "skipped" as const, reason: "A review draft already exists." };
    }
    const candidate = await addArticleContext(await pickCandidate());
    const postKind = settings.nextPostKind;
    const generated = await generatePost(candidate, postKind);
    const content = renderChannelPost(generated, candidate, renderOptions(settings));
    if (await isDuplicateContent(content)) {
      await finishRun(runKey, "skipped", "A delivered post already has the same content fingerprint.");
      return { status: "skipped" as const, reason: "Duplicate post content." };
    }
    const inserted = await db.insert(publisherPosts).values({
      postKind,
      title: generated.headline.slice(0, 512),
      content,
      sourceName: candidate.sourceName,
      sourceUrl: candidate.url,
      sourceUrlHash: hashText(candidate.url),
      normalizedTopic: normalizeTopic(candidate.title),
      contentFingerprint: hashText(content),
      deliveryStatus: "draft",
      scheduledFor,
    });
    const postId = Number(inserted[0].insertId);
    if (settings.nextPostToneFeedback) {
      await db.update(publisherSettings).set({ nextPostToneFeedback: null }).where(eq(publisherSettings.id, settings.id));
    }
    await db.update(publisherSettings).set({ lastRunAt: new Date() }).where(eq(publisherSettings.id, settings.id));
    await finishRun(runKey, "completed", `Created review draft ${postId}.`);
    return { status: "draft" as const, postId, scheduledFor };
  } catch (error) {
    await finishRun(runKey, "failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function editDraft(postId: number, content: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const post = (await db.select().from(publisherPosts).where(eq(publisherPosts.id, postId)).limit(1))[0];
  if (!post || !isReviewableDraftStatus(post.deliveryStatus)) throw new Error("Only a pending review draft can be edited.");
  const settings = await ensurePublisherDefaults();
  const signature = postSignature(renderOptions(settings));
  const finalContent = normalizeEditedDraftContent(content, signature);
  await db.update(publisherPosts).set({
    title: titleFromContent(finalContent, settingsPostLanguage(settings)),
    content: finalContent,
    contentFingerprint: hashText(finalContent),
  }).where(eq(publisherPosts.id, postId));
  return { postId, content: finalContent };
}

export async function setDraftHeld(postId: number, held: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const result = await db.update(publisherPosts).set({ deliveryStatus: held ? "held" : "draft" }).where(and(
    eq(publisherPosts.id, postId),
    or(eq(publisherPosts.deliveryStatus, "draft"), eq(publisherPosts.deliveryStatus, "held"))
  ));
  if (!result[0].affectedRows) throw new Error("Only a pending review draft can be put on hold.");
  return { postId, held };
}

export async function discardDraft(postId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const result = await db.update(publisherPosts).set({ deliveryStatus: "discarded" }).where(and(
    eq(publisherPosts.id, postId),
    or(eq(publisherPosts.deliveryStatus, "draft"), eq(publisherPosts.deliveryStatus, "held"))
  ));
  if (!result[0].affectedRows) throw new Error("Only a pending review draft can be discarded.");
  return { postId, discarded: true };
}

export async function publishDraft(postId: number, options: { isTest?: boolean } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const post = (await db.select().from(publisherPosts).where(eq(publisherPosts.id, postId)).limit(1))[0];
  if (!post || !isReviewableDraftStatus(post.deliveryStatus)) throw new Error("This draft is no longer ready to publish.");
  if (await isDuplicateContent(post.content)) throw new Error("A similar version has already been published.");
  await verifyTelegramChannelAccess();
  await db.update(publisherPosts).set({ deliveryStatus: "pending", isTest: Boolean(options.isTest) }).where(eq(publisherPosts.id, postId));
  try {
    const telegramMessageId = await deliverToTelegram(post.content);
    await db.update(publisherPosts).set({ deliveryStatus: "delivered", telegramMessageId, publishedAt: new Date() }).where(eq(publisherPosts.id, postId));
    const settings = await ensurePublisherDefaults();
    await db.update(publisherSettings).set({
      nextPostKind: post.postKind === "source" ? "explainer" : "source",
      lastPublishedAt: new Date(),
    }).where(eq(publisherSettings.id, settings.id));
    return { status: "delivered" as const, postId };
  } catch (error) {
    await db.update(publisherPosts).set({ deliveryStatus: "failed", errorMessage: error instanceof Error ? error.message : String(error) }).where(eq(publisherPosts.id, postId));
    throw error;
  }
}

export async function autoPublishReadyDraft() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const draft = (await db.select().from(publisherPosts).where(and(
    eq(publisherPosts.deliveryStatus, "draft"),
    lte(publisherPosts.scheduledFor, new Date())
  )).orderBy(desc(publisherPosts.scheduledFor)).limit(1))[0];
  if (!draft || !canAutoPublishDraft(draft.deliveryStatus, draft.scheduledFor)) return { status: "skipped" as const, reason: "No approved draft is ready for this publishing window." };
  return publishDraft(draft.id);
}

export async function publishNextPost(options: { isTest?: boolean; taskUid?: string } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const settings = await ensurePublisherDefaults();
  const isTest = Boolean(options.isTest);
  const runKey = buildRunKey({ isTest, taskUid: options.taskUid });
  if (!(await createRun(runKey, options.taskUid))) return { status: "skipped" as const, reason: "Already processed this cycle." };

  try {
    await verifyTelegramChannelAccess();
    const candidate = await addArticleContext(await pickCandidate());
    const postKind = settings.nextPostKind;
    const generated = await generatePost(candidate, postKind);
    const content = renderChannelPost(generated, candidate, renderOptions(settings));
    if (await isDuplicateContent(content)) {
      await finishRun(runKey, "skipped", "A delivered post already has the same content fingerprint.");
      return { status: "skipped" as const, reason: "Duplicate post content." };
    }
    const inserted = await db.insert(publisherPosts).values({
      postKind,
      title: generated.headline.slice(0, 512),
      content,
      sourceName: candidate.sourceName,
      sourceUrl: candidate.url,
      sourceUrlHash: hashText(candidate.url),
      normalizedTopic: normalizeTopic(candidate.title),
      contentFingerprint: hashText(content),
      isTest,
      deliveryStatus: "pending",
    });
    const postId = Number(inserted[0].insertId);
    const telegramMessageId = await deliverToTelegram(content);
    await db.update(publisherPosts).set({ deliveryStatus: "delivered", telegramMessageId, publishedAt: new Date() }).where(eq(publisherPosts.id, postId));
    await db.update(publisherSettings).set({
      nextPostKind: postKind === "source" ? "explainer" : "source",
      lastRunAt: new Date(),
      lastPublishedAt: new Date(),
    }).where(eq(publisherSettings.id, settings.id));
    await finishRun(runKey, "completed", `Delivered post ${postId}.`);
    return { status: "delivered" as const, postId, content };
  } catch (error) {
    await finishRun(runKey, "failed", error instanceof Error ? error.message : String(error));
    await db.update(publisherSettings).set({ lastRunAt: new Date() }).where(eq(publisherSettings.id, settings.id));
    throw error;
  }
}

export async function getScheduleForCallback(taskUid: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const settings = await ensurePublisherDefaults();
  return settings.isEnabled && settings.scheduleCronTaskUid === taskUid ? settings : null;
}

export async function getDraftScheduleForCallback(taskUid: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const settings = await ensurePublisherDefaults();
  return settings.isEnabled && settings.draftCronTaskUid === taskUid ? settings : null;
}

export async function getWeeklyReportScheduleForCallback(taskUid: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const settings = await ensurePublisherDefaults();
  return settings.weeklyReportCronTaskUid === taskUid ? settings : null;
}

export async function getEngagementAlertScheduleForCallback(taskUid: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const settings = await ensurePublisherDefaults();
  return settings.engagementAlertEnabled && settings.engagementAlertCronTaskUid === taskUid ? settings : null;
}

export function isValidTelegramTokenConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}
