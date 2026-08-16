CREATE TABLE `publisher_engagement_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publisherPostId` int NOT NULL,
	`reactionCount` int NOT NULL,
	`audienceSize` int NOT NULL,
	`engagementRateBps` int NOT NULL,
	`alertedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `publisher_engagement_alerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `publisher_engagement_alert_post_uq` UNIQUE(`publisherPostId`)
);
--> statement-breakpoint
ALTER TABLE `publisher_settings` ADD `weeklyReportDeliveryEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `publisher_settings` ADD `reportRecipientChatId` varchar(64);--> statement-breakpoint
ALTER TABLE `publisher_settings` ADD `reportRecipientCodeHash` varchar(64);--> statement-breakpoint
ALTER TABLE `publisher_settings` ADD `reportRecipientCodeExpiresAt` timestamp;--> statement-breakpoint
ALTER TABLE `publisher_settings` ADD `engagementAlertCronTaskUid` varchar(65);--> statement-breakpoint
ALTER TABLE `publisher_settings` ADD `engagementAlertNextRunAt` timestamp;--> statement-breakpoint
ALTER TABLE `publisher_settings` ADD `engagementAlertEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `publisher_settings` ADD `lowEngagementRateBps` int DEFAULT 25 NOT NULL;--> statement-breakpoint
ALTER TABLE `publisher_settings` ADD `lastKnownAudienceSize` int;--> statement-breakpoint
ALTER TABLE `publisher_settings` ADD `audienceMeasuredAt` timestamp;--> statement-breakpoint
ALTER TABLE `publisher_weekly_reports` ADD `deliveredToOwnerAt` timestamp;--> statement-breakpoint
ALTER TABLE `publisher_weekly_reports` ADD `deliveryError` text;--> statement-breakpoint
CREATE INDEX `publisher_engagement_alert_time_idx` ON `publisher_engagement_alerts` (`alertedAt`);