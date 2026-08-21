CREATE TABLE `poker_hand_histories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`client_hand_id` text NOT NULL,
	`played_at` text NOT NULL,
	`display_time` text NOT NULL,
	`hand_number` integer NOT NULL,
	`hand_code` integer NOT NULL,
	`stakes` text NOT NULL,
	`hero_cards` text NOT NULL,
	`board` text NOT NULL,
	`result` text NOT NULL,
	`delta` integer NOT NULL,
	`actions_json` text NOT NULL,
	`pots_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_poker_hands_user_client_hand` ON `poker_hand_histories` (`user_id`,`client_hand_id`);--> statement-breakpoint
CREATE INDEX `idx_poker_hands_user_played_at` ON `poker_hand_histories` (`user_id`,`played_at`);--> statement-breakpoint
PRAGMA optimize;
