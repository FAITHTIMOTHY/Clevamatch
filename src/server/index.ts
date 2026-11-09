import "dotenv/config";
import { randomUUID } from "node:crypto";
import path from "node:path";
import cookieParser from "cookie-parser";
import express, { type ErrorRequestHandler } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  BachsError,
  createBachsAccount,
  createBachsCheckout,
  createBachsOnboardingLink,
  getBachsCapabilities,
  verifyBachsSignature,
} from "./bachs.js";
import { clearSession, createWorkspaceAccount, issueSession, removeExpiredSessions, requireUser, verifyPassword } from "./auth.js";
import { db, databaseClient } from "./db/client.js";
import { checkoutSessions, invoices, matches, payments, users, webhookEvents, workspaces } from "./db/schema.js";
import { createManualMatch, dismissSuggestedMatch, getWorkspaceMatches, MatchError } from "./matching.js";
import {
  atomicUnits,
  cents,
  connectAccountSchema,
  invoiceImportSchema,
  invoiceInputSchema,
  loginSchema,
  matchInputSchema,
  paymentImportSchema,
  paymentInputSchema,
  registerSchema,
} from "./validation.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";

function paymentAmountMatches(value: string, expectedAtomic: number, currency: string): boolean {
  if (!/^\d+(?:\.\d+)?$/.test(value)) return false;
  const [whole, fraction = ""] = value.split(".");
  const precision = currency === "USD" ? 2 : 6;
  if (fraction.length > precision) return false;
  const observedAtomic = BigInt(whole!) * 1_000_000n +
    BigInt(fraction.padEnd(precision, "0")) * BigInt(10 ** (6 - precision));
  return observedAtomic === BigInt(expectedAtomic);
}

app.disable("x-powered-by");
app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (isProduction) response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});
app.post("/api/webhooks/bachs", express.raw({ type: "application/json", limit: "1mb" }), async (request, response) => {
  if (!Buffer.isBuffer(request.body)) {
    response.status(400).json({ error: "Expected a JSON webhook payload." });
    return;
  }
  if (!verifyBachsSignature(request.body, request.get("x-bachs-signature-v2"))) {
    response.status(401).json({ error: "Invalid webhook signature." });
    return;
  }

  let event: {
    id?: string;
    type?: string;
    created_at?: string;
    organization_id?: string;
    account?: string;
    data?: {
      checkout_id?: string;
      payment_status?: string;
      status?: string;
      amount?: string;
      currency?: string;
      charge?: { id?: string; status?: string };
    };
  };
  try {
    event = JSON.parse(request.body.toString("utf8")) as typeof event;
  } catch {
    response.status(400).json({ error: "Invalid webhook JSON." });
    return;
  }
  if (!event.id || !event.type || !event.data) {
    response.status(400).json({ error: "Incomplete webhook event." });
    return;
  }
  const [duplicate] = await db.select({ id: webhookEvents.id }).from(webhookEvents)
    .where(eq(webhookEvents.id, event.id)).limit(1);
  if (duplicate) {
    response.status(200).json({ received: true, duplicate: true });
    return;
  }

  const checkoutId = event.data.checkout_id;
  if (checkoutId && event.type === "checkout.expired") {
    await db.update(checkoutSessions).set({ status: "expired", updatedAt: new Date().toISOString() })
      .where(eq(checkoutSessions.bachsCheckoutId, checkoutId));
  }

  const paid = event.type === "collection.succeeded" ||
    (event.type === "checkout.completed" && event.data.payment_status?.toLowerCase() === "paid");
  if (paid && checkoutId) {
    const [session] = await db.select().from(checkoutSessions)
      .where(eq(checkoutSessions.bachsCheckoutId, checkoutId)).limit(1);
    if (session) {
      const [[invoice], [workspace]] = await Promise.all([
        db.select().from(invoices).where(eq(invoices.id, session.invoiceId)).limit(1),
        db.select().from(workspaces).where(eq(workspaces.id, session.workspaceId)).limit(1),
      ]);
      const eventAccount = event.account || event.organization_id;
      if (eventAccount && eventAccount !== workspace?.bachsAccountId) {
        response.status(400).json({ error: "Webhook account does not match the invoice owner." });
        return;
      }
      if (!invoice || !workspace || (event.data.amount && !paymentAmountMatches(event.data.amount, session.amountAtomic, session.currency)) ||
        (event.data.currency && event.data.currency !== session.currency)) {
        response.status(400).json({ error: "Payment details do not match the checkout." });
        return;
      }
      const receivedAt = event.created_at && !Number.isNaN(Date.parse(event.created_at))
        ? new Date(event.created_at).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      const [createdPayment] = await db.insert(payments).values({
        id: randomUUID(),
        workspaceId: session.workspaceId,
        payerName: invoice.clientName,
        amountCents: invoice.amountCents,
        amountAtomic: invoice.amountAtomic,
        currency: invoice.currency,
        reference: event.data.charge?.id || checkoutId,
        source: "bachs",
        bachsCheckoutId: checkoutId,
        receivedAt,
        createdAt: new Date().toISOString(),
      }).onConflictDoNothing().returning({ id: payments.id });
      const [payment] = createdPayment
        ? [createdPayment]
        : await db.select({ id: payments.id }).from(payments)
          .where(eq(payments.bachsCheckoutId, checkoutId)).limit(1);
      if (!payment) {
        response.status(500).json({ error: "Could not record the confirmed payment." });
        return;
      }
      await db.insert(matches).values({
        id: randomUUID(),
        workspaceId: session.workspaceId,
        invoiceId: invoice.id,
        paymentId: payment.id,
        status: "confirmed",
        source: "automatic",
        createdAt: new Date().toISOString(),
      }).onConflictDoNothing();
      await db.update(checkoutSessions).set({ status: "paid", updatedAt: new Date().toISOString() })
        .where(eq(checkoutSessions.id, session.id));
    }
  }

  await db.insert(webhookEvents).values({ id: event.id, type: event.type, receivedAt: new Date().toISOString() })
    .onConflictDoNothing();
  response.status(200).json({ received: true });
});
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

const attempts = new Map<string, { count: number; resetAt: number }>();
function rateLimit(request: express.Request, response: express.Response, next: express.NextFunction): void {
  const key = `${request.ip || "unknown"}:${request.path}`;
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    next();
    return;
  }
  if (entry.count >= 12) {
    response.status(429).json({ error: "Too many attempts. Please wait a few minutes and try again." });
    return;
  }
  entry.count += 1;
  next();
}

app.use("/api", (request, response, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    next();
    return;
  }
  const origin = request.get("origin");
  if (!origin) {
    next();
    return;
  }
  try {
    if (new URL(origin).host !== request.get("host")) {
      response.status(403).json({ error: "Cross-origin requests are not allowed." });
      return;
    }
    next();
  } catch {
    response.status(403).json({ error: "Invalid request origin." });
  }
});

app.get("/api/health", (_request, response) => response.json({ status: "ok" }));

app.get<{ publicId: string }>("/api/public/invoices/:publicId", async (request, response) => {
  const [invoice] = await db.select().from(invoices)
    .where(eq(invoices.publicId, request.params.publicId)).limit(1);
  if (!invoice) {
    response.status(404).json({ error: "This invoice link is invalid or no longer available." });
    return;
  }
  const [[workspace], [match], [latestCheckout]] = await Promise.all([
    db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces)
      .where(eq(workspaces.id, invoice.workspaceId)).limit(1),
    db.select({ status: matches.status }).from(matches).where(eq(matches.invoiceId, invoice.id)).limit(1),
    db.select({ status: checkoutSessions.status }).from(checkoutSessions)
      .where(eq(checkoutSessions.invoiceId, invoice.id)).orderBy(desc(checkoutSessions.createdAt)).limit(1),
  ]);
  if (!workspace) {
    response.status(404).json({ error: "This invoice is no longer available." });
    return;
  }
  response.json({
    invoice: {
      invoiceNumber: invoice.invoiceNumber,
      amountAtomic: invoice.amountAtomic,
      currency: invoice.currency,
      dueDate: invoice.dueDate,
      paid: match?.status === "confirmed",
      workspaceName: workspace.name,
    },
    checkoutStatus: latestCheckout?.status || "unpaid",
  });
});

app.post<{ publicId: string }>("/api/public/invoices/:publicId/checkout", rateLimit, async (request, response) => {
  const [invoice] = await db.select().from(invoices)
    .where(eq(invoices.publicId, request.params.publicId)).limit(1);
  if (!invoice) {
    response.status(404).json({ error: "This invoice link is invalid or no longer available." });
    return;
  }
  const [[workspace], [match]] = await Promise.all([
    db.select().from(workspaces).where(eq(workspaces.id, invoice.workspaceId)).limit(1),
    db.select({ status: matches.status }).from(matches).where(eq(matches.invoiceId, invoice.id)).limit(1),
  ]);
  if (match?.status === "confirmed") {
    response.status(409).json({ error: "This invoice has already been paid." });
    return;
  }
  if (!workspace?.bachsAccountId) {
    response.status(409).json({ error: "The freelancer has not connected payments yet." });
    return;
  }
  const [openCheckout] = await db.select().from(checkoutSessions).where(and(
    eq(checkoutSessions.invoiceId, invoice.id),
    eq(checkoutSessions.status, "open"),
  )).limit(1);
  if (openCheckout) {
    if (!openCheckout.expiresAt || Date.parse(openCheckout.expiresAt) > Date.now()) {
      response.json({ checkoutUrl: openCheckout.checkoutUrl });
      return;
    }
    await db.update(checkoutSessions).set({ status: "expired", updatedAt: new Date().toISOString() })
      .where(eq(checkoutSessions.id, openCheckout.id));
  }

  const capabilityResult = await getBachsCapabilities(workspace.bachsAccountId);
  const requiredCapability = invoice.currency === "USD" ? "card_collection" : "crypto";
  if (!capabilityResult.items.some((item) => item.name === requiredCapability && item.status === "active")) {
    response.status(409).json({
      error: `The freelancer's Bachs account is not yet enabled to accept ${invoice.currency} payments.`,
    });
    return;
  }

  const precision = invoice.currency === "USD" ? 2 : 6;
  const grossMinor = invoice.currency === "USD" ? invoice.amountCents : invoice.amountAtomic;
  const feeMinor = Math.floor((grossMinor * 35 + 500) / 1000);
  if (feeMinor <= 0 || feeMinor >= grossMinor) {
    response.status(400).json({ error: "This invoice amount is too small to process with the platform fee." });
    return;
  }
  const scale = 10 ** precision;
  const amount = (invoice.amountAtomic / 1_000_000).toFixed(precision);
  const platformFee = (feeMinor / scale).toFixed(precision);
  const baseUrl = process.env.APP_BASE_URL ||
    (isProduction ? `https://${request.get("host")}` : `${request.protocol}://${request.get("host")}`);
  const publicInvoiceUrl = `${baseUrl}/pay/${encodeURIComponent(invoice.publicId)}`;
  const attemptId = randomUUID();
  const checkout = await createBachsCheckout({
    accountId: workspace.bachsAccountId,
    amount,
    currency: invoice.currency as "USD" | "USDT_TRC20" | "USDT_ERC20",
    platformFee,
    email: invoice.clientEmail,
    customerName: invoice.clientName,
    successUrl: `${publicInvoiceUrl}?payment=success`,
    cancelUrl: publicInvoiceUrl,
    idempotencyKey: `cleva-checkout-${attemptId}`,
  });
  if (!checkout.checkout_id || !checkout.checkout_url ||
    !/^https:\/\/checkout\.bachs\.io\//.test(checkout.checkout_url)) {
    throw new BachsError("Bachs returned an invalid checkout session.");
  }
  const now = new Date().toISOString();
  await db.insert(checkoutSessions).values({
    id: attemptId,
    workspaceId: workspace.id,
    invoiceId: invoice.id,
    bachsCheckoutId: checkout.checkout_id,
    checkoutUrl: checkout.checkout_url,
    amountAtomic: invoice.amountAtomic,
    platformFee,
    currency: invoice.currency,
    expiresAt: checkout.expires_at && !Number.isNaN(Date.parse(checkout.expires_at))
      ? new Date(checkout.expires_at).toISOString()
      : null,
    status: "open",
    createdAt: now,
    updatedAt: now,
  });
  response.status(201).json({ checkoutUrl: checkout.checkout_url });
});

app.post("/api/auth/register", rateLimit, async (request, response) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message || "Please check your details." });
    return;
  }

  const [existingUser] = await db.select({ id: users.id }).from(users)
    .where(eq(users.email, parsed.data.email)).limit(1);
  if (existingUser) {
    response.status(409).json({ error: "An account with that email already exists. Please sign in instead." });
    return;
  }

  const user = await createWorkspaceAccount(parsed.data);
  await issueSession(user.id, response);
  response.status(201).json({ user });
});

app.post("/api/auth/login", rateLimit, async (request, response) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Enter a valid email address and password." });
    return;
  }
  const [record] = await db.select({
    id: users.id,
    workspaceId: users.workspaceId,
    name: users.name,
    email: users.email,
    passwordHash: users.passwordHash,
  }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (!record || !(await verifyPassword(parsed.data.password, record.passwordHash))) {
    response.status(401).json({ error: "That email and password don’t match." });
    return;
  }
  await issueSession(record.id, response);
  response.json({ user: { id: record.id, workspaceId: record.workspaceId, name: record.name, email: record.email } });
});

app.post("/api/auth/logout", requireUser, async (request, response) => {
  await clearSession(request, response);
  response.status(204).end();
});

app.get("/api/me", requireUser, async (request, response) => {
  const [workspace] = await db.select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces).where(eq(workspaces.id, request.user!.workspaceId)).limit(1);
  if (!workspace) {
    response.status(404).json({ error: "Your workspace could not be found." });
    return;
  }
  response.json({ user: request.user, workspace });
});

app.use("/api", requireUser);

app.post("/api/connect/onboarding", async (request, response) => {
  const parsed = connectAccountSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Enter a valid two-letter country code and account type." });
    return;
  }
  const [workspace] = await db.select().from(workspaces)
    .where(eq(workspaces.id, request.user!.workspaceId)).limit(1);
  if (!workspace) {
    response.status(404).json({ error: "Your workspace could not be found." });
    return;
  }

  let accountId = workspace.bachsAccountId;
  if (!accountId) {
    const account = await createBachsAccount({
      email: request.user!.email,
      displayName: workspace.name,
      country: parsed.data.country,
      entityType: parsed.data.entityType,
    });
    accountId = account.id;
    await db.update(workspaces).set({
      bachsAccountId: account.id,
      bachsAccountStatus: "onboarding",
      bachsCountry: parsed.data.country,
    }).where(eq(workspaces.id, workspace.id));
  }
  const baseUrl = process.env.APP_BASE_URL ||
    (isProduction ? `https://${request.get("host")}` : `${request.protocol}://${request.get("host")}`);
  const link = await createBachsOnboardingLink(
    accountId,
    `${baseUrl}/?connect=refresh`,
    `${baseUrl}/?connect=done`,
  );
  response.json({ onboardingUrl: link.url, accountId });
});

app.get("/api/connect/status", async (request, response) => {
  const [workspace] = await db.select().from(workspaces)
    .where(eq(workspaces.id, request.user!.workspaceId)).limit(1);
  if (!workspace?.bachsAccountId) {
    response.json({ connected: false, status: "not_connected", capabilities: [] });
    return;
  }
  const result = await getBachsCapabilities(workspace.bachsAccountId);
  const required = ["card_collection", "crypto", "payouts", "transfers"];
  const ready = required.every((name) => result.items.some((item) => item.name === name && item.status === "active"));
  const status = ready ? "ready" : "onboarding";
  await db.update(workspaces).set({ bachsAccountStatus: status })
    .where(eq(workspaces.id, workspace.id));
  response.json({ connected: true, status, capabilities: result.items });
});

app.get("/api/dashboard", async (request, response) => {
  const workspaceId = request.user!.workspaceId;
  const [workspaceInvoices, workspacePayments, workspaceMatches, [workspace]] = await Promise.all([
    db.select().from(invoices).where(eq(invoices.workspaceId, workspaceId)),
    db.select().from(payments).where(eq(payments.workspaceId, workspaceId)),
    getWorkspaceMatches(workspaceId),
    db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1),
  ]);
  response.json({ invoices: workspaceInvoices, payments: workspacePayments, matches: workspaceMatches, workspace: workspace || null });
});

app.post("/api/invoices", async (request, response) => {
  const parsed = invoiceInputSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message || "Please check the invoice details." });
    return;
  }
  const input = parsed.data;
  const [existing] = await db.select({ id: invoices.id }).from(invoices).where(
    and(eq(invoices.workspaceId, request.user!.workspaceId), eq(invoices.invoiceNumber, input.invoiceNumber)),
  ).limit(1);
  if (existing) {
    response.status(409).json({ error: "That invoice number already exists in this workspace." });
    return;
  }
  const record = {
    id: randomUUID(),
    workspaceId: request.user!.workspaceId,
    invoiceNumber: input.invoiceNumber,
    clientName: input.clientName,
    clientEmail: input.clientEmail || null,
    amountCents: cents(input.amount),
    amountAtomic: atomicUnits(input.amount),
    currency: input.currency,
    dueDate: input.dueDate,
    publicId: randomUUID().replace(/-/g, ""),
    createdAt: new Date().toISOString(),
  };
  await db.insert(invoices).values(record);
  response.status(201).json({ invoice: record });
});

app.post("/api/invoices/import", async (request, response) => {
  const parsed = invoiceImportSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message || "Check the invoice import file." });
    return;
  }
  const workspaceId = request.user!.workspaceId;
  const existingInvoices = await db.select({ invoiceNumber: invoices.invoiceNumber })
    .from(invoices).where(eq(invoices.workspaceId, workspaceId));
  const seenNumbers = new Set(existingInvoices.map((invoice) => invoice.invoiceNumber));
  const candidateRecords = [];
  for (const input of parsed.data.invoices) {
    const record = {
      id: randomUUID(),
      workspaceId,
      invoiceNumber: input.invoiceNumber,
      clientName: input.clientName,
      clientEmail: input.clientEmail || null,
      amountCents: cents(input.amount),
      amountAtomic: atomicUnits(input.amount),
      currency: input.currency,
      dueDate: input.dueDate,
      publicId: randomUUID().replace(/-/g, ""),
      createdAt: new Date().toISOString(),
    };
    if (seenNumbers.has(input.invoiceNumber)) continue;
    seenNumbers.add(input.invoiceNumber);
    candidateRecords.push(record);
  }
  let insertedCount = 0;
  for (let offset = 0; offset < candidateRecords.length; offset += 50) {
    const inserted = await db.insert(invoices).values(candidateRecords.slice(offset, offset + 50))
      .onConflictDoNothing().returning({ id: invoices.id });
    insertedCount += inserted.length;
  }
  response.status(201).json({ imported: insertedCount, skipped: parsed.data.invoices.length - insertedCount });
});

app.post("/api/payments", async (request, response) => {
  const parsed = paymentInputSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message || "Please check the payment details." });
    return;
  }
  const input = parsed.data;
  const record = {
    id: randomUUID(),
    workspaceId: request.user!.workspaceId,
    payerName: input.payerName,
    amountCents: cents(input.amount),
    amountAtomic: atomicUnits(input.amount),
    currency: input.currency,
    reference: input.reference,
    source: "manual" as const,
    receivedAt: input.receivedAt,
    createdAt: new Date().toISOString(),
  };
  await db.insert(payments).values(record);
  response.status(201).json({ payment: record });
});

app.post("/api/payments/import", async (request, response) => {
  const parsed = paymentImportSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message || "Check the payment import file." });
    return;
  }
  const workspaceId = request.user!.workspaceId;
  const existingPayments = await db.select({
    payerName: payments.payerName,
    amountCents: payments.amountCents,
    amountAtomic: payments.amountAtomic,
    currency: payments.currency,
    reference: payments.reference,
    receivedAt: payments.receivedAt,
  }).from(payments).where(eq(payments.workspaceId, workspaceId));
  const fingerprint = (payment: { payerName: string; amountAtomic: number; currency: string; reference: string; receivedAt: string }) =>
    JSON.stringify([payment.payerName, payment.amountAtomic, payment.currency, payment.reference, payment.receivedAt]);
  const seenPayments = new Set(existingPayments.map(fingerprint));
  const candidatePayments = [];
  for (const input of parsed.data.payments) {
    const amountCents = cents(input.amount);
    const amountAtomic = atomicUnits(input.amount);
    const key = fingerprint({
      payerName: input.payerName,
      amountAtomic,
      currency: input.currency,
      reference: input.reference,
      receivedAt: input.receivedAt,
    });
    if (seenPayments.has(key)) continue;
    seenPayments.add(key);
    candidatePayments.push({
      id: randomUUID(),
      workspaceId,
      payerName: input.payerName,
      amountCents,
      amountAtomic,
      currency: input.currency,
      reference: input.reference,
      source: "csv" as const,
      receivedAt: input.receivedAt,
      createdAt: new Date().toISOString(),
    });
  }
  let insertedCount = 0;
  for (let offset = 0; offset < candidatePayments.length; offset += 50) {
    const inserted = await db.insert(payments).values(candidatePayments.slice(offset, offset + 50))
      .onConflictDoNothing().returning({ id: payments.id });
    insertedCount += inserted.length;
  }
  response.status(201).json({ imported: insertedCount, skipped: parsed.data.payments.length - insertedCount });
});

app.post("/api/payments/:paymentId/match", async (request, response) => {
  const parsed = matchInputSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Choose an invoice to match." });
    return;
  }
  await createManualMatch(request.user!.workspaceId, request.params.paymentId, parsed.data.invoiceId);
  response.status(201).json({ ok: true });
});

app.post("/api/payments/:paymentId/dismiss-match", async (request, response) => {
  const parsed = matchInputSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Choose the suggested invoice to dismiss." });
    return;
  }
  await dismissSuggestedMatch(request.user!.workspaceId, request.params.paymentId, parsed.data.invoiceId);
  response.status(204).end();
});

app.delete("/api/invoices/:invoiceId/match", async (request, response) => {
  const [invoice] = await db.select({ id: invoices.id }).from(invoices).where(and(
    eq(invoices.id, request.params.invoiceId),
    eq(invoices.workspaceId, request.user!.workspaceId),
  )).limit(1);
  if (!invoice) {
    response.status(404).json({ error: "Invoice not found." });
    return;
  }
  await db.delete(matches).where(and(
    eq(matches.invoiceId, invoice.id),
    eq(matches.workspaceId, request.user!.workspaceId),
  ));
  response.status(204).end();
});

app.get("/api/export/invoices.csv", async (request, response) => {
  const workspaceId = request.user!.workspaceId;
  const [workspaceInvoices, workspacePayments, workspaceMatches] = await Promise.all([
    db.select().from(invoices).where(eq(invoices.workspaceId, workspaceId)),
    db.select().from(payments).where(eq(payments.workspaceId, workspaceId)),
    getWorkspaceMatches(workspaceId),
  ]);
  const lines = [["invoice_number", "client", "email", "amount", "currency", "due_date", "status", "payment_reference"]];
  for (const invoice of workspaceInvoices) {
    const match = workspaceMatches.find((item) => item.invoiceId === invoice.id);
    const payment = match ? workspacePayments.find((item) => item.id === match.paymentId) : undefined;
    const overdue = invoice.dueDate < new Date().toISOString().slice(0, 10);
    lines.push([
      invoice.invoiceNumber, invoice.clientName, invoice.clientEmail || "",
      (invoice.amountAtomic / 1_000_000).toFixed(6).replace(/0+$/, "").replace(/\.$/, ""), invoice.currency, invoice.dueDate,
      match?.status === "confirmed" ? "paid" : match ? "suggested" : overdue ? "overdue" : "open",
      payment?.reference || "",
    ]);
  }
  const csv = lines.map((row) => row.map((field) => {
    const safeField = /^[\s]*[=+\-@]/.test(field) ? `'${field}` : field;
    return `"${safeField.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n");
  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", 'attachment; filename="cleva-match-invoices.csv"');
  response.send(csv);
});

if (isProduction && !process.env.VERCEL) {
  const staticDirectory = path.resolve(process.cwd(), "dist");
  app.use(express.static(staticDirectory));
  app.get("/{*path}", (_request, response) => response.sendFile(path.join(staticDirectory, "index.html")));
} else if (!isProduction) {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    configFile: path.resolve(process.cwd(), "vite.config.ts"),
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof BachsError) {
    response.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof MatchError) {
    response.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof z.ZodError) {
    response.status(400).json({ error: error.issues[0]?.message || "Invalid input." });
    return;
  }
  console.error("Request failed:", error);
  response.status(500).json({ error: "Something went wrong. Please try again." });
};
app.use(errorHandler);

export default app;

if (!process.env.VERCEL) {
  const host = process.env.HOST || (isProduction ? "0.0.0.0" : "127.0.0.1");
  const server = app.listen(port, host, () => {
    console.log(`Cleva Match is running at http://${host}:${port}`);
  });

  const sessionCleanup = setInterval(() => {
    void removeExpiredSessions().catch((error: unknown) => console.error("Could not clean expired sessions:", error));
  }, 60 * 60 * 1000);
  sessionCleanup.unref();

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      clearInterval(sessionCleanup);
      server.close(() => {
        void (async () => {
          try {
            await databaseClient.end({ timeout: 5 });
            process.exit(0);
          } catch (error) {
            console.error("Database shutdown failed:", error);
            process.exit(1);
          }
        })();
      });
    });
  }
}
