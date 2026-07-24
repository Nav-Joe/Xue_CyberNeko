ALTER TABLE `session_summaries` ADD `significance` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `session_summaries` ADD `keywords` text DEFAULT '[]' NOT NULL;