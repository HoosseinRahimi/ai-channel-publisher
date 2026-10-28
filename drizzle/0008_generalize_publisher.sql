ALTER TABLE `publisher_settings` ADD COLUMN `appName` varchar(80) NOT NULL DEFAULT 'AI Channel Publisher';--> statement-breakpoint
ALTER TABLE `publisher_settings` ADD COLUMN `postSignature` varchar(160);--> statement-breakpoint
ALTER TABLE `publisher_settings` ADD COLUMN `postLanguage` varchar(16) NOT NULL DEFAULT 'fa';--> statement-breakpoint
ALTER TABLE `publisher_settings` ADD COLUMN `llmBaseUrl` varchar(2048);--> statement-breakpoint
ALTER TABLE `publisher_settings` ADD COLUMN `llmApiKeyEncrypted` text;--> statement-breakpoint
ALTER TABLE `publisher_settings` ADD COLUMN `llmModel` varchar(160);
