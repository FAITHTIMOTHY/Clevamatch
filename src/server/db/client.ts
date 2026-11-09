import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.js";

const databaseUrl = process.env.DATABASE_URL || (process.env.VERCEL ? undefined : "file:local.db");
if (!databaseUrl) {
  throw new Error("DATABASE_URL must be configured for Vercel deployments.");
}

const client = createClient({
  url: databaseUrl,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
export { client as databaseClient };
