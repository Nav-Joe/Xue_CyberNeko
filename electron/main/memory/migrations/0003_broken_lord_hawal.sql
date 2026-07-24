ALTER TABLE `core_memories` ADD `significance` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `core_memories` ADD `memory_kind` text DEFAULT 'habit' NOT NULL;--> statement-breakpoint
ALTER TABLE `core_memories` ADD `hit_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `core_memories` ADD `keywords` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `period_summaries` ADD `memory_kind` text DEFAULT 'habit' NOT NULL;--> statement-breakpoint
ALTER TABLE `session_summaries` ADD `memory_kind` text DEFAULT 'habit' NOT NULL;--> statement-breakpoint
UPDATE `core_memories` SET `significance` = `weight` WHERE `significance` = 0 AND `weight` > 0;
