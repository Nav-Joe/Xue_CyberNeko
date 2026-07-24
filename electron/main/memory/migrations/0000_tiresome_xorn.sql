CREATE TABLE `core_memories` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text DEFAULT 'general' NOT NULL,
	`content` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`fixed` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`source_session` text
);
--> statement-breakpoint
CREATE INDEX `core_memories_category_idx` ON `core_memories` (`category`);--> statement-breakpoint
CREATE TABLE `memory_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text,
	`content` text NOT NULL,
	`layer` text DEFAULT 'L3' NOT NULL,
	`significance` real DEFAULT 0.5 NOT NULL,
	`arousal` real DEFAULT 0 NOT NULL,
	`valence` real DEFAULT 0 NOT NULL,
	`event_type` text DEFAULT 'general' NOT NULL,
	`created_at` integer NOT NULL,
	`accessed_count` integer DEFAULT 0 NOT NULL,
	`last_accessed` integer,
	`embedding` blob
);
--> statement-breakpoint
CREATE INDEX `memory_events_created_at_idx` ON `memory_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `memory_events_event_type_idx` ON `memory_events` (`event_type`);--> statement-breakpoint
CREATE INDEX `memory_events_significance_idx` ON `memory_events` (`significance`);--> statement-breakpoint
CREATE TABLE `memory_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('now') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `raw_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`emotion_tags` text DEFAULT '[]' NOT NULL,
	`key_facts` text DEFAULT '[]' NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`message_count` integer DEFAULT 0 NOT NULL
);
