import { describe, expect, it } from "vitest";
import { buildDailySourcePerformanceTrend, buildEngagementAnalytics, buildPublisherAnalytics, buildRunKey, buildSourceEngagementComparison, buildSourceLowEngagementCandidates, buildTelegramRecipientCode, buildWeeklyReportDeliveryUpdate, buildWeeklyReportMarkdown, calculateEngagementRateBps, canAutoPublishDraft, canDeliverWeeklyReport, DRAFT_CRON, getCompletedWeekRange, getSourceAlertWeekRange, hashText, isLowEngagement, isPublishedHistoryStatus, isReviewableDraftStatus, isTelegramEngagementConfigured, isValidTelegramRecipientCode, isValidTelegramTokenConfigured, isValidTelegramWebhookSecret, matchesDuplicate, normalizeAnalyticsPresetName, normalizeEditedDraftContent, normalizeEditorialGuidance, normalizeEngagementThresholdBps, normalizeSourcePerformanceFilters, normalizeTopic, outputMatchesLanguage, PERSIAN_EDITORIAL_SYSTEM_PROMPT, PUBLISH_CRON, renderChannelPost, selectLatestWeeklyReport, summarizeTelegramReactions, telegramChannelSetupError, titleFromContent, validatePublisherSource, WEEKLY_REPORT_CRON } from "./publisher";

describe("publisher utilities", () => {
  it("normalizes a topic deterministically for duplicate checks", () => {
    expect(normalizeTopic("NVIDIA launches Agent Platform! https://example.com/x")).toBe("nvidia launches agent platform");
    expect(hashText("same")).toBe(hashText("same"));
  });

  it("renders a structured post in the channel's language with the channel signature", () => {
    const post = renderChannelPost({
      headline: "رونمایی از یک ابزار جدید هوش مصنوعی",
      summary: "این خبر یک قابلیت تازه را معرفی می‌کند.",
      keyPoints: ["نکته اول", "نکته دوم", "نکته سوم"],
      realWorldImpact: "این تغییر می‌تواند مسیر استفاده عملی را ساده‌تر کند.",
    }, {
      title: "Example",
      url: "https://example.com/news",
      sourceName: "Example Source",
      sourceKind: "primary",
    }, { language: "fa", channelHandle: "@TestChannel" });
    expect(post).toContain("نکته‌های مهم:");
    expect(post).toContain("خلاصه:");
    expect(post).toContain("📢 @TestChannel");
    expect(post).toContain("https://example.com/news");
    const english = renderChannelPost({
      headline: "A new AI tool arrives",
      summary: "The update introduces a fresh capability.",
      keyPoints: ["One", "Two", "Three"],
      realWorldImpact: "It can simplify practical adoption.",
    }, {
      title: "Example",
      url: "https://example.com/news",
      sourceName: "Example Source",
      sourceKind: "primary",
    }, { language: "en", channelHandle: "@TestChannel" });
    expect(english).toContain("Key points:");
    expect(english).toContain("Bottom line:");
    expect(english).toContain("📢 @TestChannel");
    const german = renderChannelPost({
      headline: "Ein neues KI-Tool",
      summary: "Das Update bringt eine neue Funktion.",
      keyPoints: ["Eins", "Zwei", "Drei"],
      realWorldImpact: "Es kann die Nutzung vereinfachen.",
    }, {
      title: "Example",
      url: "https://example.com/news",
      sourceName: "Example Source",
      sourceKind: "primary",
    }, { language: "de", channelHandle: "@TestChannel", signature: "📢 @MeinKanal" });
    expect(german).toContain("Wichtigste Punkte:");
    expect(german).toContain("Kurz gesagt:");
    expect(german).toContain("📢 @MeinKanal");
  });

  it("validates generated output against the configured language script", () => {
    expect(outputMatchesLanguage("این یک متن فارسی است", "fa")).toBe(true);
    expect(outputMatchesLanguage("This is English text", "fa")).toBe(false);
    expect(outputMatchesLanguage("This is English text", "en")).toBe(true);
    expect(outputMatchesLanguage("Dies ist deutscher Text", "de")).toBe(true);
    expect(outputMatchesLanguage("این یک متن فارسی است", "en")).toBe(false);
    expect(outputMatchesLanguage("ANYthing…!?", "custom")).toBe(true);
  });

  it("uses a six-field schedule that runs at the beginning of every third UTC hour", () => {
    expect(PUBLISH_CRON).toBe("0 0 */3 * * *");
    expect(PUBLISH_CRON.trim().split(/\s+/)).toHaveLength(6);
  });

  it("only reports a token as configured when the server environment contains it", () => {
    const previous = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(isValidTelegramTokenConfigured()).toBe(false);
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    expect(isValidTelegramTokenConfigured()).toBe(true);
    if (previous === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = previous;
  });

  it("identifies duplicates by source URL, normalized topic, or final content fingerprint", () => {
    const published = [{ sourceUrlHash: "url-hash", normalizedTopic: "agent platform", contentFingerprint: "content-hash" }];
    expect(matchesDuplicate(published, { sourceUrlHash: "url-hash" })).toBe(true);
    expect(matchesDuplicate(published, { normalizedTopic: "agent platform" })).toBe(true);
    expect(matchesDuplicate(published, { contentFingerprint: "content-hash" })).toBe(true);
    expect(matchesDuplicate(published, { sourceUrlHash: "new-url", normalizedTopic: "new topic", contentFingerprint: "new-content" })).toBe(false);
  });

  it("creates one deterministic run key per scheduled three-hour slot", () => {
    const first = buildRunKey({ isTest: false, taskUid: "task-1", now: 10_800_000 });
    const retry = buildRunKey({ isTest: false, taskUid: "task-1", now: 10_800_001 });
    const next = buildRunKey({ isTest: false, taskUid: "task-1", now: 21_600_000 });
    expect(first).toBe(retry);
    expect(next).not.toBe(first);
  });

  it("turns Telegram channel permission failures into a useful setup instruction", () => {
    const message = telegramChannelSetupError("@TestChannel", "Forbidden: bot is not a member of the channel chat");
    expect(message).toContain("@TestChannel");
    expect(message).toContain("Administrators");
    expect(message).toContain("Post Messages");
  });

  it("defines a natural Persian editorial voice without instructing the model to repeat UI headings", () => {
    expect(PERSIAN_EDITORIAL_SYSTEM_PROMPT).toContain("ترجمه‌ای تحت‌اللفظی");
    expect(PERSIAN_EDITORIAL_SYSTEM_PROMPT).toContain("عنوان‌های بخش، ایموجی‌های ساختاری، لینک و امضای کانال را ننویسید");
    expect(PERSIAN_EDITORIAL_SYSTEM_PROMPT).toContain("هیچ واقعیت تأییدنشده‌ای نسازید");
    expect(PERSIAN_EDITORIAL_SYSTEM_PROMPT).toContain("محاوره‌ایِ حرفه‌ای");
  });

  it("normalizes an edited draft with the required channel signature and safe title", () => {
    const content = normalizeEditedDraftContent("این یک متن فارسیِ قابل‌ویرایش برای بررسی پیش از انتشار در کانال است.", "📢 @TestChannel");
    expect(content).toContain("📢 @TestChannel");
    expect(titleFromContent("⚡️ تیتر طبیعی\n\nمتن")).toBe("تیتر طبیعی");
    expect(titleFromContent("", "en")).toBe("Draft post");
    expect(titleFromContent("", "de")).toBe("News-Entwurf");
  });

  it("only auto-publishes an unheld draft after its scheduled review deadline", () => {
    const now = new Date("2026-08-13T18:00:00.000Z");
    expect(DRAFT_CRON).toBe("0 30 2-23/3 * * *");
    expect(isReviewableDraftStatus("draft")).toBe(true);
    expect(isReviewableDraftStatus("delivered")).toBe(false);
    expect(canAutoPublishDraft("draft", new Date("2026-08-13T17:59:59.000Z"), now)).toBe(true);
    expect(canAutoPublishDraft("held", new Date("2026-08-13T17:59:59.000Z"), now)).toBe(false);
  });

  it("keeps review drafts out of the published-history filter", () => {
    expect(isPublishedHistoryStatus("delivered")).toBe(true);
    expect(isPublishedHistoryStatus("draft")).toBe(false);
    expect(isPublishedHistoryStatus("held")).toBe(false);
    expect(isPublishedHistoryStatus("discarded")).toBe(false);
  });

  it("renders the concise channel-style summary, source line, divider, and signature", () => {
    const rendered = renderChannelPost({
      headline: "یک ابزار تازه برای توسعه‌دهنده‌ها",
      summary: "این آپدیت کار شروع پروژه‌های تعاملی را ساده‌تر می‌کند.",
      keyPoints: ["بدون نیاز به مراحل اضافی", "خروجی قابل ویرایش", "تمرکز بر سرعت"],
      realWorldImpact: "برای ساخت نمونهٔ اولیه می‌تواند زمان شروع کار را کم کند.",
    }, { title: "نمونه", url: "https://example.com/news", sourceName: "Example AI", sourceKind: "primary" }, { language: "fa", channelHandle: "@TestChannel" });
    expect(rendered).toContain("نکته‌های مهم:");
    expect(rendered).toContain("خلاصه:");
    expect(rendered).toContain("Example AI (https://example.com/news)");
    expect(rendered).toContain("────────────────");
  });

  it("normalizes editorial feedback and validates a managed source", () => {
    expect(normalizeEditorialGuidance("  تیترها کوتاه‌تر باشند.  ")).toBe("تیترها کوتاه‌تر باشند.");
    expect(normalizeEditorialGuidance("   ")).toBeNull();
    expect(() => normalizeEditorialGuidance("x".repeat(2001))).toThrow("at most 2000");
    expect(validatePublisherSource({
      name: "  Example Source ",
      homepage: "https://example.com/news",
      feedUrl: "https://example.com/feed.xml",
      sourceKind: "third_party",
    })).toMatchObject({ name: "Example Source", sourceKind: "third_party", isActive: true });
    expect(() => validatePublisherSource({ name: "X", homepage: "invalid", sourceKind: "primary" })).toThrow("Source name");
  });

  it("aggregates delivery reliability, daily activity, source performance, and post type metrics", () => {
    const analytics = buildPublisherAnalytics([
      { createdAt: new Date("2026-08-12T08:00:00.000Z"), deliveryStatus: "delivered" as const, sourceName: "OpenAI News", postKind: "source" as const, publishedAt: new Date("2026-08-12T08:02:00.000Z") },
      { createdAt: new Date("2026-08-13T08:00:00.000Z"), deliveryStatus: "failed" as const, sourceName: "OpenAI News", postKind: "source" as const, publishedAt: null },
      { createdAt: new Date("2026-08-13T09:00:00.000Z"), deliveryStatus: "delivered" as const, sourceName: "Anthropic Newsroom", postKind: "explainer" as const, publishedAt: new Date("2026-08-13T09:01:00.000Z") },
      { createdAt: new Date("2026-08-13T10:00:00.000Z"), deliveryStatus: "draft" as const, sourceName: "NVIDIA AI", postKind: "source" as const, publishedAt: null },
    ], new Date("2026-08-13T12:00:00.000Z"));
    expect(analytics.totals).toMatchObject({ delivered: 2, failed: 1, pendingReview: 1, attempted: 3, deliveryRate: 67 });
    expect(analytics.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceName: "Anthropic Newsroom", delivered: 1 }),
      expect.objectContaining({ sourceName: "OpenAI News", delivered: 1, failed: 1 }),
    ]));
    expect(analytics.postKinds).toEqual([{ kind: "source", count: 1 }, { kind: "explainer", count: 1 }]);
    expect(analytics.daily.find(day => day.date === "2026-08-13")).toMatchObject({ delivered: 1, failed: 1, drafts: 1 });
  });

  it("aggregates Telegram reaction counts without claiming unsupported view data", () => {
    expect(buildEngagementAnalytics([{ reactionCount: 4, lastReactionAt: new Date("2026-08-13T10:00:00.000Z") }, { reactionCount: 2, lastReactionAt: null }])).toMatchObject({ trackedPosts: 2, totalReactions: 6, averageReactions: 3 });
    expect(summarizeTelegramReactions([{ type: { type: "emoji", emoji: "🔥" }, total_count: 3 }, { type: { type: "custom_emoji" }, total_count: 1 }])).toEqual([{ reaction: "🔥", count: 3 }, { reaction: "custom_emoji", count: 1 }]);
  });

  it("compares real source-level Telegram engagement and selects the newest report deterministically", () => {
    const comparison = buildSourceEngagementComparison([
      { id: 1, sourceName: "OpenAI News", deliveryStatus: "delivered" },
      { id: 2, sourceName: "OpenAI News", deliveryStatus: "delivered" },
      { id: 3, sourceName: "Anthropic Newsroom", deliveryStatus: "delivered" },
      { id: 4, sourceName: "Ignored", deliveryStatus: "failed" },
    ], [{ publisherPostId: 1, reactionCount: 8 }, { publisherPostId: 2, reactionCount: 2 }, { publisherPostId: 3, reactionCount: 7 }], 1000);
    expect(comparison[0]).toMatchObject({ sourceName: "OpenAI News", deliveredPosts: 2, trackedPosts: 2, totalReactions: 10, averageReactions: 5, averageEngagementRateBps: 50 });
    expect(comparison[1]).toMatchObject({ sourceName: "Anthropic Newsroom", deliveredPosts: 1, trackedPosts: 1, totalReactions: 7, averageReactions: 7, averageEngagementRateBps: 70 });
    expect(selectLatestWeeklyReport([{ id: 1, generatedAt: new Date("2026-08-04") }, { id: 2, generatedAt: new Date("2026-08-11") }])).toMatchObject({ id: 2 });
    expect(selectLatestWeeklyReport([])).toBeNull();
  });

  it("flags only configured sources with enough mature posts below their source-specific engagement threshold", () => {
    const candidates = buildSourceLowEngagementCandidates({
      posts: [
        { id: 1, sourceName: "OpenAI News", deliveryStatus: "delivered" },
        { id: 2, sourceName: "OpenAI News", deliveryStatus: "delivered" },
        { id: 3, sourceName: "Anthropic Newsroom", deliveryStatus: "delivered" },
        { id: 4, sourceName: "Anthropic Newsroom", deliveryStatus: "delivered" },
      ],
      engagement: [{ publisherPostId: 1, reactionCount: 1 }, { publisherPostId: 2, reactionCount: 1 }, { publisherPostId: 3, reactionCount: 10 }, { publisherPostId: 4, reactionCount: 10 }],
      audienceSize: 1000,
      configs: [{ sourceName: "OpenAI News", isEnabled: true, lowEngagementRateBps: 20 }, { sourceName: "Anthropic Newsroom", isEnabled: false, lowEngagementRateBps: 300 }],
    });
    expect(candidates).toEqual([expect.objectContaining({ sourceName: "OpenAI News", deliveredPosts: 2, totalReactions: 2, averageEngagementRateBps: 10, thresholdBps: 20 })]);
    expect(getSourceAlertWeekRange(new Date("2026-08-13T12:00:00.000Z"))).toMatchObject({ start: new Date("2026-08-10T00:00:00.000Z"), end: new Date("2026-08-17T00:00:00.000Z") });
  });

  it("normalizes source-specific performance dates to inclusive UTC day boundaries", () => {
    expect(normalizeSourcePerformanceFilters({ sourceName: "  OpenAI News  ", from: "2026-08-01", to: "2026-08-07" })).toEqual({ sourceName: "OpenAI News", from: new Date("2026-08-01T00:00:00.000Z"), to: new Date("2026-08-07T23:59:59.999Z") });
    expect(() => normalizeSourcePerformanceFilters({ from: "2026-08-08", to: "2026-08-07" })).toThrow("start date");
    expect(() => normalizeSourcePerformanceFilters({ from: "08/01/2026" })).toThrow("YYYY-MM-DD");
  });

  it("builds a sorted daily trend from the selected performance posts and normalizes saved preset names", () => {
    expect(buildDailySourcePerformanceTrend([
      { id: 1, publishedAt: new Date("2026-08-03T09:00:00.000Z") },
      { id: 2, publishedAt: new Date("2026-08-02T09:00:00.000Z") },
      { id: 3, publishedAt: new Date("2026-08-03T12:00:00.000Z") },
    ], [{ publisherPostId: 1, reactionCount: 4 }, { publisherPostId: 2, reactionCount: 2 }, { publisherPostId: 3, reactionCount: 6 }], 1000)).toEqual([
      { date: "2026-08-02", deliveredPosts: 1, totalReactions: 2, averageReactions: 2, averageEngagementRateBps: 20 },
      { date: "2026-08-03", deliveredPosts: 2, totalReactions: 10, averageReactions: 5, averageEngagementRateBps: 50 },
    ]);
    expect(normalizeAnalyticsPresetName("  OpenAI recent month  ")).toBe("OpenAI recent month");
    expect(() => normalizeAnalyticsPresetName("x")).toThrow("Preset name");
  });

  it("creates the completed weekly period and a downloadable report from real metric inputs", () => {
    expect(WEEKLY_REPORT_CRON.trim().split(/\s+/)).toHaveLength(6);
    expect(getCompletedWeekRange(new Date("2026-08-13T12:00:00.000Z"))).toMatchObject({ start: new Date("2026-08-03T00:00:00.000Z"), end: new Date("2026-08-10T00:00:00.000Z") });
    const report = buildWeeklyReportMarkdown({ periodStart: new Date("2026-08-03T00:00:00.000Z"), periodEnd: new Date("2026-08-10T00:00:00.000Z"), posts: [{ deliveryStatus: "delivered", sourceName: "OpenAI News", postKind: "source" }, { deliveryStatus: "failed", sourceName: "OpenAI News", postKind: "explainer" }], engagement: [{ publisherPostId: 1, reactionCount: 5 }] });
    expect(report).toContain("# گزارش هفتگی عملکرد ناشر");
    expect(report).toContain("مجموع واکنش‌های ثبت‌شده: 5");
    expect(report).toContain("OpenAI News: 1 پست");
  });

  it("requires both protected values and a matching secret before accepting Telegram webhook events", () => {
    const previousToken = process.env.TELEGRAM_BOT_TOKEN;
    const previousSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    process.env.TELEGRAM_BOT_TOKEN = "token";
    process.env.TELEGRAM_WEBHOOK_SECRET = "webhook-secret";
    expect(isTelegramEngagementConfigured()).toBe(true);
    expect(isValidTelegramWebhookSecret("webhook-secret")).toBe(true);
    expect(isValidTelegramWebhookSecret("other-secret")).toBe(false);
    if (previousToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = previousToken;
    if (previousSecret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET; else process.env.TELEGRAM_WEBHOOK_SECRET = previousSecret;
  });

  it("calculates a reaction-based engagement rate and applies the configured low-engagement threshold", () => {
    expect(calculateEngagementRateBps(4, 1000)).toBe(40);
    expect(calculateEngagementRateBps(4, 0)).toBeNull();
    expect(isLowEngagement(4, 1000, 50)).toBe(true);
    expect(isLowEngagement(5, 1000, 50)).toBe(false);
    expect(normalizeEngagementThresholdBps(25)).toBe(25);
    expect(() => normalizeEngagementThresholdBps(0)).toThrow("Engagement threshold");
    expect(() => normalizeEngagementThresholdBps(9000)).toThrow("Engagement threshold");
  });

  it("creates an expiring recipient-link code and validates it only for the matching code and time window", () => {
    const code = buildTelegramRecipientCode();
    expect(code).toMatch(/^VS-[A-F0-9]{14}$/);
    const expiresAt = new Date("2026-08-14T12:10:00.000Z");
    const now = new Date("2026-08-14T12:00:00.000Z");
    expect(isValidTelegramRecipientCode({ code: code.toLowerCase(), codeHash: hashText(code), expiresAt, now })).toBe(true);
    expect(isValidTelegramRecipientCode({ code: "VS-AAAAAAAA", codeHash: hashText(code), expiresAt, now })).toBe(false);
    expect(isValidTelegramRecipientCode({ code, codeHash: hashText(code), expiresAt, now: new Date("2026-08-14T12:11:00.000Z") })).toBe(false);
    expect(canDeliverWeeklyReport(true, "123456789")).toBe(true);
    expect(canDeliverWeeklyReport(false, "123456789")).toBe(false);
    expect(canDeliverWeeklyReport(true, null)).toBe(false);
    const deliveredAt = new Date("2026-08-14T12:00:00.000Z");
    expect(buildWeeklyReportDeliveryUpdate(undefined, deliveredAt)).toEqual({ deliveredToOwnerAt: deliveredAt, deliveryError: null });
    expect(buildWeeklyReportDeliveryUpdate(new Error("Telegram failed"))).toEqual({ deliveryError: "Telegram failed" });
  });
});
