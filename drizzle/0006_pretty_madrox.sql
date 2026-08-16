CREATE TABLE `publisher_source_alert_configs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceName` varchar(160) NOT NULL,
	`isEnabled` boolean NOT NULL DEFAULT true,
	`lowEngagementRateBps` int NOT NULL DEFAULT 25,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `publisher_source_alert_configs_id` PRIMARY KEY(`id`),
	CONSTRAINT `publisher_source_alert_config_source_uq` UNIQUE(`sourceName`)
);
--> statement-breakpoint
CREATE TABLE `publisher_source_engagement_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceName` varchar(160) NOT NULL,
	`periodStart` timestamp NOT NULL,
	`periodEnd` timestamp NOT NULL,
	`deliveredPosts` int NOT NULL,
	`totalReactions` int NOT NULL,
	`audienceSize` int NOT NULL,
	`averageEngagementRateBps` int NOT NULL,
	`thresholdBps` int NOT NULL,
	`alertedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `publisher_source_engagement_alerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `publisher_source_engagement_alert_source_period_uq` UNIQUE(`sourceName`,`periodStart`,`periodEnd`)
);
--> statement-breakpoint
CREATE INDEX `publisher_source_engagement_alert_time_idx` ON `publisher_source_engagement_alerts` (`alertedAt`);