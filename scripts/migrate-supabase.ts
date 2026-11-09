import "dotenv/config";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "../src/server/db/schema.js";
import { promptSecret } from "./prompt-secret.js";

async function main(): Promise<void> {
  const configuredUrl = process.env.DATABASE_URL;
  const databaseUrl = configuredUrl && /^postgres(ql)?:\/\//i.test(configuredUrl)
    ? configuredUrl
    : await promptSecret("Supabase Postgres connection string");
  if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    throw new Error("The Supabase connection string must use the postgres:// or postgresql:// scheme.");
  }

  const client = postgres(databaseUrl, { max: 1, prepare: false, ssl: "require", connect_timeout: 10 });
  try {
    await migrate(drizzle(client, { schema }), {
      migrationsFolder: path.resolve(process.cwd(), "supabase", "migrations"),
      migrationsSchema: "public",
      migrationsTable: "__drizzle_migrations",
    });
    console.log("Supabase schema migrations applied successfully.");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error.";
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : null;
  const code = cause && "code" in cause && typeof cause.code === "string" ? ` (${cause.code})` : "";
  console.error("Could not migrate the Supabase schema:", message);
  if (cause) console.error("Database reported:", `${cause.message}${code}`);
  process.exitCode = 1;
});
