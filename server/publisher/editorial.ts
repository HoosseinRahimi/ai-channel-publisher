import { createHash, randomUUID } from "crypto";
import type { PublisherPost, PublisherSource } from "../../drizzle/schema";
import { draftFallbackTitle, keyPointsHeading, impactHeading, PERSIAN_EDITORIAL_PROMPT, type PostLanguage } from "./languages";

export const DEFAULT_CHANNEL_HANDLE = "@your_channel";
export const PUBLISH_CRON = "0 0 */3 * * *";
export const DRAFT_CRON = "0 30 2-23/3 * * *";
export const WEEKLY_REPORT_CRON = "0 0 8 * * 1";
export const ENGAGEMENT_ALERT_CRON = "0 0 10 * * *";
/** Backwards-compatible alias; the live prompt is built per language in ./languages.ts. */
export const PERSIAN_EDITORIAL_SYSTEM_PROMPT = PERSIAN_EDITORIAL_PROMPT;

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
  imageUrl?: string;
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

export function hashText(input: string) {
  return createHash("sha256").update(input).digest("hex");
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

export function telegramChannelSetupError(channelHandle: string, detail?: string) {
  const suffix = detail ? ` Telegram details: ${detail}` : "";
  return `The bot cannot post to ${channelHandle} yet. In Telegram, open Channel Info → Administrators, add the bot as an administrator and enable Post Messages, then try the test post again.${suffix}`;
}

function normalizeHttpUrl(value: string, label: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Unsupported protocol");
    return url.toString();
  } catch {
    throw new Error(`${label} must be a valid http or https URL.`);
  }
}

export function normalizeChannelHandle(value: string) {
  const handle = value.trim();
  if (!/^@[A-Za-z0-9_]{4,64}$/.test(handle)) {
    throw new Error("Channel handle must look like @your_channel (5–65 characters, letters/digits/underscores).");
  }
  return handle;
}

export function normalizeEditorialGuidance(value: string | null | undefined, label = "Tone guidance") {
  const normalized = value?.trim() ?? "";
  if (normalized.length > 2000) throw new Error(`${label} must be at most 2000 characters.`);
  return normalized || null;
}

export function validatePublisherSource(input: SourceInput): SourceInput {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 160) throw new Error("Source name must be between 2 and 160 characters.");
  return {
    name,
    homepage: normalizeHttpUrl(input.homepage, "Source homepage URL"),
    feedUrl: input.feedUrl?.trim() ? normalizeHttpUrl(input.feedUrl, "Feed URL") : null,
    sourceKind: input.sourceKind,
    isActive: input.isActive ?? true,
  };
}

export type RenderPostOptions = {
  language: PostLanguage;
  channelHandle: string;
  signature?: string | null;
};

export function postSignature(options: RenderPostOptions) {
  const custom = options.signature?.trim();
  return custom && custom.length > 0 ? custom : `📢 ${options.channelHandle}`;
}

export function renderChannelPost(post: GeneratedPost, candidate: NewsCandidate, options: RenderPostOptions) {
  const keyPoints = post.keyPoints.slice(0, 3).map(point => `- ${point.trim()}`).join("\n");
  const body = `⚡️ ${post.headline.trim()}\n\n${post.summary.trim()}\n\n${keyPointsHeading(options.language)}\n\n${keyPoints}\n\n${impactHeading(options.language)} ${post.realWorldImpact.trim()}\n\n${candidate.sourceName} (${candidate.url})\n\n────────────────\n${postSignature(options)}`;
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
  callback_query?: {
    id: string;
    from?: { id?: number; username?: string };
    data?: string;
    message?: { chat?: { id?: number | string }; message_id?: number };
  };
};

export function normalizeEngagementThresholdBps(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 5000) throw new Error("Engagement threshold must be between 0.01% and 50%.");
  return value;
}

export function calculateEngagementRateBps(reactionCount: number, audienceSize: number) {
  return audienceSize > 0 ? Math.round((Math.max(0, reactionCount) / audienceSize) * 10000) : null;
}

export function isLowEngagement(reactionCount: number, audienceSize: number, thresholdBps: number) {
  const rate = calculateEngagementRateBps(reactionCount, audienceSize);
  return rate !== null && rate < thresholdBps;
}

export function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&(?:apos|#39|#x27);/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, dec) => {
      const num = parseInt(dec, 10);
      return !isNaN(num) && num > 0 && num < 65536 ? String.fromCharCode(num) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const num = parseInt(hex, 16);
      return !isNaN(num) && num > 0 && num < 65536 ? String.fromCharCode(num) : "";
    });
}

export function stripMarkup(value: string) {
  const stripped = value.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return decodeXmlEntities(stripped);
}

function absoluteUrl(baseUrl: string, value: string) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

export function extractCandidates(source: PublisherSource, raw: string): NewsCandidate[] {
  const items: Array<{ title: string; url: string; imageUrl?: string }> = [];
  const itemBlocks = raw.match(/<(?:item|entry)\b[^>]*>[\s\S]*?<\/(?:item|entry)>/gi) ?? [];
  for (const block of itemBlocks) {
    const title = stripMarkup((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? [])[1] ?? "");
    
    // In Atom/RSS feeds, link might be:
    // <link rel="alternate" href="..." /> or <link>...</link> or <link href="..." />
    // Prefer non-self link href
    let href = "";
    const linkMatches = Array.from(block.matchAll(/<link\b([^>]*?)(?:\/>|>([\s\S]*?)<\/link>)/gi));
    for (const match of linkMatches) {
      const attrs = match[1] || "";
      const textContent = (match[2] || "").trim();
      const hrefAttr = (attrs.match(/\bhref=["']([^"']+)["']/i) ?? [])[1];
      const relAttr = (attrs.match(/\brel=["']([^"']+)["']/i) ?? [])[1];
      if (relAttr === "self" || relAttr === "hub") continue;
      if (hrefAttr) {
        href = hrefAttr;
        break;
      }
      if (textContent && /^https?:\/\//i.test(textContent)) {
        href = textContent;
        break;
      }
    }
    if (!href) {
      href = (block.match(/<link[^>]+href=["']([^"']+)["']/i) ?? [])[1]
        ?? stripMarkup((block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) ?? [])[1] ?? "");
    }

    const url = absoluteUrl(source.homepage, href);

    // Extract image if available (<enclosure>, <media:content>, <media:thumbnail>)
    const imageMatch = block.match(/<(?:enclosure|media:content|media:thumbnail)[^>]+url=["']([^"']+)["']/i);
    const rawImageUrl = imageMatch ? imageMatch[1] : undefined;
    const imageUrl = rawImageUrl ? absoluteUrl(source.homepage, rawImageUrl) ?? undefined : undefined;

    if (title.length > 12 && url) items.push({ title, url, imageUrl });
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

export function titleFromContent(content: string, language: PostLanguage = "fa") {
  return content.replace(/^⚡️?\s*/, "").split("\n")[0]?.trim().slice(0, 512) || draftFallbackTitle(language);
}

export function isReviewableDraftStatus(status: PublisherPost["deliveryStatus"]) {
  return status === "draft" || status === "held";
}

export function isPublishedHistoryStatus(status: PublisherPost["deliveryStatus"]) {
  return status === "delivered";
}

export function normalizeEditedDraftContent(content: string, signature: string) {
  const trimmed = content.trim();
  if (trimmed.length < 30 || trimmed.length > 4000) throw new Error("Post content must be between 30 and 4000 characters.");
  return trimmed.includes(signature) ? trimmed : `${trimmed}\n\n${signature}`;
}

export function canAutoPublishDraft(status: PublisherPost["deliveryStatus"], scheduledFor: Date | null, now = new Date()) {
  return status === "draft" && Boolean(scheduledFor && scheduledFor <= now);
}
