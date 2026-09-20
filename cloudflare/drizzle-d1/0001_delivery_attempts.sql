CREATE TABLE `publisher_delivery_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`publisherPostId` integer NOT NULL,
	`attemptId` text NOT NULL,
	`status` text DEFAULT 'sending' NOT NULL,
	`telegramMessageId` text,
	`errorMessage` text,
	`startedAt` integer NOT NULL,
	`completedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `publisher_delivery_attempt_id_uq` ON `publisher_delivery_attempts` (`attemptId`);
--> statement-breakpoint
CREATE INDEX `publisher_delivery_attempt_post_idx` ON `publisher_delivery_attempts` (`publisherPostId`,`startedAt`);
