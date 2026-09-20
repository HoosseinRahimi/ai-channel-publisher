import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Cloudflare D1 (SQLite) schema for the publisher — a faithful port of the
 * MySQL schema in `drizzle/schema.ts`. Table and column names are identical so
 * all query code in `server/publisher/**`, `server/routers.ts`, and
 * `server/publisherSchedule.ts` works unchanged against D1.
 *
 * Type mapping used:
 *   int        → integer
 *   boolean    → integer (0/1)
 *   timestamp  → integer (Unix milliseconds) with mode: "timestamp"
 *   text/varchar/mysqlEnum → text
 *
 * The MySQL boolean/int/text semantics are preserved: Drizzle exposes SQLite
 * `integer` columns as boolean where `.boolean()` was used, and timestamps as
 * JS `Date`. Nullable text stays nullable text.
 */

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("loginMethod"),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  lastSignedIn: integer("lastSignedIn", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const publisherSettings = sqliteTable("publisher_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channelHandle: text("channelHandle").notNull().default("@VerborgeneSchicht"),
  isEnabled: integer("isEnabled", { mode: "boolean" }).notNull().default(false),
  nextPostKind: text("nextPostKind", { enum: ["source", "explainer"] })
    .notNull()
    .default("source"),
  scheduleCronTaskUid: text("scheduleCronTaskUid"),
  draftCronTaskUid: text("draftCronTaskUid"),
  weeklyReportCronTaskUid: text("weeklyReportCronTaskUid"),
  weeklyReportNextRunAt: integer("weeklyReportNextRunAt", { mode: "timestamp" }),
  weeklyReportDeliveryEnabled: integer("weeklyReportDeliveryEnabled", { mode: "boolean" }).notNull().default(false),
  reportRecipientChatId: text("reportRecipientChatId"),
  reportRecipientCodeHash: text("reportRecipientCodeHash"),
  reportRecipientCodeExpiresAt: integer("reportRecipientCodeExpiresAt", { mode: "timestamp" }),
  engagementAlertCronTaskUid: text("engagementAlertCronTaskUid"),
  engagementAlertNextRunAt: integer("engagementAlertNextRunAt", { mode: "timestamp" }),
  engagementAlertEnabled: integer("engagementAlertEnabled", { mode: "boolean" }).notNull().default(false),
  lowEngagementRateBps: integer("lowEngagementRateBps").notNull().default(25),
  lastKnownAudienceSize: integer("lastKnownAudienceSize"),
  audienceMeasuredAt: integer("audienceMeasuredAt", { mode: "timestamp" }),
  engagementWebhookEnabled: integer("engagementWebhookEnabled", { mode: "boolean" }).notNull().default(false),
  engagementLastUpdatedAt: integer("engagementLastUpdatedAt", { mode: "timestamp" }),
  editorialGuidance: text("editorialGuidance"),
  nextPostToneFeedback: text("nextPostToneFeedback"),
  nextRunAt: integer("nextRunAt", { mode: "timestamp" }),
  lastRunAt: integer("lastRunAt", { mode: "timestamp" }),
  lastPublishedAt: integer("lastPublishedAt", { mode: "timestamp" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const publisherSources = sqliteTable(
  "publisher_sources",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    homepage: text("homepage").notNull(),
    feedUrl: text("feedUrl"),
    sourceKind: text("sourceKind", { enum: ["primary", "third_party"] })
      .notNull()
      .default("primary"),
    isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  table => ({
    nameIdx: uniqueIndex("publisher_sources_name_uq").on(table.name),
    activeIdx: index("publisher_sources_active_idx").on(table.isActive),
  })
);

export const publisherPosts = sqliteTable(
  "publisher_posts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    postKind: text("postKind", { enum: ["source", "explainer"] }).notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    sourceName: text("sourceName").notNull(),
    sourceUrl: text("sourceUrl"),
    sourceUrlHash: text("sourceUrlHash"),
    normalizedTopic: text("normalizedTopic").notNull(),
    contentFingerprint: text("contentFingerprint").notNull(),
    deliveryStatus: text("deliveryStatus", {
      enum: ["draft", "held", "pending", "delivered", "delivery_unknown", "failed", "skipped", "discarded"],
    })
      .notNull()
      .default("pending"),
    telegramMessageId: text("telegramMessageId"),
    errorMessage: text("errorMessage"),
    isTest: integer("isTest", { mode: "boolean" }).notNull().default(false),
    scheduledFor: integer("scheduledFor", { mode: "timestamp" }),
    publishedAt: integer("publishedAt", { mode: "timestamp" }),
    createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  table => ({
    deliveryIdx: index("publisher_posts_delivery_idx").on(table.deliveryStatus, table.createdAt),
    reviewIdx: index("publisher_posts_review_idx").on(table.deliveryStatus, table.scheduledFor),
    topicIdx: index("publisher_posts_topic_idx").on(table.normalizedTopic),
    sourceHashIdx: index("publisher_posts_source_hash_idx").on(table.sourceUrlHash),
  })
);

export const publisherDeliveryAttempts = sqliteTable(
  "publisher_delivery_attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publisherPostId: integer("publisherPostId").notNull(),
    attemptId: text("attemptId").notNull(),
    status: text("status", { enum: ["sending", "delivered", "delivery_unknown", "failed", "skipped"] }).notNull().default("sending"),
    telegramMessageId: text("telegramMessageId"),
    errorMessage: text("errorMessage"),
    startedAt: integer("startedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    completedAt: integer("completedAt", { mode: "timestamp" }),
  },
  table => ({
    attemptIdx: uniqueIndex("publisher_delivery_attempt_id_uq").on(table.attemptId),
    postIdx: index("publisher_delivery_attempt_post_idx").on(table.publisherPostId, table.startedAt),
  })
);

export const publisherRuns = sqliteTable(
  "publisher_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runKey: text("runKey").notNull(),
    scheduleCronTaskUid: text("scheduleCronTaskUid"),
    status: text("status", { enum: ["running", "completed", "failed", "skipped"] })
      .notNull()
      .default("running"),
    detail: text("detail"),
    startedAt: integer("startedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    completedAt: integer("completedAt", { mode: "timestamp" }),
  },
  table => ({
    runKeyIdx: uniqueIndex("publisher_runs_run_key_uq").on(table.runKey),
  })
);

export const publisherPostEngagement = sqliteTable(
  "publisher_post_engagement",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publisherPostId: integer("publisherPostId").notNull(),
    telegramMessageId: text("telegramMessageId").notNull(),
    reactionCount: integer("reactionCount").notNull().default(0),
    reactionSummary: text("reactionSummary"),
    lastReactionAt: integer("lastReactionAt", { mode: "timestamp" }),
    createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  table => ({
    postIdx: uniqueIndex("publisher_engagement_post_uq").on(table.publisherPostId),
    messageIdx: index("publisher_engagement_message_idx").on(table.telegramMessageId),
  })
);

export const publisherWeeklyReports = sqliteTable(
  "publisher_weekly_reports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    periodStart: integer("periodStart", { mode: "timestamp" }).notNull(),
    periodEnd: integer("periodEnd", { mode: "timestamp" }).notNull(),
    reportMarkdown: text("reportMarkdown").notNull(),
    metricsJson: text("metricsJson").notNull(),
    deliveredToOwnerAt: integer("deliveredToOwnerAt", { mode: "timestamp" }),
    deliveryError: text("deliveryError"),
    generatedAt: integer("generatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  table => ({
    periodIdx: uniqueIndex("publisher_weekly_reports_period_uq").on(table.periodStart, table.periodEnd),
  })
);

export const publisherEngagementAlerts = sqliteTable(
  "publisher_engagement_alerts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    publisherPostId: integer("publisherPostId").notNull(),
    reactionCount: integer("reactionCount").notNull(),
    audienceSize: integer("audienceSize").notNull(),
    engagementRateBps: integer("engagementRateBps").notNull(),
    alertedAt: integer("alertedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  table => ({
    postIdx: uniqueIndex("publisher_engagement_alert_post_uq").on(table.publisherPostId),
    alertedIdx: index("publisher_engagement_alert_time_idx").on(table.alertedAt),
  })
);

export const publisherSourceAlertConfigs = sqliteTable(
  "publisher_source_alert_configs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceName: text("sourceName").notNull(),
    isEnabled: integer("isEnabled", { mode: "boolean" }).notNull().default(true),
    lowEngagementRateBps: integer("lowEngagementRateBps").notNull().default(25),
    createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  table => ({
    sourceIdx: uniqueIndex("publisher_source_alert_config_source_uq").on(table.sourceName),
  })
);

export const publisherSourceEngagementAlerts = sqliteTable(
  "publisher_source_engagement_alerts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sourceName: text("sourceName").notNull(),
    periodStart: integer("periodStart", { mode: "timestamp" }).notNull(),
    periodEnd: integer("periodEnd", { mode: "timestamp" }).notNull(),
    deliveredPosts: integer("deliveredPosts").notNull(),
    totalReactions: integer("totalReactions").notNull(),
    audienceSize: integer("audienceSize").notNull(),
    averageEngagementRateBps: integer("averageEngagementRateBps").notNull(),
    thresholdBps: integer("thresholdBps").notNull(),
    alertedAt: integer("alertedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  table => ({
    sourcePeriodIdx: uniqueIndex("publisher_source_engagement_alert_source_period_uq").on(table.sourceName, table.periodStart, table.periodEnd),
    alertedIdx: index("publisher_source_engagement_alert_time_idx").on(table.alertedAt),
  })
);

export const publisherAnalyticsPresets = sqliteTable(
  "publisher_analytics_presets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ownerOpenId: text("ownerOpenId").notNull(),
    name: text("name").notNull(),
    sourceName: text("sourceName"),
    dateFrom: integer("dateFrom", { mode: "timestamp" }),
    dateTo: integer("dateTo", { mode: "timestamp" }),
    createdAt: integer("createdAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  table => ({
    ownerNameIdx: uniqueIndex("publisher_analytics_preset_owner_name_uq").on(table.ownerOpenId, table.name),
  })
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type PublisherSettings = typeof publisherSettings.$inferSelect;
export type PublisherSource = typeof publisherSources.$inferSelect;
export type PublisherPost = typeof publisherPosts.$inferSelect;
export type PublisherPostEngagement = typeof publisherPostEngagement.$inferSelect;
export type PublisherWeeklyReport = typeof publisherWeeklyReports.$inferSelect;
export type PublisherEngagementAlert = typeof publisherEngagementAlerts.$inferSelect;
export type PublisherSourceAlertConfig = typeof publisherSourceAlertConfigs.$inferSelect;
export type PublisherSourceEngagementAlert = typeof publisherSourceEngagementAlerts.$inferSelect;
export type PublisherAnalyticsPreset = typeof publisherAnalyticsPresets.$inferSelect;
