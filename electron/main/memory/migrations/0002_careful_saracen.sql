CREATE TABLE `period_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`period_start` integer NOT NULL,
	`period_end` integer NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`emotion_tags` text DEFAULT '[]' NOT NULL,
	`key_facts` text DEFAULT '[]' NOT NULL,
	`significance` real DEFAULT 0 NOT NULL,
	`keywords` text DEFAULT '[]' NOT NULL,
	`source_ids` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `period_summaries_kind_idx` ON `period_summaries` (`kind`);--> statement-breakpoint
CREATE INDEX `period_summaries_period_start_idx` ON `period_summaries` (`period_start`);--> statement-breakpoint
CREATE TABLE `user_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`interests` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`personality` text DEFAULT '' NOT NULL,
	`age` text DEFAULT '未知' NOT NULL,
	`address_name` text DEFAULT '未知' NOT NULL,
	`attitude_to_neko` text DEFAULT '' NOT NULL,
	`frequent_behaviors` text DEFAULT '[]' NOT NULL,
	`source_weekly_id` text,
	`updated_at` integer NOT NULL
);
