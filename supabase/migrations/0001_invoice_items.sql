CREATE TABLE "invoice_items" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"quantity_milli" integer NOT NULL,
	"unit_amount_atomic" bigint NOT NULL,
	"line_total_atomic" bigint NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_idx" ON "invoice_items" USING btree ("invoice_id","position");
--> statement-breakpoint
INSERT INTO "invoice_items" (
	"id",
	"invoice_id",
	"position",
	"description",
	"quantity_milli",
	"unit_amount_atomic",
	"line_total_atomic",
	"created_at"
)
SELECT
	gen_random_uuid()::text,
	"id",
	0,
	'Imported invoice total',
	1000,
	"amount_atomic",
	"amount_atomic",
	"created_at"
FROM "invoices";