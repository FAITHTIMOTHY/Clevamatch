import { and, eq } from "drizzle-orm";
import { db } from "./db/client.js";
import { matches } from "./db/schema.js";

export interface MatchView {
  invoiceId: string;
  paymentId: string;
  status: "confirmed";
  source: "manual" | "automatic";
}

export async function getWorkspaceMatches(workspaceId: string): Promise<MatchView[]> {
  const rows = await db.select({
      invoiceId: matches.invoiceId,
      paymentId: matches.paymentId,
      source: matches.source,
    }).from(matches).where(and(
      eq(matches.workspaceId, workspaceId),
      eq(matches.status, "confirmed"),
    ));
  return rows.map((match) => ({ ...match, status: "confirmed" }));
}
