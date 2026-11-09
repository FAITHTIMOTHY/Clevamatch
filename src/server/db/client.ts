import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL must be configured for the Supabase Postgres database.");
}

const client = postgres(databaseUrl, {
  max: process.env.VERCEL ? 1 : 10,
  prepare: false,
  ssl: "require",
  connect_timeout: 10,
});

export const db = drizzle(client, { schema });
export { client as databaseClient };
