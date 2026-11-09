import "dotenv/config";
import { createClient } from "@libsql/client";
import postgres from "postgres";
import { promptSecret } from "./prompt-secret.js";

type TableTransfer = {
  table: string;
  columns: string[];
  optionalColumns?: string[];
  transform?: (row: Record<string, unknown>) => Record<string, unknown>;
};

const tables: TableTransfer[] = [
  { table: "workspaces", columns: ["id", "name", "bachs_account_id", "bachs_account_status", "bachs_country", "created_at"] },
  { table: "users", columns: ["id", "workspace_id", "name", "email", "password_hash", "created_at"] },
  { table: "sessions", columns: ["id", "user_id", "token_hash", "expires_at", "created_at"] },
  {
    table: "invoices",
    columns: ["id", "workspace_id", "invoice_number", "client_name", "client_email", "amount_cents", "amount_atomic", "currency", "due_date", "public_id", "created_at"],
    transform: normalizeLegacyCurrency,
  },
  {
    table: "payments",
    columns: ["id", "workspace_id", "payer_name", "amount_cents", "amount_atomic", "currency", "reference", "source", "bachs_checkout_id", "received_at", "created_at"],
    transform: normalizeLegacyCurrency,
  },
  { table: "matches", columns: ["id", "workspace_id", "invoice_id", "payment_id", "status", "source", "created_at"] },
  { table: "match_exclusions", columns: ["id", "workspace_id", "invoice_id", "payment_id", "created_at"] },
  { table: "checkout_sessions", columns: ["id", "workspace_id", "invoice_id", "bachs_checkout_id", "checkout_url", "amount_atomic", "platform_fee", "currency", "expires_at", "status", "created_at", "updated_at"], optionalColumns: ["expires_at"] },
  { table: "webhook_events", columns: ["id", "type", "received_at"] },
];

function normalizeLegacyCurrency(row: Record<string, unknown>): Record<string, unknown> {
  return row.currency === "USDT" ? { ...row, currency: "USDT_TRC20" } : row;
}

function postgresParameter(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  throw new Error("The legacy database returned a value with an unsupported type.");
}

async function readRows(
  source: ReturnType<typeof createClient>,
  table: TableTransfer,
): Promise<Array<Record<string, unknown>>> {
  const info = await source.execute(`PRAGMA table_info("${table.table}")`);
  const sourceColumns = new Set(info.rows.map((row) => String(row.name)));
  const optionalColumns = new Set(table.optionalColumns || []);
  const missingRequired = table.columns.filter((column) => !sourceColumns.has(column) && !optionalColumns.has(column));
  if (missingRequired.length) {
    throw new Error(`The source table "${table.table}" is missing required columns: ${missingRequired.join(", ")}.`);
  }
  const availableColumns = table.columns.filter((column) => sourceColumns.has(column));
  const result = await source.execute(
    `SELECT ${availableColumns.map((column) => `"${column}"`).join(", ")} FROM "${table.table}"`,
  );
  return result.rows.map((row) => {
    const record = Object.fromEntries(result.columns.map((column, index) => [column, row[index]]));
    for (const column of table.columns) {
      if (!sourceColumns.has(column)) record[column] = null;
    }
    return table.transform ? table.transform(record) : record;
  });
}

async function main(): Promise<void> {
  const configuredTargetUrl = process.env.DATABASE_URL;
  const targetUrl = configuredTargetUrl && /^postgres(ql)?:\/\//i.test(configuredTargetUrl)
    ? configuredTargetUrl
    : await promptSecret("Supabase Postgres connection string");
  if (!/^postgres(ql)?:\/\//i.test(targetUrl)) {
    throw new Error("The Supabase connection string must use the postgres:// or postgresql:// scheme.");
  }
  const configuredSourceUrl = process.env.LEGACY_DATABASE_URL;
  const sourceUrl = configuredSourceUrl && /^(file:|libsql:\/\/|https?:\/\/)/i.test(configuredSourceUrl)
    ? configuredSourceUrl
    : await promptSecret("Existing database URL (use file:local.db for the project’s local database)");
  if (!/^(file:|libsql:\/\/|https?:\/\/)/i.test(sourceUrl)) {
    throw new Error("The legacy database URL must use file:, libsql://, or https://.");
  }
  const sourceToken = sourceUrl.startsWith("file:")
    ? ""
    : process.env.LEGACY_DATABASE_AUTH_TOKEN || await promptSecret("Existing database auth token", true);
  const source = createClient({ url: sourceUrl, ...(sourceToken ? { authToken: sourceToken } : {}) });
  const target = postgres(targetUrl, { max: 1, prepare: false, ssl: "require", connect_timeout: 10 });
  try {
    const counts = await Promise.all(tables.map(async ({ table }) => {
      const result = await target.unsafe<{ count: string }[]>(`SELECT count(*)::text AS count FROM "${table}"`);
      return { table, count: Number(result[0]?.count || "0") };
    }));
    const occupied = counts.filter(({ count }) => count !== 0);
    if (occupied.length) {
      throw new Error(`Refusing to transfer into a non-empty Supabase database: ${occupied.map(({ table, count }) => `${table} (${count})`).join(", ")}.`);
    }

    const rowsByTable = new Map<string, Array<Record<string, unknown>>>();
    for (const table of tables) rowsByTable.set(table.table, await readRows(source, table));

    await target.begin(async (transaction) => {
      for (const { table, columns } of tables) {
        const rows = rowsByTable.get(table)!;
        const batchSize = 100;
        for (let offset = 0; offset < rows.length; offset += batchSize) {
          const batch = rows.slice(offset, offset + batchSize);
          const parameters: Array<string | number | boolean | null> = [];
          const valueRows = batch.map((row) => {
            const placeholders = columns.map((column) => {
              parameters.push(postgresParameter(row[column]));
              return `$${parameters.length}`;
            });
            return `(${placeholders.join(", ")})`;
          });
          await transaction.unsafe(
            `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(", ")}) VALUES ${valueRows.join(", ")}`,
            parameters,
          );
        }
        console.log(`Transferred ${rows.length} ${table} row(s).`);
      }
    });

    console.log("Transfer complete. Existing scrypt password hashes and sessions were preserved.");
  } finally {
    await source.close();
    await target.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error("Supabase data transfer failed:", error);
  process.exitCode = 1;
});
