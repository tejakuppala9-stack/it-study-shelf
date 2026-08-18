ALTER TABLE `materialLikes` DROP INDEX `materialLikes_materialId_userId`;--> statement-breakpoint
ALTER TABLE `materialLikes` MODIFY COLUMN `userId` int;--> statement-breakpoint
ALTER TABLE `materialLikes` ADD `actorKey` varchar(190) NOT NULL;--> statement-breakpoint
ALTER TABLE `materialLikes` ADD CONSTRAINT `materialLikes_materialId_actorKey` UNIQUE(`materialId`,`actorKey`);