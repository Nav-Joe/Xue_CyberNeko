CREATE TABLE `pet_touch_daily` (
	`day_key` text PRIMARY KEY NOT NULL,
	`head` integer DEFAULT 0 NOT NULL,
	`arms` integer DEFAULT 0 NOT NULL,
	`body` integer DEFAULT 0 NOT NULL,
	`legs` integer DEFAULT 0 NOT NULL,
	`tail` integer DEFAULT 0 NOT NULL,
	`affection_grants` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
