CREATE TABLE `desire_states` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`intensity` real DEFAULT 0 NOT NULL,
	`patience_max` real DEFAULT 100 NOT NULL,
	`patience_remaining` real DEFAULT 100 NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`decay_rate` real DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_tick_at` integer NOT NULL,
	`last_interaction_at` integer NOT NULL,
	`last_mentioned_at` integer,
	`deadline` integer
);
--> statement-breakpoint
CREATE INDEX `desire_states_state_idx` ON `desire_states` (`state`);