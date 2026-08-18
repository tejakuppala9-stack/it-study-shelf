CREATE TABLE `materialLikes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`materialId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `materialLikes_id` PRIMARY KEY(`id`),
	CONSTRAINT `materialLikes_materialId_userId` UNIQUE(`materialId`,`userId`)
);
--> statement-breakpoint
ALTER TABLE `studyMaterials` ADD `academicYear` int NOT NULL;