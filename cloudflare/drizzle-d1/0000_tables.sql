-- VerborgeneSchicht Publisher — D1 initial schema
-- 0000_tables.sql
-- Applies the full SQLite (D1) schema: 11 tables + unique/index constraints.

CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`openId` text NOT NULL,
	`name` text,
	`email` text,
	`loginMethod` text,
	`role` text DEFAULT 'user' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`lastSignedIn` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_openId_unique` ON `users` (`openId`);--> statement-breakpoint
CREATE TABLE `publisher_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`channelHandle` text DEFAULT '@VerborgeneSchicht' NOT NULL,
	`isEnabled` integer DEFAULT false NOT NULL,
	`nextPostKind` text DEFAULT 'source' NOT NULL,
	`scheduleCronTaskUid` text,
	`draftCronTaskUid` text,
	`weeklyReportCronTaskUid` text,
	`weeklyReportNextRunAt` integer,
	`weeklyReportDeliveryEnabled` integer DEFAULT false NOT NULL,
	`reportRecipientChatId` text,
	`reportRecipientCodeHash` text,
	`reportRecipientCodeExpiresAt` integer,
	`engagementAlertCronTaskUid` text,
	`engagementAlertNextRunAt` integer,
	`engagementAlertEnabled` integer DEFAULT false NOT NULL,
	`lowEngagementRateBps` integer DEFAULT 25 NOT NULL,
	`lastKnownAudienceSize` integer,
	`audienceMeasuredAt` integer,
	`engagementWebhookEnabled` integer DEFAULT false NOT NULL,
	`engagementLastUpdatedAt` integer,
	`editorialGuidance` text,
	`nextPostToneFeedback` text,
	`nextRunAt` integer,
	`lastRunAt` integer,
	`lastPublishedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `publisher_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`homepage` text NOT NULL,
	`feedUrl` text,
	`sourceKind` text DEFAULT 'primary' NOT NULL,
	`isActive` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publisher_sources_name_uq` ON `publisher_sources` (`name`);--> statement-breakpoint
CREATE INDEX `publisher_sources_active_idx` ON `publisher_sources` (`isActive`);--> statement-breakpoint
CREATE TABLE `publisher_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`postKind` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`sourceName` text NOT NULL,
	`sourceUrl` text,
	`sourceUrlHash` text,
	`normalizedTopic` text NOT NULL,
	`contentFingerprint` text NOT NULL,
	`deliveryStatus` text DEFAULT 'pending' NOT NULL,
	`telegramMessageId` text,
	`errorMessage` text,
	`isTest` integer DEFAULT false NOT NULL,
	`scheduledFor` integer,
	`publishedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `publisher_posts_delivery_idx` ON `publisher_posts` (`deliveryStatus`,`createdAt`);--> statement-breakpoint
CREATE INDEX `publisher_posts_review_idx` ON `publisher_posts` (`deliveryStatus`,`scheduledFor`);--> statement-breakpoint
CREATE INDEX `publisher_posts_topic_idx` ON `publisher_posts` (`normalizedTopic`);--> statement-breakpoint
CREATE INDEX `publisher_posts_source_hash_idx` ON `publisher_posts` (`sourceUrlHash`);--> statement-breakpoint
CREATE TABLE `publisher_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`runKey` text NOT NULL,
	`scheduleCronTaskUid` text,
	`status` text DEFAULT 'running' NOT NULL,
	`detail` text,
	`startedAt` integer NOT NULL,
	`completedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publisher_runs_run_key_uq` ON `publisher_runs` (`runKey`);--> statement-breakpoint
CREATE TABLE `publisher_post_engagement` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`publisherPostId` integer NOT NULL,
	`telegramMessageId` text NOT NULL,
	`reactionCount` integer DEFAULT 0 NOT NULL,
	`reactionSummary` text,
	`lastReactionAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publisher_engagement_post_uq` ON `publisher_post_engagement` (`publisherPostId`);--> statement-breakpoint
CREATE INDEX `publisher_engagement_message_idx` ON `publisher_post_engagement` (`telegramMessageId`);--> statement-breakpoint
CREATE TABLE `publisher_weekly_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`periodStart` integer NOT NULL,
	`periodEnd` integer NOT NULL,
	`reportMarkdown` text NOT NULL,
	`metricsJson` text NOT NULL,
	`deliveredToOwnerAt` integer,
	`deliveryError` text,
	`generatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publisher_weekly_reports_period_uq` ON `publisher_weekly_reports` (`periodStart`,`periodEnd`);--> statement-breakpoint
CREATE TABLE `publisher_engagement_alerts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`publisherPostId` integer NOT NULL,
	`reactionCount` integer NOT NULL,
	`audienceSize` integer NOT NULL,
	`engagementRateBps` integer NOT NULL,
	`alertedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publisher_engagement_alert_post_uq` ON `publisher_engagement_alerts` (`publisherPostId`);--> statement-breakpoint
CREATE INDEX `publisher_engagement_alert_time_idx` ON `publisher_engagement_alerts` (`alertedAt`);--> statement-breakpoint
CREATE TABLE `publisher_source_alert_configs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sourceName` text NOT NULL,
	`isEnabled` integer DEFAULT true NOT NULL,
	`lowEngagementRateBps` integer DEFAULT 25 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publisher_source_alert_config_source_uq` ON `publisher_source_alert_configs` (`sourceName`);--> statement-breakpoint
CREATE TABLE `publisher_source_engagement_alerts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sourceName` text NOT NULL,
	`periodStart` integer NOT NULL,
	`periodEnd` integer NOT NULL,
	`deliveredPosts` integer NOT NULL,
	`totalReactions` integer NOT NULL,
	`audienceSize` integer NOT NULL,
	`averageEngagementRateBps` integer NOT NULL,
	`thresholdBps` integer NOT NULL,
	`alertedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publisher_source_engagement_alert_source_period_uq` ON `publisher_source_engagement_alerts` (`sourceName`,`periodStart`,`periodEnd`);--> statement-breakpoint
CREATE INDEX `publisher_source_engagement_alert_time_idx` ON `publisher_source_engagement_alerts` (`alertedAt`);--> statement-breakpoint
CREATE TABLE `publisher_analytics_presets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ownerOpenId` text NOT NULL,
	`name` text NOT NULL,
	`sourceName` text,
	`dateFrom` integer,
	`dateTo` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publisher_analytics_preset_owner_name_uq` ON `publisher_analytics_presets` (`ownerOpenId`,`name`);--> statement-breakpoint
