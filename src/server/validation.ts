import { z } from "zod";

const currency = z.enum(["USD", "USDT_TRC20", "USDT_ERC20", "USDT"])
  .transform((value) => value === "USDT" ? "USDT_TRC20" : value)
  .default("USD");
const moneyAmount = z.coerce.number().finite().positive().max(10_000_000)
  .refine((value) => Number.isInteger(value * 1_000_000), "Amounts can have up to six decimal places.");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD format.")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value, "Enter a valid calendar date.");

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  companyName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(10).max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

const invoiceFields = z.object({
  invoiceNumber: z.string().trim().min(1).max(60),
  clientName: z.string().trim().min(1).max(120),
  clientEmail: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
  amount: moneyAmount,
  currency,
  dueDate: isoDate,
});

export const invoiceInputSchema = invoiceFields.superRefine((value, context) => {
  if (value.currency === "USD" && !Number.isInteger(value.amount * 100)) {
    context.addIssue({ code: "custom", path: ["amount"], message: "USD invoices can have up to two decimal places." });
  }
});

export const paymentInputSchema = z.object({
  payerName: z.string().trim().min(1).max(120),
  amount: moneyAmount,
  currency,
  reference: z.string().trim().max(200).default(""),
  receivedAt: isoDate,
}).superRefine((value, context) => {
  if (value.currency === "USD" && !Number.isInteger(value.amount * 100)) {
    context.addIssue({ code: "custom", path: ["amount"], message: "USD payments can have up to two decimal places." });
  }
});

export const invoiceImportSchema = z.object({ invoices: z.array(invoiceInputSchema).min(1).max(500) });
export const paymentImportSchema = z.object({ payments: z.array(paymentInputSchema).min(1).max(500) });

export const matchInputSchema = z.object({ invoiceId: z.string().min(1) });
export const connectAccountSchema = z.object({
  country: z.string().trim().length(2).regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()),
  entityType: z.enum(["individual", "company"]).default("individual"),
});

export function cents(amount: number): number {
  return Math.round(amount * 100);
}

export function atomicUnits(amount: number): number {
  return Math.round(amount * 1_000_000);
}
