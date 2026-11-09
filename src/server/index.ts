import "dotenv/config";
import { randomUUID } from "node:crypto";
import path from "node:path";
import cookieParser from "cookie-parser";
import express, { type ErrorRequestHandler } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  BachsError,
  createBachsAccount,
  createBachsCheckout,
  createBachsOnboardingLink,
  getEnabledBachsCryptoCurrencies,
  getBachsCapabilities,
  verifyBachsSignature,
} from "./bachs.js";
import { clearSession, createWorkspaceAccount, issueSession, removeExpiredSessions, requireUser, verifyPassword } from "./auth.js";
import { db, databaseClient } from "./db/client.js";
import { checkoutSessions, invoiceItems, invoices, matches, payments, users, webhookEvents, workspaces } from "./db/schema.js";
import { getWorkspaceMatches } from "./matching.js";
import {
  atomicUnits,
  cents,
  connectAccountSchema,
  invoiceImportSchema,
  invoiceInputSchema,
  loginSchema,
  lineTotalAtomic,
  quantityMilli,
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
  const [[workspace], [match], [latestCheckout], items] = await Promise.all([
    db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces)
      .where(eq(workspaces.id, invoice.workspaceId)).limit(1),
    db.select({ status: matches.status }).from(matches).innerJoin(payments, eq(matches.paymentId, payments.id))
      .where(and(
        eq(matches.invoiceId, invoice.id),
        eq(matches.status, "confirmed"),
        eq(payments.source, "bachs"),
      )).limit(1),
    db.select({ status: checkoutSessions.status }).from(checkoutSessions)
      .where(eq(checkoutSessions.invoiceId, invoice.id)).orderBy(desc(checkoutSessions.createdAt)).limit(1),
    db.select({
      description: invoiceItems.description,
      quantityMilli: invoiceItems.quantityMilli,
      unitAmountAtomic: invoiceItems.unitAmountAtomic,
      lineTotalAtomic: invoiceItems.lineTotalAtomic,
    }).from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id)).orderBy(asc(invoiceItems.position)),
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
      clientName: invoice.clientName,
      items: items.map((item) => ({
        ...item,
        quantity: item.quantityMilli / 1_000,
      })),
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
    db.select({ status: matches.status }).from(matches).innerJoin(payments, eq(matches.paymentId, payments.id))
      .where(and(
        eq(matches.invoiceId, invoice.id),
        eq(matches.status, "confirmed"),
        eq(payments.source, "bachs"),
      )).limit(1),
  ]);
  if (match?.status === "confirmed") {
    response.status(409).json({ error: "This invoice has already been paid." });
    return;
  }
  if (!workspace?.bachsAccountId) {
    response.status(409).json({ error: "The freelancer has not connected payments yet." });
    return;
  }
  const currency = getEnabledBachsCryptoCurrencies().find((enabledCurrency) => enabledCurrency === invoice.currency);
  if (!currency) {
    response.status(409).json({ error: "This payment method is not enabled for SettleMe. Contact the freelancer to issue an invoice using an available crypto corridor." });
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
  const requiredCapability = "crypto";
  if (!capabilityResult.items.some((item) => item.name === requiredCapability && item.status === "active")) {
    response.status(409).json({
      error: `The freelancer's Bachs account is not yet enabled to accept ${invoice.currency} payments.`,
    });
    return;
  }

  const feeAtomic = Math.floor((invoice.amountAtomic * 35 + 500) / 1_000);
  if (feeAtomic <= 0 || feeAtomic >= invoice.amountAtomic) {
    response.status(400).json({ error: "This invoice amount is too small to process with the platform fee." });
    return;
  }
  const amount = (invoice.amountAtomic / 1_000_000).toFixed(6);
  const platformFee = (feeAtomic / 1_000_000).toFixed(6);
  const baseUrl = process.env.APP_BASE_URL ||
    (isProduction ? `https://${request.get("host")}` : `${request.protocol}://${request.get("host")}`);
  const publicInvoiceUrl = `${baseUrl}/pay/${encodeURIComponent(invoice.publicId)}`;
  const attemptId = randomUUID();
  const checkout = await createBachsCheckout({
    accountId: workspace.bachsAccountId,
    amount,
    currency,
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
  response.status(201).json({
    user,
    workspace: {
      id: user.workspaceId,
      name: parsed.data.companyName,
      bachsAccountId: null,
      bachsAccountStatus: null,
      bachsCountry: null,
    },
  });
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
    workspaceName: workspaces.name,
    bachsAccountId: workspaces.bachsAccountId,
    bachsAccountStatus: workspaces.bachsAccountStatus,
    bachsCountry: workspaces.bachsCountry,
  }).from(users).innerJoin(workspaces, eq(users.workspaceId, workspaces.id))
    .where(eq(users.email, parsed.data.email)).limit(1);
  if (!record || !(await verifyPassword(parsed.data.password, record.passwordHash))) {
    response.status(401).json({ error: "That email and password don’t match." });
    return;
  }
  await issueSession(record.id, response);
  response.json({
    user: { id: record.id, workspaceId: record.workspaceId, name: record.name, email: record.email },
    workspace: {
      id: record.workspaceId,
      name: record.workspaceName,
      bachsAccountId: record.bachsAccountId,
      bachsAccountStatus: record.bachsAccountStatus,
      bachsCountry: record.bachsCountry,
    },
  });
});

app.post("/api/auth/logout", requireUser, async (request, response) => {
  await clearSession(request, response);
  response.status(204).end();
});

app.get("/api/me", requireUser, async (request, response) => {
  const [workspace] = await db.select({
    id: workspaces.id,
    name: workspaces.name,
    bachsAccountId: workspaces.bachsAccountId,
    bachsAccountStatus: workspaces.bachsAccountStatus,
    bachsCountry: workspaces.bachsCountry,
  })
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
  const required = ["crypto", "payouts", "transfers"];
  const ready = required.every((name) => result.items.some((item) => item.name === name && item.status === "active"));
  const status = ready ? "ready" : "onboarding";
  await db.update(workspaces).set({ bachsAccountStatus: status })
    .where(eq(workspaces.id, workspace.id));
  response.json({ connected: true, status, capabilities: result.items });
});

app.get("/api/dashboard", async (request, response) => {
  const workspaceId = request.user!.workspaceId;
  const [workspaceInvoices, workspacePayments, workspaceMatches, workspaceItems, [workspace]] = await Promise.all([
    db.select().from(invoices).where(eq(invoices.workspaceId, workspaceId)),
    db.select().from(payments).where(and(eq(payments.workspaceId, workspaceId), eq(payments.source, "bachs"))),
    getWorkspaceMatches(workspaceId),
    db.select().from(invoiceItems).innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
      .where(eq(invoices.workspaceId, workspaceId)).orderBy(asc(invoiceItems.position)),
    db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1),
  ]);
  const itemsByInvoice = new Map<string, typeof workspaceItems>();
  for (const row of workspaceItems) {
    const items = itemsByInvoice.get(row.invoice_items.invoiceId) || [];
    items.push(row);
    itemsByInvoice.set(row.invoice_items.invoiceId, items);
  }
  const invoiceRows = workspaceInvoices.map((invoice) => ({
    ...invoice,
    items: (itemsByInvoice.get(invoice.id) || []).map(({ invoice_items: item }) => ({
      ...item,
      quantity: item.quantityMilli / 1_000,
    })),
  }));
  const confirmedPayments = new Set(workspacePayments.map((payment) => payment.id));
  response.json({
    invoices: invoiceRows,
    payments: workspacePayments,
    matches: workspaceMatches.filter((match) => match.status === "confirmed" && confirmedPayments.has(match.paymentId)),
    availableInvoiceCurrencies: getEnabledBachsCryptoCurrencies(),
    workspace: workspace || null,
  });
});

app.post("/api/invoices", async (request, response) => {
  const parsed = invoiceInputSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message || "Please check the invoice details." });
    return;
  }
  const input = parsed.data;
  const enabledCurrencies = getEnabledBachsCryptoCurrencies();
  if (!enabledCurrencies.includes(input.currency)) {
    response.status(409).json({ error: "No confirmed Bachs crypto corridor is enabled for SettleMe. Ask the administrator to configure supported currencies after Bachs approval." });
    return;
  }
  const [existing] = await db.select({ id: invoices.id }).from(invoices).where(
    and(eq(invoices.workspaceId, request.user!.workspaceId), eq(invoices.invoiceNumber, input.invoiceNumber)),
  ).limit(1);
  if (existing) {
    response.status(409).json({ error: "That invoice number already exists in this workspace." });
    return;
  }
  const itemRecords = input.items.map((item, position) => ({
    id: randomUUID(),
    position,
    description: item.description,
    quantityMilli: quantityMilli(item.quantity),
    unitAmountAtomic: atomicUnits(item.unitAmount),
    lineTotalAtomic: lineTotalAtomic(item.unitAmount, item.quantity),
    createdAt: new Date().toISOString(),
  }));
  const totalAtomic = itemRecords.reduce((sum, item) => sum + item.lineTotalAtomic, 0);
  const record = {
    id: randomUUID(),
    workspaceId: request.user!.workspaceId,
    invoiceNumber: input.invoiceNumber,
    clientName: input.clientName,
    clientEmail: input.clientEmail || null,
    amountCents: cents(totalAtomic / 1_000_000),
    amountAtomic: totalAtomic,
    currency: input.currency,
    dueDate: input.dueDate,
    publicId: randomUUID().replace(/-/g, ""),
    createdAt: new Date().toISOString(),
  };
  await db.transaction(async (tx) => {
    await tx.insert(invoices).values(record);
    await tx.insert(invoiceItems).values(itemRecords.map((item) => ({ ...item, invoiceId: record.id })));
  });
  response.status(201).json({
    invoice: {
      ...record,
      items: itemRecords.map((item) => ({ ...item, quantity: item.quantityMilli / 1_000 })),
    },
  });
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
  const candidateRecords: Array<typeof invoices.$inferInsert> = [];
  const candidateItems = new Map<string, typeof invoiceItems.$inferInsert>();
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
    candidateItems.set(record.id, {
      id: randomUUID(),
      invoiceId: record.id,
      position: 0,
      description: "Imported invoice total",
      quantityMilli: 1_000,
      unitAmountAtomic: record.amountAtomic,
      lineTotalAtomic: record.amountAtomic,
      createdAt: record.createdAt,
    });
  }
  let insertedCount = 0;
  await db.transaction(async (tx) => {
    for (let offset = 0; offset < candidateRecords.length; offset += 50) {
      const batch = candidateRecords.slice(offset, offset + 50);
      const inserted = await tx.insert(invoices).values(batch)
        .onConflictDoNothing().returning({ id: invoices.id });
      insertedCount += inserted.length;
      const insertedIds = new Set(inserted.map((row) => row.id));
      const rows = batch.map((record) => candidateItems.get(record.id)!)
        .filter((item) => insertedIds.has(item.invoiceId));
      if (rows.length) await tx.insert(invoiceItems).values(rows);
    }
  });
  response.status(201).json({ imported: insertedCount, skipped: parsed.data.invoices.length - insertedCount });
});

app.get("/api/export/invoices.csv", async (request, response) => {
  const workspaceId = request.user!.workspaceId;
  const [workspaceInvoices, workspacePayments, workspaceMatches] = await Promise.all([
    db.select().from(invoices).where(eq(invoices.workspaceId, workspaceId)),
    db.select().from(payments).where(and(eq(payments.workspaceId, workspaceId), eq(payments.source, "bachs"))),
    getWorkspaceMatches(workspaceId),
  ]);
  const lines = [["invoice_number", "client", "email", "amount", "currency", "due_date", "status", "payment_reference"]];
  for (const invoice of workspaceInvoices) {
    const match = workspaceMatches.find((item) => item.invoiceId === invoice.id);
    const payment = match ? workspacePayments.find((item) => item.id === match.paymentId) : undefined;
    const paid = Boolean(match && payment);
    const overdue = invoice.dueDate < new Date().toISOString().slice(0, 10);
    lines.push([
      invoice.invoiceNumber, invoice.clientName, invoice.clientEmail || "",
      (invoice.amountAtomic / 1_000_000).toFixed(6).replace(/0+$/, "").replace(/\.$/, ""), invoice.currency, invoice.dueDate,
      paid ? "paid" : overdue ? "overdue" : "open",
      payment?.reference || "",
    ]);
  }
  const csv = lines.map((row) => row.map((field) => {
    const safeField = /^[\s]*[=+\-@]/.test(field) ? `'${field}` : field;
    return `"${safeField.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n");
  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", 'attachment; filename="settleme-invoices.csv"');
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
    console.log(`SettleMe is running at http://${host}:${port}`);
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
