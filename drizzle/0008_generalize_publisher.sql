ALTER TABLE `publisher_settings` ADD COLUMN `appName` varchar(80) NOT NULL DEFAULT 'AI Channel Publisher';
ALTER TABLE `publisher_settings` ADD COLUMN `postSignature` varchar(160);
ALTER TABLE `publisher_settings` ADD COLUMN `postLanguage` varchar(16) NOT NULL DEFAULT 'fa';
ALTER TABLE `publisher_settings` ADD COLUMN `llmBaseUrl` varchar(2048);
ALTER TABLE `publisher_settings` ADD COLUMN `llmApiKeyEncrypted` text;
ALTER TABLE `publisher_settings` ADD COLUMN `llmModel` varchar(160);
