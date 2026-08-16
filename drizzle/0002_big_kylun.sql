ALTER TABLE `publisher_posts` MODIFY COLUMN `deliveryStatus` enum('draft','held','pending','delivered','failed','skipped','discarded') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `publisher_posts` ADD `scheduledFor` timestamp;--> statement-breakpoint
ALTER TABLE `publisher_settings` ADD `draftCronTaskUid` varchar(65);--> statement-breakpoint
CREATE INDEX `publisher_posts_review_idx` ON `publisher_posts` (`deliveryStatus`,`scheduledFor`);