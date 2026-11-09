import { bigint, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  bachsAccountId: text("bachs_account_id"),
  bachsAccountStatus: text("bachs_account_status"),
  bachsCountry: text("bachs_country"),
  createdAt: text("created_at").notNull(),
});

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email), index("users_workspace_idx").on(table.workspaceId)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("sessions_token_hash_unique").on(table.tokenHash), index("sessions_user_idx").on(table.userId)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    invoiceNumber: text("invoice_number").notNull(),
    clientName: text("client_name").notNull(),
    clientEmail: text("client_email"),
    amountCents: integer("amount_cents").notNull(),
    amountAtomic: bigint("amount_atomic", { mode: "number" }).notNull().default(0),
    currency: text("currency").notNull(),
    dueDate: text("due_date").notNull(),
    publicId: text("public_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("invoices_workspace_number_unique").on(table.workspaceId, table.invoiceNumber),
    uniqueIndex("invoices_public_id_unique").on(table.publicId),
    index("invoices_workspace_due_idx").on(table.workspaceId, table.dueDate),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    payerName: text("payer_name").notNull(),
    amountCents: integer("amount_cents").notNull(),
    amountAtomic: bigint("amount_atomic", { mode: "number" }).notNull().default(0),
    currency: text("currency").notNull(),
    reference: text("reference").notNull().default(""),
    source: text("source", { enum: ["manual", "csv", "bachs", "tron"] }).notNull().default("manual"),
    bachsCheckoutId: text("bachs_checkout_id"),
    receivedAt: text("received_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("payments_workspace_date_idx").on(table.workspaceId, table.receivedAt),
    uniqueIndex("payments_workspace_dedup_unique").on(
      table.workspaceId,
      table.payerName,
      table.amountAtomic,
      table.currency,
      table.reference,
      table.receivedAt,
    ).where(sql`${table.source} <> 'tron'`),
    uniqueIndex("payments_bachs_checkout_unique").on(table.bachsCheckoutId),
  ],
);

export const checkoutSessions = pgTable(
  "checkout_sessions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    bachsCheckoutId: text("bachs_checkout_id").notNull(),
    checkoutUrl: text("checkout_url").notNull(),
    amountAtomic: bigint("amount_atomic", { mode: "number" }).notNull(),
    platformFee: text("platform_fee").notNull(),
    currency: text("currency").notNull(),
    expiresAt: text("expires_at"),
    status: text("status", { enum: ["open", "paid", "expired"] }).notNull().default("open"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("checkout_sessions_bachs_id_unique").on(table.bachsCheckoutId),
    index("checkout_sessions_invoice_idx").on(table.invoiceId, table.status),
    uniqueIndex("checkout_sessions_one_open_per_invoice_unique").on(table.invoiceId)
      .where(sql`${table.status} = 'open'`),
  ],
);

export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: text("received_at").notNull(),
});

export const matches = pgTable(
  "matches",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    paymentId: text("payment_id").notNull().references(() => payments.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["suggested", "confirmed"] }).notNull(),
    source: text("source", { enum: ["automatic", "manual"] }).notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("matches_invoice_unique").on(table.invoiceId),
    uniqueIndex("matches_payment_unique").on(table.paymentId),
    index("matches_workspace_status_idx").on(table.workspaceId, table.status),
  ],
);

export const matchExclusions = pgTable(
  "match_exclusions",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    paymentId: text("payment_id").notNull().references(() => payments.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("match_exclusions_pair_unique").on(table.invoiceId, table.paymentId),
    index("match_exclusions_workspace_idx").on(table.workspaceId),
  ],
);
