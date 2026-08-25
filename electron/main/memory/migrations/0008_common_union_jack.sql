ALTER TABLE `session_summaries` ADD `source` text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE `session_summaries` ADD `source_label` text;