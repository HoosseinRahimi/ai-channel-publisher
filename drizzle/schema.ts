import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const publisherSettings = mysqlTable("publisher_settings", {
  id: int("id").autoincrement().primaryKey(),
  channelHandle: varchar("channelHandle", { length: 128 })
    .notNull()
    .default("@your_channel"),
  appName: varchar("appName", { length: 80 }).notNull().default("AI Channel Publisher"),
  postSignature: varchar("postSignature", { length: 160 }),
  postLanguage: varchar("postLanguage", { length: 16 }).notNull().default("fa"),
  llmBaseUrl: varchar("llmBaseUrl", { length: 2048 }),
  llmApiKeyEncrypted: text("llmApiKeyEncrypted"),
  llmModel: varchar("llmModel", { length: 160 }),
  isEnabled: boolean("isEnabled").notNull().default(false),
  nextPostKind: mysqlEnum("nextPostKind", ["source", "explainer"])
    .notNull()
    .default("source"),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  draftCronTaskUid: varchar("draftCronTaskUid", { length: 65 }),
  weeklyReportCronTaskUid: varchar("weeklyReportCronTaskUid", { length: 65 }),
  weeklyReportNextRunAt: timestamp("weeklyReportNextRunAt"),
  weeklyReportDeliveryEnabled: boolean("weeklyReportDeliveryEnabled").notNull().default(false),
  reportRecipientChatId: varchar("reportRecipientChatId", { length: 64 }),
  reportRecipientCodeHash: varchar("reportRecipientCodeHash", { length: 64 }),
  reportRecipientCodeExpiresAt: timestamp("reportRecipientCodeExpiresAt"),
  engagementAlertCronTaskUid: varchar("engagementAlertCronTaskUid", { length: 65 }),
  engagementAlertNextRunAt: timestamp("engagementAlertNextRunAt"),
  engagementAlertEnabled: boolean("engagementAlertEnabled").notNull().default(false),
  lowEngagementRateBps: int("lowEngagementRateBps").notNull().default(25),
  lastKnownAudienceSize: int("lastKnownAudienceSize"),
  audienceMeasuredAt: timestamp("audienceMeasuredAt"),
  engagementWebhookEnabled: boolean("engagementWebhookEnabled").notNull().default(false),
  engagementLastUpdatedAt: timestamp("engagementLastUpdatedAt"),
  editorialGuidance: text("editorialGuidance"),
  nextPostToneFeedback: text("nextPostToneFeedback"),
  nextRunAt: timestamp("nextRunAt"),
  lastRunAt: timestamp("lastRunAt"),
  lastPublishedAt: timestamp("lastPublishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const publisherSources = mysqlTable(
  "publisher_sources",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    homepage: varchar("homepage", { length: 2048 }).notNull(),
    feedUrl: varchar("feedUrl", { length: 2048 }),
    sourceKind: mysqlEnum("sourceKind", ["primary", "third_party"])
      .notNull()
      .default("primary"),
    isActive: boolean("isActive").notNull().default(true),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    nameIdx: uniqueIndex("publisher_sources_name_uq").on(table.name),
    activeIdx: index("publisher_sources_active_idx").on(table.isActive),
  })
);

export const publisherPosts = mysqlTable(
  "publisher_posts",
  {
    id: int("id").autoincrement().primaryKey(),
    postKind: mysqlEnum("postKind", ["source", "explainer"]).notNull(),
    title: varchar("title", { length: 512 }).notNull(),
    content: text("content").notNull(),
    sourceName: varchar("sourceName", { length: 160 }).notNull(),
    sourceUrl: varchar("sourceUrl", { length: 2048 }),
    sourceUrlHash: varchar("sourceUrlHash", { length: 64 }),
    normalizedTopic: varchar("normalizedTopic", { length: 512 }).notNull(),
    contentFingerprint: varchar("contentFingerprint", { length: 64 }).notNull(),
    deliveryStatus: mysqlEnum("deliveryStatus", ["draft", "held", "pending", "delivered", "delivery_unknown", "failed", "skipped", "discarded"])
      .notNull()
      .default("pending"),
    telegramMessageId: varchar("telegramMessageId", { length: 64 }),
    errorMessage: text("errorMessage"),
    isTest: boolean("isTest").notNull().default(false),
    scheduledFor: timestamp("scheduledFor"),
    publishedAt: timestamp("publishedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    deliveryIdx: index("publisher_posts_delivery_idx").on(table.deliveryStatus, table.createdAt),
    reviewIdx: index("publisher_posts_review_idx").on(table.deliveryStatus, table.scheduledFor),
    topicIdx: index("publisher_posts_topic_idx").on(table.normalizedTopic),
    sourceHashIdx: index("publisher_posts_source_hash_idx").on(table.sourceUrlHash),
  })
);

export const publisherDeliveryAttempts = mysqlTable(
  "publisher_delivery_attempts",
  {
    id: int("id").autoincrement().primaryKey(),
    publisherPostId: int("publisherPostId").notNull(),
    attemptId: varchar("attemptId", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["sending", "delivered", "delivery_unknown", "failed", "skipped"]).notNull().default("sending"),
    telegramMessageId: varchar("telegramMessageId", { length: 64 }),
    errorMessage: text("errorMessage"),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  table => ({
    attemptIdx: uniqueIndex("publisher_delivery_attempt_id_uq").on(table.attemptId),
    postIdx: index("publisher_delivery_attempt_post_idx").on(table.publisherPostId, table.startedAt),
  })
);

export const publisherRuns = mysqlTable(
  "publisher_runs",
  {
    id: int("id").autoincrement().primaryKey(),
    runKey: varchar("runKey", { length: 160 }).notNull(),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
    status: mysqlEnum("status", ["running", "completed", "failed", "skipped"])
      .notNull()
      .default("running"),
    detail: text("detail"),
    startedAt: timestamp("startedAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  table => ({
    runKeyIdx: uniqueIndex("publisher_runs_run_key_uq").on(table.runKey),
  })
);

export const publisherPostEngagement = mysqlTable(
  "publisher_post_engagement",
  {
    id: int("id").autoincrement().primaryKey(),
    publisherPostId: int("publisherPostId").notNull(),
    telegramMessageId: varchar("telegramMessageId", { length: 64 }).notNull(),
    reactionCount: int("reactionCount").notNull().default(0),
    reactionSummary: text("reactionSummary"),
    lastReactionAt: timestamp("lastReactionAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    postIdx: uniqueIndex("publisher_engagement_post_uq").on(table.publisherPostId),
    messageIdx: index("publisher_engagement_message_idx").on(table.telegramMessageId),
  })
);

export const publisherWeeklyReports = mysqlTable(
  "publisher_weekly_reports",
  {
    id: int("id").autoincrement().primaryKey(),
    periodStart: timestamp("periodStart").notNull(),
    periodEnd: timestamp("periodEnd").notNull(),
    reportMarkdown: text("reportMarkdown").notNull(),
    metricsJson: text("metricsJson").notNull(),
    deliveredToOwnerAt: timestamp("deliveredToOwnerAt"),
    deliveryError: text("deliveryError"),
    generatedAt: timestamp("generatedAt").defaultNow().notNull(),
  },
  table => ({
    periodIdx: uniqueIndex("publisher_weekly_reports_period_uq").on(table.periodStart, table.periodEnd),
  })
);

export const publisherEngagementAlerts = mysqlTable(
  "publisher_engagement_alerts",
  {
    id: int("id").autoincrement().primaryKey(),
    publisherPostId: int("publisherPostId").notNull(),
    reactionCount: int("reactionCount").notNull(),
    audienceSize: int("audienceSize").notNull(),
    engagementRateBps: int("engagementRateBps").notNull(),
    alertedAt: timestamp("alertedAt").defaultNow().notNull(),
  },
  table => ({
    postIdx: uniqueIndex("publisher_engagement_alert_post_uq").on(table.publisherPostId),
    alertedIdx: index("publisher_engagement_alert_time_idx").on(table.alertedAt),
  })
);

export const publisherSourceAlertConfigs = mysqlTable(
  "publisher_source_alert_configs",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceName: varchar("sourceName", { length: 160 }).notNull(),
    isEnabled: boolean("isEnabled").notNull().default(true),
    lowEngagementRateBps: int("lowEngagementRateBps").notNull().default(25),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    sourceIdx: uniqueIndex("publisher_source_alert_config_source_uq").on(table.sourceName),
  })
);

export const publisherSourceEngagementAlerts = mysqlTable(
  "publisher_source_engagement_alerts",
  {
    id: int("id").autoincrement().primaryKey(),
    sourceName: varchar("sourceName", { length: 160 }).notNull(),
    periodStart: timestamp("periodStart").notNull(),
    periodEnd: timestamp("periodEnd").notNull(),
    deliveredPosts: int("deliveredPosts").notNull(),
    totalReactions: int("totalReactions").notNull(),
    audienceSize: int("audienceSize").notNull(),
    averageEngagementRateBps: int("averageEngagementRateBps").notNull(),
    thresholdBps: int("thresholdBps").notNull(),
    alertedAt: timestamp("alertedAt").defaultNow().notNull(),
  },
  table => ({
    sourcePeriodIdx: uniqueIndex("publisher_source_engagement_alert_source_period_uq").on(table.sourceName, table.periodStart, table.periodEnd),
    alertedIdx: index("publisher_source_engagement_alert_time_idx").on(table.alertedAt),
  })
);

export const publisherAnalyticsPresets = mysqlTable(
  "publisher_analytics_presets",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerOpenId: varchar("ownerOpenId", { length: 64 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    sourceName: varchar("sourceName", { length: 160 }),
    dateFrom: timestamp("dateFrom"),
    dateTo: timestamp("dateTo"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
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
