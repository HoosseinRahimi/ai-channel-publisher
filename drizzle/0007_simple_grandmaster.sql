CREATE TABLE `publisher_analytics_presets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`name` varchar(80) NOT NULL,
	`sourceName` varchar(160),
	`dateFrom` timestamp,
	`dateTo` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `publisher_analytics_presets_id` PRIMARY KEY(`id`),
	CONSTRAINT `publisher_analytics_preset_owner_name_uq` UNIQUE(`ownerOpenId`,`name`)
);
