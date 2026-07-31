CREATE TABLE `relationship_events` (
	`id` text PRIMARY KEY NOT NULL,
	`dimension` text NOT NULL,
	`delta` real NOT NULL,
	`magnitude` text,
	`source` text DEFAULT 'llm_turn' NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `relationship_events_created_at_idx` ON `relationship_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `relationship_events_dimension_created_at_idx` ON `relationship_events` (`dimension`,`created_at`);--> statement-breakpoint
CREATE TABLE `relationship_states` (
	`id` text PRIMARY KEY NOT NULL,
	`closeness` real DEFAULT 0 NOT NULL,
	`trust` real DEFAULT 0 NOT NULL,
	`rapport` real DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `relationship_states` (`id`, `closeness`, `trust`, `rapport`, `updated_at`) VALUES ('default', 0, 0, 0, 0);
