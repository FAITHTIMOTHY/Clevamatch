import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "./db/client.js";
import { invoices, matchExclusions, matches, payments } from "./db/schema.js";

type InvoiceRecord = typeof invoices.$inferSelect;
type PaymentRecord = typeof payments.$inferSelect;

export interface MatchView {
  invoiceId: string;
  paymentId: string;
  status: "confirmed" | "suggested";
  source: "manual" | "automatic";
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

function looksLikeMatch(invoice: InvoiceRecord, payment: PaymentRecord): boolean {
  if (invoice.amountAtomic !== payment.amountAtomic || invoice.currency !== payment.currency) return false;
  const invoiceNumber = normalize(invoice.invoiceNumber);
  const reference = normalize(payment.reference);
  const clientName = normalize(invoice.clientName);
  const payerName = normalize(payment.payerName);
  return (invoiceNumber.length >= 3 && reference.includes(invoiceNumber)) ||
    (clientName.length >= 4 && payerName.includes(clientName));
}

export async function getWorkspaceMatches(workspaceId: string): Promise<MatchView[]> {
  const [invoiceRows, paymentRows, confirmedRows, exclusionRows] = await Promise.all([
    db.select().from(invoices).where(eq(invoices.workspaceId, workspaceId)),
    db.select().from(payments).where(eq(payments.workspaceId, workspaceId)),
    db.select({
      invoiceId: matches.invoiceId,
      paymentId: matches.paymentId,
      source: matches.source,
    }).from(matches).where(eq(matches.workspaceId, workspaceId)),
    db.select({ invoiceId: matchExclusions.invoiceId, paymentId: matchExclusions.paymentId })
      .from(matchExclusions).where(eq(matchExclusions.workspaceId, workspaceId)),
  ]);
  const result: MatchView[] = confirmedRows.map((match) => ({
    ...match,
    status: "confirmed",
  }));
  const usedInvoices = new Set(confirmedRows.map((match) => match.invoiceId));
  const usedPayments = new Set(confirmedRows.map((match) => match.paymentId));
  const excludedPairs = new Set(exclusionRows.map((match) => `${match.invoiceId}:${match.paymentId}`));

  for (const invoice of invoiceRows) {
    if (usedInvoices.has(invoice.id)) continue;
    let payment = paymentRows.find((candidate) =>
      !usedPayments.has(candidate.id) &&
      !excludedPairs.has(`${invoice.id}:${candidate.id}`) &&
      looksLikeMatch(invoice, candidate),
    );
    if (!payment) continue;
    result.push({
      invoiceId: invoice.id,
      paymentId: payment.id,
      status: "suggested",
      source: "automatic",
    });
    usedInvoices.add(invoice.id);
    usedPayments.add(payment.id);
  }
  return result;
}

export async function createManualMatch(
  workspaceId: string,
  paymentId: string,
  invoiceId: string,
): Promise<void> {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!invoice || invoice.workspaceId !== workspaceId || !payment || payment.workspaceId !== workspaceId) {
    throw new MatchError("That invoice or payment could not be found in your workspace.", 404);
  }
  if (invoice.amountAtomic !== payment.amountAtomic || invoice.currency !== payment.currency) {
    throw new MatchError("Only payments with the same currency and exact amount can be matched.", 400);
  }
  const [invoiceMatch, paymentMatch] = await Promise.all([
    db.select({ id: matches.id }).from(matches).where(and(
      eq(matches.workspaceId, workspaceId),
      eq(matches.invoiceId, invoiceId),
    )).limit(1),
    db.select({ id: matches.id }).from(matches).where(and(
      eq(matches.workspaceId, workspaceId),
      eq(matches.paymentId, paymentId),
    )).limit(1),
  ]);
  const invoiceUsed = invoiceMatch.length > 0;
  const paymentUsed = paymentMatch.length > 0;
  if (invoiceUsed || paymentUsed) {
    throw new MatchError("That invoice or payment is already matched. Refresh and try again.", 409);
  }

  const [createdMatch] = await db.insert(matches).values({
    id: randomUUID(),
    workspaceId,
    invoiceId,
    paymentId,
    status: "confirmed",
    source: "manual",
    createdAt: new Date().toISOString(),
  }).onConflictDoNothing().returning({ id: matches.id });
  if (!createdMatch) throw new MatchError("That invoice or payment was just matched elsewhere. Refresh and try again.", 409);
}

export async function dismissSuggestedMatch(
  workspaceId: string,
  paymentId: string,
  invoiceId: string,
): Promise<void> {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!invoice || invoice.workspaceId !== workspaceId || !payment || payment.workspaceId !== workspaceId) {
    throw new MatchError("That invoice or payment could not be found in your workspace.", 404);
  }
  const isSuggestedPair = (await getWorkspaceMatches(workspaceId)).some((match) =>
    match.status === "suggested" && match.invoiceId === invoiceId && match.paymentId === paymentId,
  );
  if (!isSuggestedPair) {
    throw new MatchError("That invoice and payment are not a suggested match.", 400);
  }
  const [confirmed] = await db.select({ id: matches.id }).from(matches)
    .where(and(
      eq(matches.workspaceId, workspaceId),
      eq(matches.invoiceId, invoiceId),
      eq(matches.paymentId, paymentId),
    ))
    .limit(1);
  if (confirmed) throw new MatchError("A confirmed match cannot be dismissed. Remove the match first.", 409);

  await db.insert(matchExclusions).values({
    id: randomUUID(),
    workspaceId,
    invoiceId,
    paymentId,
    createdAt: new Date().toISOString(),
  }).onConflictDoNothing();
}

export class MatchError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MatchError";
    this.status = status;
  }
}
