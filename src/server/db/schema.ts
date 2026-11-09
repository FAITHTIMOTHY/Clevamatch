import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: text("created_at").notNull(),
});

export const users = sqliteTable(
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

export const sessions = sqliteTable(
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

export const wallets = sqliteTable(
  "wallets",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    address: text("address").notNull(),
    lastSyncedAt: text("last_synced_at"),
    lastSyncedTimestamp: integer("last_synced_timestamp").notNull().default(0),
    syncCursor: text("sync_cursor"),
    historyComplete: integer("history_complete", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("wallets_workspace_address_unique").on(table.workspaceId, table.address),
    index("wallets_workspace_idx").on(table.workspaceId),
  ],
);

export const invoices = sqliteTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    invoiceNumber: text("invoice_number").notNull(),
    clientName: text("client_name").notNull(),
    clientEmail: text("client_email"),
    amountCents: integer("amount_cents").notNull(),
    amountAtomic: integer("amount_atomic").notNull().default(0),
    currency: text("currency").notNull(),
    dueDate: text("due_date").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("invoices_workspace_number_unique").on(table.workspaceId, table.invoiceNumber),
    index("invoices_workspace_due_idx").on(table.workspaceId, table.dueDate),
  ],
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    payerName: text("payer_name").notNull(),
    amountCents: integer("amount_cents").notNull(),
    amountAtomic: integer("amount_atomic").notNull().default(0),
    currency: text("currency").notNull(),
    reference: text("reference").notNull().default(""),
    source: text("source", { enum: ["manual", "csv", "tron"] }).notNull().default("manual"),
    walletId: text("wallet_id").references(() => wallets.id, { onDelete: "set null" }),
    senderAddress: text("sender_address"),
    sourceTransactionId: text("source_transaction_id"),
    sourceEventId: text("source_event_id"),
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
    uniqueIndex("payments_workspace_event_unique").on(table.workspaceId, table.sourceEventId),
  ],
);

export const matches = sqliteTable(
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

export const matchExclusions = sqliteTable(
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
