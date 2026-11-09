CREATE TABLE `match_exclusions` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`payment_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `match_exclusions_pair_unique` ON `match_exclusions` (`invoice_id`,`payment_id`);--> statement-breakpoint
CREATE INDEX `match_exclusions_workspace_idx` ON `match_exclusions` (`workspace_id`);