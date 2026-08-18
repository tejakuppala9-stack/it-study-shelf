CREATE TABLE `studentRegistry` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` varchar(100) NOT NULL,
	`fullName` varchar(255) NOT NULL,
	`email` varchar(320),
	`semester` int,
	`department` varchar(160) NOT NULL DEFAULT 'Information Technology',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int NOT NULL,
	CONSTRAINT `studentRegistry_id` PRIMARY KEY(`id`),
	CONSTRAINT `studentRegistry_studentId_unique` UNIQUE(`studentId`)
);
