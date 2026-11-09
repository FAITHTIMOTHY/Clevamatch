CREATE TABLE `wallets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`label` text NOT NULL,
	`address` text NOT NULL,
	`last_synced_at` text,
	`last_synced_timestamp` integer DEFAULT 0 NOT NULL,
	`sync_cursor` text,
	`history_complete` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallets_workspace_address_unique` ON `wallets` (`workspace_id`,`address`);--> statement-breakpoint
CREATE INDEX `wallets_workspace_idx` ON `wallets` (`workspace_id`);--> statement-breakpoint
ALTER TABLE `invoices` ADD `amount_atomic` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `invoices` SET `amount_atomic` = `amount_cents` * 10000;--> statement-breakpoint
ALTER TABLE `payments` ADD `amount_atomic` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `payments` SET `amount_atomic` = `amount_cents` * 10000;--> statement-breakpoint
ALTER TABLE `payments` ADD `source` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `wallet_id` text REFERENCES wallets(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `payments` ADD `sender_address` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `source_transaction_id` text;--> statement-breakpoint
ALTER TABLE `payments` ADD `source_event_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_workspace_event_unique` ON `payments` (`workspace_id`,`source_event_id`);