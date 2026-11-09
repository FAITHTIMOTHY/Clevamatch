CREATE TABLE "checkout_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"bachs_checkout_id" text NOT NULL,
	"checkout_url" text NOT NULL,
	"amount_atomic" bigint NOT NULL,
	"platform_fee" text NOT NULL,
	"currency" text NOT NULL,
	"expires_at" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"invoice_number" text NOT NULL,
	"client_name" text NOT NULL,
	"client_email" text,
	"amount_cents" integer NOT NULL,
	"amount_atomic" bigint DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"due_date" text NOT NULL,
	"public_id" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_exclusions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"payment_id" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"payment_id" text NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"payer_name" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"amount_atomic" bigint DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"bachs_checkout_id" text,
	"received_at" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"received_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"bachs_account_id" text,
	"bachs_account_status" text,
	"bachs_country" text,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_exclusions" ADD CONSTRAINT "match_exclusions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_exclusions" ADD CONSTRAINT "match_exclusions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_exclusions" ADD CONSTRAINT "match_exclusions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_sessions_bachs_id_unique" ON "checkout_sessions" USING btree ("bachs_checkout_id");--> statement-breakpoint
CREATE INDEX "checkout_sessions_invoice_idx" ON "checkout_sessions" USING btree ("invoice_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_sessions_one_open_per_invoice_unique" ON "checkout_sessions" USING btree ("invoice_id") WHERE "checkout_sessions"."status" = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_workspace_number_unique" ON "invoices" USING btree ("workspace_id","invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_public_id_unique" ON "invoices" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "invoices_workspace_due_idx" ON "invoices" USING btree ("workspace_id","due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "match_exclusions_pair_unique" ON "match_exclusions" USING btree ("invoice_id","payment_id");--> statement-breakpoint
CREATE INDEX "match_exclusions_workspace_idx" ON "match_exclusions" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_invoice_unique" ON "matches" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "matches_payment_unique" ON "matches" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "matches_workspace_status_idx" ON "matches" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "payments_workspace_date_idx" ON "payments" USING btree ("workspace_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_workspace_dedup_unique" ON "payments" USING btree ("workspace_id","payer_name","amount_atomic","currency","reference","received_at") WHERE "payments"."source" <> 'tron';--> statement-breakpoint
CREATE UNIQUE INDEX "payments_bachs_checkout_unique" ON "payments" USING btree ("bachs_checkout_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_workspace_idx" ON "users" USING btree ("workspace_id");