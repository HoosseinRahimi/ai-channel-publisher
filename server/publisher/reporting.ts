import { and, desc, eq, gte, inArray, lte, or } from "drizzle-orm";
import {
  publisherAnalyticsPresets,
  publisherEngagementAlerts,
  publisherPostEngagement,
  publisherPosts,
  publisherSettings,
  publisherSourceAlertConfigs,
  publisherSourceEngagementAlerts,
  publisherSources,
  publisherWeeklyReports,
} from "../../drizzle/schema";
import { requireDb } from "../db";
import {
  buildDailySourcePerformanceTrend,
  buildEngagementAnalytics,
  buildPublisherAnalytics,
  buildSourceEngagementComparison,
  buildSourceLowEngagementCandidates,
  buildWeeklyReportDeliveryUpdate,
  buildWeeklyReportMarkdown,
  canDeliverWeeklyReport,
  getCompletedWeekRange,
  getSourceAlertWeekRange,
  normalizeAnalyticsPresetName,
  normalizeSourcePerformanceFilters,
  selectLatestWeeklyReport,
} from "./analytics";
import { PUBLISH_CRON, calculateEngagementRateBps, isLowEngagement, normalizeEngagementThresholdBps } from "./editorial";
import { resolveLlmConfig } from "./llmConfig";
import { getPublisherSettings, redactPublisherSettings } from "./settings";
import { fetchTelegramChannelAudienceSize, sendTelegramMessage } from "./telegram";

export async function getPublisherDashboard() {
  const db = await requireDb();
  const settings = await getPublisherSettings();
  const [posts, sources, reviewPosts, llm] = await Promise.all([
    db.select().from(publisherPosts).orderBy(desc(publisherPosts.createdAt)).limit(30),
    db.select().from(publisherSources).orderBy(publisherSources.name),
    db.select().from(publisherPosts).where(or(eq(publisherPosts.deliveryStatus, "draft"), eq(publisherPosts.deliveryStatus, "held"))).orderBy(desc(publisherPosts.createdAt)).limit(4),
    resolveLlmConfig(),
  ]);
  return {
    settings: redactPublisherSettings(settings),
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
  const db = await requireDb();
  const conditions = [eq(publisherPosts.deliveryStatus, "delivered")];
  if (filters.sourceName) conditions.push(eq(publisherPosts.sourceName, filters.sourceName));
  if (filters.from) conditions.push(gte(publisherPosts.createdAt, filters.from));
  if (filters.to) conditions.push(lte(publisherPosts.createdAt, filters.to));
  return db.select().from(publisherPosts).where(and(...conditions)).orderBy(desc(publisherPosts.createdAt)).limit(100);
}

export async function getSourcePerformanceAnalysis(input: { sourceName?: string; from?: string; to?: string } = {}) {
  const db = await requireDb();
  const filters = normalizeSourcePerformanceFilters(input);
  const conditions = [eq(publisherPosts.deliveryStatus, "delivered")];
  if (filters.sourceName) conditions.push(eq(publisherPosts.sourceName, filters.sourceName));
  if (filters.from) conditions.push(gte(publisherPosts.publishedAt, filters.from));
  if (filters.to) conditions.push(lte(publisherPosts.publishedAt, filters.to));
  const [settings, posts, sources] = await Promise.all([
    getPublisherSettings(),
    db.select({ id: publisherPosts.id, sourceName: publisherPosts.sourceName, deliveryStatus: publisherPosts.deliveryStatus, publishedAt: publisherPosts.publishedAt }).from(publisherPosts).where(and(...conditions)).orderBy(desc(publisherPosts.publishedAt)).limit(500),
    db.select({ name: publisherSources.name }).from(publisherSources).orderBy(publisherSources.name),
  ]);
  const postIds = posts.map(post => post.id);
  const engagement = postIds.length ? await db.select().from(publisherPostEngagement).where(inArray(publisherPostEngagement.publisherPostId, postIds)) : [];
  return {
    filters: { sourceName: filters.sourceName ?? null, from: filters.from?.toISOString().slice(0, 10) ?? null, to: filters.to?.toISOString().slice(0, 10) ?? null },
    availableSources: sources.map(source => source.name),
    filteredPosts: posts.length,
    sourceComparison: buildSourceEngagementComparison(posts, engagement, settings.lastKnownAudienceSize),
    dailyTrend: buildDailySourcePerformanceTrend(posts, engagement, settings.lastKnownAudienceSize),
  };
}

export async function listAnalyticsPresets(ownerOpenId: string) {
  const db = await requireDb();
  return db.select().from(publisherAnalyticsPresets).where(eq(publisherAnalyticsPresets.ownerOpenId, ownerOpenId)).orderBy(desc(publisherAnalyticsPresets.updatedAt)).limit(30);
}

export async function saveAnalyticsPreset(ownerOpenId: string, input: { name: string; sourceName?: string; from?: string; to?: string }) {
  const db = await requireDb();
  const name = normalizeAnalyticsPresetName(input.name);
  const filters = normalizeSourcePerformanceFilters(input);
  await db.insert(publisherAnalyticsPresets).values({ ownerOpenId, name, sourceName: filters.sourceName ?? null, dateFrom: filters.from ?? null, dateTo: filters.to ?? null }).onDuplicateKeyUpdate({ set: { sourceName: filters.sourceName ?? null, dateFrom: filters.from ?? null, dateTo: filters.to ?? null, updatedAt: new Date() } });
  return (await db.select().from(publisherAnalyticsPresets).where(and(eq(publisherAnalyticsPresets.ownerOpenId, ownerOpenId), eq(publisherAnalyticsPresets.name, name))).limit(1))[0];
}

export async function deleteAnalyticsPreset(ownerOpenId: string, presetId: number) {
  const db = await requireDb();
  await db.delete(publisherAnalyticsPresets).where(and(eq(publisherAnalyticsPresets.id, presetId), eq(publisherAnalyticsPresets.ownerOpenId, ownerOpenId)));
  return { deleted: true };
}

export async function getPublisherAnalytics() {
  const db = await requireDb();
  const [settings, posts] = await Promise.all([getPublisherSettings(), db.select({
    id: publisherPosts.id,
    title: publisherPosts.title,
    createdAt: publisherPosts.createdAt,
    deliveryStatus: publisherPosts.deliveryStatus,
    sourceName: publisherPosts.sourceName,
    postKind: publisherPosts.postKind,
    publishedAt: publisherPosts.publishedAt,
  }).from(publisherPosts).orderBy(desc(publisherPosts.createdAt)).limit(500)]);
  const postIds = posts.map(post => post.id);
  const engagement = postIds.length ? await db.select().from(publisherPostEngagement).where(inArray(publisherPostEngagement.publisherPostId, postIds)) : [];
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

export async function generateWeeklyPerformanceReport(now = new Date()) {
  const db = await requireDb();
  const { start, end } = getCompletedWeekRange(now);
  const posts = await db.select().from(publisherPosts).where(and(gte(publisherPosts.createdAt, start), lte(publisherPosts.createdAt, end))).orderBy(desc(publisherPosts.createdAt));
  const postIds = posts.map(post => post.id);
  const engagement = postIds.length ? await db.select().from(publisherPostEngagement).where(inArray(publisherPostEngagement.publisherPostId, postIds)) : [];
  const reportMarkdown = buildWeeklyReportMarkdown({ periodStart: start, periodEnd: end, posts, engagement });
  const metricsJson = JSON.stringify({ posts: posts.length, delivered: posts.filter(post => post.deliveryStatus === "delivered").length, failed: posts.filter(post => ["failed", "delivery_unknown"].includes(post.deliveryStatus)).length, reactions: engagement.reduce((total, record) => total + record.reactionCount, 0) });
  await db.insert(publisherWeeklyReports).values({ periodStart: start, periodEnd: end, reportMarkdown, metricsJson }).onDuplicateKeyUpdate({ set: { reportMarkdown, metricsJson, generatedAt: new Date() } });
  const report = (await db.select().from(publisherWeeklyReports).where(and(eq(publisherWeeklyReports.periodStart, start), eq(publisherWeeklyReports.periodEnd, end))).limit(1))[0];
  await deliverWeeklyReportToOwner(report.id);
  return report;
}

export async function listWeeklyReports() {
  const db = await requireDb();
  return db.select({ id: publisherWeeklyReports.id, periodStart: publisherWeeklyReports.periodStart, periodEnd: publisherWeeklyReports.periodEnd, generatedAt: publisherWeeklyReports.generatedAt, reportMarkdown: publisherWeeklyReports.reportMarkdown }).from(publisherWeeklyReports).orderBy(desc(publisherWeeklyReports.periodStart)).limit(24);
}

export async function getWeeklyReport(reportId: number) {
  const db = await requireDb();
  const report = (await db.select().from(publisherWeeklyReports).where(eq(publisherWeeklyReports.id, reportId)).limit(1))[0];
  if (!report) throw new Error("Weekly report not found.");
  return report;
}

export async function listSourceAlertConfigs() {
  const db = await requireDb();
  await getPublisherSettings();
  return db.select().from(publisherSourceAlertConfigs).orderBy(publisherSourceAlertConfigs.sourceName);
}

export async function upsertSourceAlertConfig(input: { sourceName: string; isEnabled: boolean; lowEngagementRateBps: number }) {
  const db = await requireDb();
  const sourceName = input.sourceName.trim();
  if (!sourceName) throw new Error("A source is required for the alert.");
  const thresholdBps = normalizeEngagementThresholdBps(input.lowEngagementRateBps);
  const source = (await db.select({ id: publisherSources.id }).from(publisherSources).where(eq(publisherSources.name, sourceName)).limit(1))[0];
  if (!source) throw new Error("The selected source does not exist in the monitored sources list.");
  await db.insert(publisherSourceAlertConfigs).values({ sourceName, isEnabled: input.isEnabled, lowEngagementRateBps: thresholdBps }).onDuplicateKeyUpdate({ set: { isEnabled: input.isEnabled, lowEngagementRateBps: thresholdBps, updatedAt: new Date() } });
  return (await db.select().from(publisherSourceAlertConfigs).where(eq(publisherSourceAlertConfigs.sourceName, sourceName)).limit(1))[0];
}

export async function deliverWeeklyReportToOwner(reportId: number) {
  const db = await requireDb();
  const settings = await getPublisherSettings();
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
  const db = await requireDb();
  const reports = await db.select({ id: publisherWeeklyReports.id, generatedAt: publisherWeeklyReports.generatedAt }).from(publisherWeeklyReports).orderBy(desc(publisherWeeklyReports.generatedAt)).limit(24);
  const latest = selectLatestWeeklyReport(reports);
  if (!latest) throw new Error("No weekly report is available to deliver yet. Generate one first.");
  return { reportId: latest.id, ...(await deliverWeeklyReportToOwner(latest.id)) };
}

export async function evaluateLowEngagementAlerts(now = new Date()) {
  const db = await requireDb();
  const settings = await getPublisherSettings();
  if (!settings.engagementAlertEnabled || !settings.reportRecipientChatId) return { status: "skipped" as const, reason: "alerts-disabled-or-recipient-missing" };
  const audienceSize = await fetchTelegramChannelAudienceSize();
  await db.update(publisherSettings).set({ lastKnownAudienceSize: audienceSize, audienceMeasuredAt: now }).where(eq(publisherSettings.id, settings.id));
  const earliest = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
  const matureBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const posts = await db.select().from(publisherPosts).where(and(eq(publisherPosts.deliveryStatus, "delivered"), eq(publisherPosts.isTest, false), gte(publisherPosts.publishedAt, earliest), lte(publisherPosts.publishedAt, matureBefore)));
  const postIds = posts.map(post => post.id);
  const engagement = postIds.length ? await db.select().from(publisherPostEngagement).where(inArray(publisherPostEngagement.publisherPostId, postIds)) : [];
  const reactionsByPost = new Map(engagement.map(record => [record.publisherPostId, record.reactionCount]));
  const existingAlerts = new Set((postIds.length ? await db.select({ publisherPostId: publisherEngagementAlerts.publisherPostId }).from(publisherEngagementAlerts).where(inArray(publisherEngagementAlerts.publisherPostId, postIds)) : []).map(alert => alert.publisherPostId));
  const qualifying = posts.filter(post => !existingAlerts.has(post.id) && isLowEngagement(reactionsByPost.get(post.id) ?? 0, audienceSize, settings.lowEngagementRateBps));
  const sourceConfigs = await db.select().from(publisherSourceAlertConfigs);
  const sourcePeriod = getSourceAlertWeekRange(now);
  const sourcePosts = posts.filter(post => Boolean(post.publishedAt) && post.publishedAt! >= sourcePeriod.start && post.publishedAt! < matureBefore);
  const sourceCandidates = buildSourceLowEngagementCandidates({ posts: sourcePosts, engagement, audienceSize, configs: sourceConfigs });
  const existingSourceAlerts = new Set((await db.select().from(publisherSourceEngagementAlerts).where(and(eq(publisherSourceEngagementAlerts.periodStart, sourcePeriod.start), eq(publisherSourceEngagementAlerts.periodEnd, sourcePeriod.end)))).map(alert => alert.sourceName));
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
