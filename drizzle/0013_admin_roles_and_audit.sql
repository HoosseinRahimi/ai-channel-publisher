CREATE TABLE `admin_audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorOpenId` varchar(64),
	`actorName` varchar(160),
	`actorRole` varchar(16),
	`action` varchar(120) NOT NULL,
	`outcome` enum('success','failure') NOT NULL,
	`detail` text,
	`ipAddress` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `username` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` boolean NOT NULL DEFAULT true;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','owner','editor','viewer') NOT NULL DEFAULT 'user';--> statement-breakpoint
UPDATE `users` SET `role` = 'owner' WHERE `role` = 'admin';--> statement-breakpoint
UPDATE `users` SET `role` = 'viewer' WHERE `role` = 'user';--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('owner','editor','viewer') NOT NULL DEFAULT 'viewer';--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_username_uq` UNIQUE(`username`);--> statement-breakpoint
CREATE INDEX `admin_audit_actor_idx` ON `admin_audit_log` (`actorOpenId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `admin_audit_action_idx` ON `admin_audit_log` (`action`,`createdAt`);--> statement-breakpoint
CREATE INDEX `admin_audit_created_idx` ON `admin_audit_log` (`createdAt`);--> statement-breakpoint
CREATE INDEX `users_role_idx` ON `users` (`role`,`isActive`);
