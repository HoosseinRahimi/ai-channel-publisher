CREATE TABLE `publisher_delivery_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`publisherPostId` int NOT NULL,
	`attemptId` varchar(64) NOT NULL,
	`status` enum('sending','delivered','delivery_unknown','failed','skipped') NOT NULL DEFAULT 'sending',
	`telegramMessageId` varchar(64),
	`errorMessage` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `publisher_delivery_attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `publisher_delivery_attempt_id_uq` UNIQUE(`attemptId`)
);
--> statement-breakpoint
CREATE INDEX `publisher_delivery_attempt_post_idx` ON `publisher_delivery_attempts` (`publisherPostId`,`startedAt`);
