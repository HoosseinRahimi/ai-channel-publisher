CREATE TABLE `publisher_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postKind` enum('source','explainer') NOT NULL,
	`title` varchar(512) NOT NULL,
	`content` text NOT NULL,
	`sourceName` varchar(160) NOT NULL,
	`sourceUrl` varchar(2048),
	`sourceUrlHash` varchar(64),
	`normalizedTopic` varchar(512) NOT NULL,
	`contentFingerprint` varchar(64) NOT NULL,
	`deliveryStatus` enum('pending','delivered','failed','skipped') NOT NULL DEFAULT 'pending',
	`telegramMessageId` varchar(64),
	`errorMessage` text,
	`isTest` boolean NOT NULL DEFAULT false,
	`publishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `publisher_posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `publisher_runs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`runKey` varchar(160) NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`status` enum('running','completed','failed','skipped') NOT NULL DEFAULT 'running',
	`detail` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `publisher_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `publisher_runs_run_key_uq` UNIQUE(`runKey`)
);
--> statement-breakpoint
CREATE TABLE `publisher_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`channelHandle` varchar(128) NOT NULL DEFAULT '@VerborgeneSchicht',
	`isEnabled` boolean NOT NULL DEFAULT false,
	`nextPostKind` enum('source','explainer') NOT NULL DEFAULT 'source',
	`scheduleCronTaskUid` varchar(65),
	`nextRunAt` timestamp,
	`lastRunAt` timestamp,
	`lastPublishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `publisher_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `publisher_sources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`homepage` varchar(2048) NOT NULL,
	`feedUrl` varchar(2048),
	`sourceKind` enum('primary','third_party') NOT NULL DEFAULT 'primary',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `publisher_sources_id` PRIMARY KEY(`id`),
	CONSTRAINT `publisher_sources_name_uq` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE INDEX `publisher_posts_delivery_idx` ON `publisher_posts` (`deliveryStatus`,`createdAt`);--> statement-breakpoint
CREATE INDEX `publisher_posts_topic_idx` ON `publisher_posts` (`normalizedTopic`);--> statement-breakpoint
CREATE INDEX `publisher_posts_source_hash_idx` ON `publisher_posts` (`sourceUrlHash`);--> statement-breakpoint
CREATE INDEX `publisher_sources_active_idx` ON `publisher_sources` (`isActive`);