import type { PublisherPost, PublisherSource } from "../schema";
import { randomUUID, sha256HexAsync } from "../_core/crypto";

export const CHANNEL_HANDLE = "@VerborgeneSchicht";
const PERSIAN_SIGNATURE = "📢 @VerborgeneSchicht";
// Cloudflare Workers Cron Triggers use standard five-field cron syntax:
// minute hour day-of-month month day-of-week.
export const PUBLISH_CRON = "0 */3 * * *";
export const DRAFT_CRON = "30 2-23/3 * * *";
export const WEEKLY_REPORT_CRON = "0 8 * * 1";
export const ENGAGEMENT_ALERT_CRON = "0 10 * * *";
export const PERSIAN_EDITORIAL_SYSTEM_PROMPT = `شما نویسندهٔ یک کانال تلگرامی فارسی دربارهٔ هوش مصنوعی و فناوری هستید. با لحن محاوره‌ایِ حرفه‌ای، سریع، خبرمحور و خوش‌خوان بنویسید؛ طوری که متن برای تلگرام فارسی نوشته شده باشد، نه ترجمه‌ای تحت‌اللفظی از انگلیسی. خبر را مستقیم و با مهم‌ترین اتفاق شروع کنید؛ از توضیح‌های مقدماتی، لحن خشک شرکتی، کلیشه‌های تبلیغاتی، بزرگ‌نمایی، تکرار بی‌دلیل نام محصول یا منبع و جمله‌های طولانی پرهیز کنید. تیتر باید کوتاه، جذاب و دقیق باشد، نه کلیک‌طعمه. خلاصه باید بگوید چه چیزی تغییر کرده و برای کاربر چه معنایی دارد. نکات کلیدی را کوتاه، قابل‌فهم و متفاوت بنویسید. بخش پایانی باید در یک یا دو جمله با «خلاصه» به اثر یا کاربرد عملی خبر برسد. اگر ادعا فقط از طرف شرکت مطرح شده است، آن را به همان شرکت نسبت دهید. فقط فارسی بنویسید و هیچ واقعیت تأییدنشده‌ای نسازید. از «تازه»، «رونمایی شد»، درصدها یا مقایسه‌های سرعت فقط وقتی استفاده کنید که در منبع آمده باشد. عنوان‌های بخش، ایموجی‌های ساختاری، لینک و امضای کانال را ننویسید؛ رابط انتشار آن‌ها را اضافه می‌کند.`;

export const DEFAULT_SOURCES = [
  { name: "OpenAI News", homepage: "https://openai.com/news/", feedUrl: "https://openai.com/news/rss.xml", sourceKind: "primary" as const },
  { name: "Anthropic Newsroom", homepage: "https://www.anthropic.com/news", feedUrl: null, sourceKind: "primary" as const },
  { name: "Google DeepMind", homepage: "https://deepmind.google/discover/blog/", feedUrl: null, sourceKind: "primary" as const },
  { name: "Microsoft AI", homepage: "https://blogs.microsoft.com/ai/", feedUrl: null, sourceKind: "primary" as const },
  { name: "NVIDIA AI", homepage: "https://blogs.nvidia.com/blog/category/generative-ai/", feedUrl: null, sourceKind: "primary" as const },
  { name: "TechCrunch AI", homepage: "https://techcrunch.com/category/artificial-intelligence/", feedUrl: null, sourceKind: "third_party" as const },
];

export type NewsCandidate = {
  title: string;
  url: string;
  sourceName: string;
  sourceKind: "primary" | "third_party";
  sourceText?: string;
};

export type GeneratedPost = {
  headline: string;
  summary: string;
  keyPoints: string[];
  realWorldImpact: string;
};

export type SourceInput = {
  name: string;
  homepage: string;
  feedUrl?: string | null;
  sourceKind: "primary" | "third_party";
  isActive?: boolean;
};

export async function hashText(input: string): Promise<string> {
  return sha256HexAsync(input);
}

export function normalizeTopic(input: string) {
  return input
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\u0600-\u06FFa-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export function matchesDuplicate(
  existing: Array<{ sourceUrlHash: string | null; normalizedTopic: string; contentFingerprint: string }>,
  keys: { sourceUrlHash?: string; normalizedTopic?: string; contentFingerprint?: string }
) {
  return existing.some(post =>
    (Boolean(keys.sourceUrlHash) && post.sourceUrlHash === keys.sourceUrlHash)
    || (Boolean(keys.normalizedTopic) && post.normalizedTopic === keys.normalizedTopic)
    || (Boolean(keys.contentFingerprint) && post.contentFingerprint === keys.contentFingerprint)
  );
}

export function buildRunKey(options: { isTest: boolean; taskUid?: string; now?: number }) {
  if (options.isTest) return `manual-${randomUUID()}`;
  return `${options.taskUid ?? "schedule"}-${Math.floor((options.now ?? Date.now()) / (3 * 60 * 60 * 1000))}`;
}

export function telegramChannelSetupError(detail?: string) {
  const suffix = detail ? ` جزئیات تلگرام: ${detail}` : "";
  return `ربات هنوز اجازهٔ ارسال به ${CHANNEL_HANDLE} ندارد. در تلگرام به Channel Info → Administrators بروید، ربات را Add Administrator کنید و دسترسی Post Messages را فعال کنید؛ سپس دوباره پست آزمایشی را بزنید.${suffix}`;
}

function normalizeHttpUrl(value: string, label: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Unsupported protocol");
    if (isPrivateNetworkHost(url.hostname) && process.env.ALLOW_PRIVATE_NETWORK_URLS !== "true") throw new Error("Private network URLs require explicit opt-in");
    return url.toString();
  } catch {
    throw new Error(`${label} باید یک نشانی معتبر http یا https باشد.`);
  }
}

function isPrivateNetworkHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "::1" || host === "0.0.0.0" || host.startsWith("127.") || host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("169.254.") || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
}

export function normalizeEditorialGuidance(value: string | null | undefined, label = "راهنمای لحن") {
  const normalized = value?.trim() ?? "";
  if (normalized.length > 2000) throw new Error(`${label} حداکثر ۲۰۰۰ کاراکتر است.`);
  return normalized || null;
}

export function validatePublisherSource(input: SourceInput): SourceInput {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 160) throw new Error("نام منبع باید بین ۲ تا ۱۶۰ کاراکتر باشد.");
  return {
    name,
    homepage: normalizeHttpUrl(input.homepage, "نشانی صفحهٔ منبع"),
    feedUrl: input.feedUrl?.trim() ? normalizeHttpUrl(input.feedUrl, "نشانی فید") : null,
    sourceKind: input.sourceKind,
    isActive: input.isActive ?? true,
  };
}

export function renderPersianPost(post: GeneratedPost, candidate: NewsCandidate) {
  const keyPoints = post.keyPoints.slice(0, 3).map(point => `- ${point.trim()}`).join("\n");
  const body = `⚡️ ${post.headline.trim()}\n\n${post.summary.trim()}\n\nنکته‌های مهم:\n\n${keyPoints}\n\nخلاصه: ${post.realWorldImpact.trim()}\n\n${candidate.sourceName} (${candidate.url})\n\n────────────────\n${PERSIAN_SIGNATURE}`;
  return body.slice(0, 4000);
}

export type TelegramReactionUpdate = {
  message_reaction_count?: {
    chat?: { username?: string | null };
    message_id?: number;
    date?: number;
    reactions?: Array<{ type?: { type?: string; emoji?: string; custom_emoji_id?: string }; total_count?: number }>;
  };
};

export type TelegramWebhookUpdate = TelegramReactionUpdate & {
  message?: { chat?: { id?: number | string }; text?: string };
};

export function allowsScheduledPublisherRun(isEnabled: boolean, isManual = false) {
  return isManual || isEnabled;
}

export function normalizeEngagementThresholdBps(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 5000) throw new Error("آستانهٔ تعامل باید بین ۰٫۰۱ تا ۵۰ درصد باشد.");
  return value;
}

export function calculateEngagementRateBps(reactionCount: number, audienceSize: number) {
  return audienceSize > 0 ? Math.round((Math.max(0, reactionCount) / audienceSize) * 10000) : null;
}

export function isLowEngagement(reactionCount: number, audienceSize: number, thresholdBps: number) {
  const rate = calculateEngagementRateBps(reactionCount, audienceSize);
  return rate !== null && rate < thresholdBps;
}

export function stripMarkup(value: string) {
  return value.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function absoluteUrl(baseUrl: string, value: string) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

export function extractCandidates(source: PublisherSource, raw: string): NewsCandidate[] {
  const items: Array<{ title: string; url: string }> = [];
  const itemBlocks = raw.match(/<(?:item|entry)\b[^>]*>[\s\S]*?<\/(?:item|entry)>/gi) ?? [];
  for (const block of itemBlocks) {
    const title = stripMarkup((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? [])[1] ?? "");
    const href = (block.match(/<link[^>]+href=["']([^"']+)["']/i) ?? [])[1]
      ?? stripMarkup((block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) ?? [])[1] ?? "");
    const url = absoluteUrl(source.homepage, href);
    if (title.length > 12 && url) items.push({ title, url });
  }

  if (!items.length) {
    const anchors = Array.from(raw.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi));
    for (const anchor of anchors) {
      const url = absoluteUrl(source.homepage, anchor[1]);
      const title = stripMarkup(anchor[2]);
      if (!url || title.length < 18 || title.length > 280) continue;
      if (/^(home|news|research|products|company|learn more|all|rss)$/i.test(title)) continue;
      items.push({ title, url });
    }
  }

  return Array.from(new Map(items.map(item => [item.url, item])).values()).slice(0, 12).map(item => ({
    ...item,
    sourceName: source.name,
    sourceKind: source.sourceKind,
  }));
}

export function nextThreeHourBoundary(now = new Date()) {
  const cycle = 3 * 60 * 60 * 1000;
  return new Date(Math.ceil(now.getTime() / cycle) * cycle);
}

export function titleFromContent(content: string) {
  return content.replace(/^⚡️?\s*/, "").split("\n")[0]?.trim().slice(0, 512) || "پیش‌نویس خبر";
}

export function isReviewableDraftStatus(status: PublisherPost["deliveryStatus"]) {
  return status === "draft" || status === "held";
}

export function isPublishedHistoryStatus(status: PublisherPost["deliveryStatus"]) {
  return status === "delivered";
}

export function normalizeEditedDraftContent(content: string) {
  const trimmed = content.trim();
  if (trimmed.length < 30 || trimmed.length > 4000) throw new Error("متن پست باید بین ۳۰ تا ۴۰۰۰ کاراکتر باشد.");
  return trimmed.includes(PERSIAN_SIGNATURE) ? trimmed : `${trimmed}\n\n${PERSIAN_SIGNATURE}`;
}

export function canAutoPublishDraft(status: PublisherPost["deliveryStatus"], scheduledFor: Date | null, now = new Date()) {
  return status === "draft" && Boolean(scheduledFor && scheduledFor <= now);
}
