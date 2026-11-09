import "dotenv/config";
import { randomUUID } from "node:crypto";
import path from "node:path";
import cookieParser from "cookie-parser";
import express, { type ErrorRequestHandler } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { migrate } from "drizzle-orm/libsql/migrator";
import { clearSession, createWorkspaceAccount, issueSession, removeExpiredSessions, requireUser, verifyPassword } from "./auth.js";
import { db, databaseClient } from "./db/client.js";
import { invoices, matches, payments, users, wallets, workspaces } from "./db/schema.js";
import { createManualMatch, dismissSuggestedMatch, getWorkspaceMatches, MatchError } from "./matching.js";
import { isValidTronAddress, syncTronWallet, TronSyncError } from "./tron.js";
import {
  atomicUnits,
  cents,
  invoiceImportSchema,
  invoiceInputSchema,
  loginSchema,
  matchInputSchema,
  paymentImportSchema,
  paymentInputSchema,
  registerSchema,
  walletInputSchema,
} from "./validation.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";

app.disable("x-powered-by");
app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (isProduction) response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
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

app.get("/api/dashboard", async (request, response) => {
  const workspaceId = request.user!.workspaceId;
  const [workspaceInvoices, workspacePayments, workspaceMatches, [workspace], workspaceWallets] = await Promise.all([
    db.select().from(invoices).where(eq(invoices.workspaceId, workspaceId)),
    db.select().from(payments).where(eq(payments.workspaceId, workspaceId)),
    getWorkspaceMatches(workspaceId),
    db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1),
    db.select().from(wallets).where(eq(wallets.workspaceId, workspaceId)),
  ]);
  response.json({ invoices: workspaceInvoices, payments: workspacePayments, matches: workspaceMatches, workspace: workspace || null, wallets: workspaceWallets });
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
    source: "manual",
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

app.post("/api/wallets", async (request, response) => {
  const parsed = walletInputSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: parsed.error.issues[0]?.message || "Enter a wallet label and address." });
    return;
  }
  if (!isValidTronAddress(parsed.data.address)) {
    response.status(400).json({ error: "Enter a valid TRON mainnet wallet address." });
    return;
  }
  const workspaceId = request.user!.workspaceId;
  const [existing] = await db.select({ id: wallets.id }).from(wallets).where(and(
    eq(wallets.workspaceId, workspaceId),
    eq(wallets.address, parsed.data.address),
  )).limit(1);
  if (existing) {
    response.status(409).json({ error: "That wallet is already connected to this workspace." });
    return;
  }
  const wallet = {
    id: randomUUID(),
    workspaceId,
    label: parsed.data.label,
    address: parsed.data.address,
    lastSyncedAt: null,
    lastSyncedTimestamp: 0,
    syncCursor: null,
    historyComplete: false,
    createdAt: new Date().toISOString(),
  };
  await db.insert(wallets).values(wallet);
  response.status(201).json({ wallet });
});

app.delete("/api/wallets/:walletId", async (request, response) => {
  const workspaceId = request.user!.workspaceId;
  const [wallet] = await db.select({ id: wallets.id }).from(wallets).where(and(
    eq(wallets.id, request.params.walletId),
    eq(wallets.workspaceId, workspaceId),
  )).limit(1);
  if (!wallet) {
    response.status(404).json({ error: "Wallet not found in your workspace." });
    return;
  }
  await db.delete(wallets).where(eq(wallets.id, wallet.id));
  response.status(204).end();
});

app.post("/api/wallets/:walletId/sync", async (request, response) => {
  const [wallet] = await db.select().from(wallets).where(and(
    eq(wallets.id, request.params.walletId),
    eq(wallets.workspaceId, request.user!.workspaceId),
  )).limit(1);
  if (!wallet) {
    response.status(404).json({ error: "Wallet not found in your workspace." });
    return;
  }
  const result = await syncTronWallet(wallet);
  response.json(result);
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
      (invoice.amountCents / 100).toFixed(2), invoice.currency, invoice.dueDate,
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

await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });

if (isProduction) {
  const staticDirectory = path.resolve(process.cwd(), "dist");
  app.use(express.static(staticDirectory));
  app.get("/{*path}", (_request, response) => response.sendFile(path.join(staticDirectory, "index.html")));
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    configFile: path.resolve(process.cwd(), "vite.config.ts"),
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof TronSyncError) {
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
          await databaseClient.close();
          process.exit(0);
        } catch (error) {
          console.error("Database shutdown failed:", error);
          process.exit(1);
        }
      })();
    });
  });
}
