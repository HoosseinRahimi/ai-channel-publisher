CREATE TABLE `publisher_post_engagement` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publisherPostId` int NOT NULL,
	`telegramMessageId` varchar(64) NOT NULL,
	`reactionCount` int NOT NULL DEFAULT 0,
	`reactionSummary` text,
	`lastReactionAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `publisher_post_engagement_id` PRIMARY KEY(`id`),
	CONSTRAINT `publisher_engagement_post_uq` UNIQUE(`publisherPostId`)
);
--> statement-breakpoint
CREATE TABLE `publisher_weekly_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`periodStart` timestamp NOT NULL,
	`periodEnd` timestamp NOT NULL,
	`reportMarkdown` text NOT NULL,
	`metricsJson` text NOT NULL,
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `publisher_weekly_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `publisher_weekly_reports_period_uq` UNIQUE(`periodStart`,`periodEnd`)
);
--> statement-breakpoint
ALTER TABLE `publisher_settings` ADD `weeklyReportCronTaskUid` varchar(65);--> statement-breakpoint
ALTER TABLE `publisher_settings` ADD `weeklyReportNextRunAt` timestamp;--> statement-breakpoint
ALTER TABLE `publisher_settings` ADD `engagementWebhookEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `publisher_settings` ADD `engagementLastUpdatedAt` timestamp;--> statement-breakpoint
CREATE INDEX `publisher_engagement_message_idx` ON `publisher_post_engagement` (`telegramMessageId`);