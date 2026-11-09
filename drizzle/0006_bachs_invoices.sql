ALTER TABLE `workspaces` ADD `bachs_account_id` text;
--> statement-breakpoint
ALTER TABLE `workspaces` ADD `bachs_account_status` text;
--> statement-breakpoint
ALTER TABLE `workspaces` ADD `bachs_country` text;
--> statement-breakpoint
ALTER TABLE `invoices` ADD `public_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `invoices` SET `public_id` = lower(hex(randomblob(16))) WHERE `public_id` = '';
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_public_id_unique` ON `invoices` (`public_id`);
--> statement-breakpoint
UPDATE `invoices` SET `currency` = 'USDT_TRC20' WHERE `currency` = 'USDT';
--> statement-breakpoint
UPDATE `payments` SET `currency` = 'USDT_TRC20' WHERE `currency` = 'USDT';
--> statement-breakpoint
ALTER TABLE `payments` DROP COLUMN `wallet_id`;
--> statement-breakpoint
ALTER TABLE `payments` DROP COLUMN `sender_address`;
--> statement-breakpoint
DROP INDEX `payments_workspace_event_unique`;
--> statement-breakpoint
ALTER TABLE `payments` DROP COLUMN `source_transaction_id`;
--> statement-breakpoint
ALTER TABLE `payments` DROP COLUMN `source_event_id`;
--> statement-breakpoint
DROP TABLE `wallets`;
--> statement-breakpoint
ALTER TABLE `payments` ADD `bachs_checkout_id` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_bachs_checkout_unique` ON `payments` (`bachs_checkout_id`);
--> statement-breakpoint
CREATE TABLE `checkout_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`bachs_checkout_id` text NOT NULL,
	`checkout_url` text NOT NULL,
	`amount_atomic` integer NOT NULL,
	`platform_fee` text NOT NULL,
	`currency` text NOT NULL,
	`expires_at` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkout_sessions_bachs_id_unique` ON `checkout_sessions` (`bachs_checkout_id`);
--> statement-breakpoint
CREATE INDEX `checkout_sessions_invoice_idx` ON `checkout_sessions` (`invoice_id`,`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkout_sessions_one_open_per_invoice_unique` ON `checkout_sessions` (`invoice_id`) WHERE `status` = 'open';
--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`received_at` text NOT NULL
);
