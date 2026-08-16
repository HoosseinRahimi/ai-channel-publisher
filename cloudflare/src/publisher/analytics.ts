import { randomUUID } from "../_core/crypto";
import type { PublisherPost } from "../schema";
import { hashText, type TelegramReactionUpdate } from "./editorial";

export function buildPublisherAnalytics(posts: Array<Pick<PublisherPost, "createdAt" | "deliveryStatus" | "sourceName" | "postKind" | "publishedAt">>, now = new Date()) {
  const delivered = posts.filter(post => post.deliveryStatus === "delivered");
  const failed = posts.filter(post => post.deliveryStatus === "failed");
  const attempted = posts.filter(post => ["delivered", "failed"].includes(post.deliveryStatus));
  const rangeStart = new Date(now);
  rangeStart.setUTCHours(0, 0, 0, 0);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 13);
  const dailyMap = new Map<string, { date: string; delivered: number; failed: number; drafts: number }>();
  for (let offset = 0; offset < 14; offset += 1) {
    const date = new Date(rangeStart);
    date.setUTCDate(rangeStart.getUTCDate() + offset);
    dailyMap.set(date.toISOString().slice(0, 10), { date: date.toISOString().slice(0, 10), delivered: 0, failed: 0, drafts: 0 });
  }
  for (const post of posts) {
    const key = post.createdAt.toISOString().slice(0, 10);
    const bucket = dailyMap.get(key);
    if (!bucket) continue;
    if (post.deliveryStatus === "delivered") bucket.delivered += 1;
    else if (post.deliveryStatus === "failed") bucket.failed += 1;
    else if (["draft", "held"].includes(post.deliveryStatus)) bucket.drafts += 1;
  }
  const sourceMap = new Map<string, { sourceName: string; delivered: number; failed: number; total: number }>();
  for (const post of posts) {
    if (!["delivered", "failed"].includes(post.deliveryStatus)) continue;
    const current = sourceMap.get(post.sourceName) ?? { sourceName: post.sourceName, delivered: 0, failed: 0, total: 0 };
    current.total += 1;
    if (post.deliveryStatus === "delivered") current.delivered += 1;
    if (post.deliveryStatus === "failed") current.failed += 1;
    sourceMap.set(post.sourceName, current);
  }
  const postKinds = ["source", "explainer"] as const;
  return {
    totals: {
      delivered: delivered.length,
      failed: failed.length,
      pendingReview: posts.filter(post => ["draft", "held"].includes(post.deliveryStatus)).length,
      attempted: attempted.length,
      deliveryRate: attempted.length ? Math.round((delivered.length / attempted.length) * 100) : null,
    },
    daily: Array.from(dailyMap.values()),
    sources: Array.from(sourceMap.values()).sort((a, b) => b.delivered - a.delivered || b.total - a.total).slice(0, 8),
    postKinds: postKinds.map(kind => ({ kind, count: delivered.filter(post => post.postKind === kind).length })),
    latestPublishedAt: delivered.reduce<Date | null>((latest, post) => !post.publishedAt || (latest && latest > post.publishedAt) ? latest : post.publishedAt, null),
  };
}

export function buildEngagementAnalytics(records: Array<{ reactionCount: number; lastReactionAt: Date | null }>) {
  const totalReactions = records.reduce((total, record) => total + record.reactionCount, 0);
  const lastUpdatedAt = records.reduce<Date | null>((latest, record) => !record.lastReactionAt || (latest && latest > record.lastReactionAt) ? latest : record.lastReactionAt, null);
  return {
    trackedPosts: records.length,
    totalReactions,
    averageReactions: records.length ? Number((totalReactions / records.length).toFixed(1)) : null,
    lastUpdatedAt,
  };
}

export function buildSourceEngagementComparison(
  posts: Array<{ id: number; sourceName: string; deliveryStatus: string }>,
  engagement: Array<{ publisherPostId: number; reactionCount: number }>,
  audienceSize: number | null,
) {
  const reactionsByPost = new Map(engagement.map(record => [record.publisherPostId, Math.max(0, record.reactionCount)]));
  const sources = new Map<string, { sourceName: string; deliveredPosts: number; trackedPosts: number; totalReactions: number }>();
  for (const post of posts) {
    if (post.deliveryStatus !== "delivered") continue;
    const current = sources.get(post.sourceName) ?? { sourceName: post.sourceName, deliveredPosts: 0, trackedPosts: 0, totalReactions: 0 };
    current.deliveredPosts += 1;
    const reactions = reactionsByPost.get(post.id);
    if (reactions !== undefined) {
      current.trackedPosts += 1;
      current.totalReactions += reactions;
    }
    sources.set(post.sourceName, current);
  }
  return Array.from(sources.values()).map(source => ({
    ...source,
    averageReactions: source.deliveredPosts ? Number((source.totalReactions / source.deliveredPosts).toFixed(1)) : null,
    averageEngagementRateBps: audienceSize && source.deliveredPosts ? Math.round((source.totalReactions / source.deliveredPosts / audienceSize) * 10000) : null,
  })).sort((a, b) => b.totalReactions - a.totalReactions || (b.averageReactions ?? 0) - (a.averageReactions ?? 0) || a.sourceName.localeCompare(b.sourceName)).slice(0, 12);
}

export function normalizeSourcePerformanceFilters(input: { sourceName?: string; from?: string; to?: string } = {}) {
  const parseDate = (value: string | undefined, endOfDay: boolean) => {
    if (!value) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("تاریخ تحلیل باید با قالب YYYY-MM-DD باشد.");
    const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
    if (Number.isNaN(date.getTime())) throw new Error("تاریخ تحلیل معتبر نیست.");
    return date;
  };
  const sourceName = input.sourceName?.trim() || undefined;
  const from = parseDate(input.from, false);
  const to = parseDate(input.to, true);
  if (from && to && from > to) throw new Error("تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد.");
  return { sourceName, from, to };
}

export function buildDailySourcePerformanceTrend(
  posts: Array<{ id: number; publishedAt: Date | null }>,
  engagement: Array<{ publisherPostId: number; reactionCount: number }>,
  audienceSize: number | null,
) {
  const reactionsByPost = new Map(engagement.map(record => [record.publisherPostId, Math.max(0, record.reactionCount)]));
  const days = new Map<string, { date: string; deliveredPosts: number; totalReactions: number }>();
  for (const post of posts) {
    if (!post.publishedAt) continue;
    const date = post.publishedAt.toISOString().slice(0, 10);
    const current = days.get(date) ?? { date, deliveredPosts: 0, totalReactions: 0 };
    current.deliveredPosts += 1;
    current.totalReactions += reactionsByPost.get(post.id) ?? 0;
    days.set(date, current);
  }
  return Array.from(days.values()).sort((a, b) => a.date.localeCompare(b.date)).map(day => ({
    ...day,
    averageReactions: Number((day.totalReactions / day.deliveredPosts).toFixed(1)),
    averageEngagementRateBps: audienceSize ? Math.round((day.totalReactions / day.deliveredPosts / audienceSize) * 10000) : null,
  }));
}

export function normalizeAnalyticsPresetName(value: string) {
  const name = value.trim();
  if (name.length < 2 || name.length > 80) throw new Error("نام میانبر باید بین ۲ تا ۸۰ کاراکتر باشد.");
  return name;
}

export function getSourceAlertWeekRange(now = new Date()) {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

export function buildSourceLowEngagementCandidates(input: {
  posts: Array<{ id: number; sourceName: string; deliveryStatus: string }>;
  engagement: Array<{ publisherPostId: number; reactionCount: number }>;
  audienceSize: number;
  configs: Array<{ sourceName: string; isEnabled: boolean; lowEngagementRateBps: number }>;
}) {
  const configBySource = new Map(input.configs.filter(config => config.isEnabled).map(config => [config.sourceName, config]));
  return buildSourceEngagementComparison(input.posts, input.engagement, input.audienceSize)
    .map(source => ({ ...source, thresholdBps: configBySource.get(source.sourceName)?.lowEngagementRateBps ?? null }))
    .filter((source): source is typeof source & { thresholdBps: number } => source.thresholdBps !== null && source.deliveredPosts >= 2 && source.averageEngagementRateBps !== null && source.averageEngagementRateBps < source.thresholdBps);
}

export function summarizeTelegramReactions(reactions: NonNullable<NonNullable<TelegramReactionUpdate["message_reaction_count"]>["reactions"]>) {
  return reactions.map(reaction => ({
    reaction: reaction.type?.emoji ?? (reaction.type?.type === "custom_emoji" ? "custom_emoji" : reaction.type?.type ?? "unknown"),
    count: Math.max(0, reaction.total_count ?? 0),
  }));
}

export function getCompletedWeekRange(now = new Date()) {
  const end = new Date(now);
  end.setUTCHours(0, 0, 0, 0);
  const daysSinceMonday = (end.getUTCDay() + 6) % 7;
  end.setUTCDate(end.getUTCDate() - daysSinceMonday);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);
  return { start, end };
}

export function buildWeeklyReportMarkdown(input: { periodStart: Date; periodEnd: Date; posts: Array<Pick<PublisherPost, "deliveryStatus" | "sourceName" | "postKind">>; engagement: Array<{ publisherPostId: number; reactionCount: number }> }) {
  const delivered = input.posts.filter(post => post.deliveryStatus === "delivered");
  const failed = input.posts.filter(post => post.deliveryStatus === "failed");
  const attempted = delivered.length + failed.length;
  const reactions = input.engagement.reduce((total, record) => total + record.reactionCount, 0);
  const sources = new Map<string, number>();
  delivered.forEach(post => sources.set(post.sourceName, (sources.get(post.sourceName) ?? 0) + 1));
  const sourceLines = Array.from(sources.entries()).sort((a, b) => b[1] - a[1]).map(([name, count]) => `- ${name}: ${count} پست`).join("\n") || "- داده‌ای برای این بازه ثبت نشده است.";
  const deliveryRate = attempted ? Math.round((delivered.length / attempted) * 100) : null;
  return `# گزارش هفتگی عملکرد ناشر

**بازه:** ${input.periodStart.toISOString().slice(0, 10)} تا ${input.periodEnd.toISOString().slice(0, 10)}

## انتشار

- پست‌های تحویل‌شده: ${delivered.length}
- خطاهای تحویل: ${failed.length}
- نرخ تحویل: ${deliveryRate === null ? "—" : `${deliveryRate}%`}
- خبر منبع‌محور: ${delivered.filter(post => post.postKind === "source").length}
- توضیح تحلیلی: ${delivered.filter(post => post.postKind === "explainer").length}

## تعامل تلگرام

- مجموع واکنش‌های ثبت‌شده: ${reactions}
- پست‌های دارای دادهٔ واکنش: ${input.engagement.length}

> این گزارش فقط واکنش‌های قابل‌دریافت از طریق Bot API را پوشش می‌دهد؛ بازدید، فوروارد و آمار کامل مخاطب در دسترس این اتصال نیست.

## منابع پربازده

${sourceLines}
`;
}

export function selectLatestWeeklyReport<T extends { generatedAt: Date }>(reports: T[]) {
  return reports.reduce<T | null>((latest, report) => !latest || report.generatedAt > latest.generatedAt ? report : latest, null);
}

export function buildTelegramRecipientCode() {
  return `VS-${randomUUID().replace(/-/g, "").slice(0, 14).toUpperCase()}`;
}

export async function isValidTelegramRecipientCode(input: { code: string; codeHash: string | null; expiresAt: Date | null; now?: Date }) {
  const hash = await hashText(input.code.trim().toUpperCase());
  return Boolean(input.codeHash && input.expiresAt && input.expiresAt > (input.now ?? new Date()) && input.codeHash === hash);
}

export function canDeliverWeeklyReport(deliveryEnabled: boolean, recipientChatId: string | null) {
  return deliveryEnabled && Boolean(recipientChatId?.trim());
}

export function buildWeeklyReportDeliveryUpdate(error?: unknown, now = new Date()) {
  if (!error) return { deliveredToOwnerAt: now, deliveryError: null };
  const message = error instanceof Error ? error.message : String(error);
  return { deliveryError: message.slice(0, 4000) };
}
