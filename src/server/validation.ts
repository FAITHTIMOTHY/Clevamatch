import { z } from "zod";

const currency = z.literal("USDT").default("USDT");
const moneyAmount = z.coerce.number().finite().positive().max(10_000_000)
  .refine((value) => Number.isInteger(value * 1_000_000), "USDT amounts can have up to six decimal places.");
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

export const invoiceInputSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(60),
  clientName: z.string().trim().min(1).max(120),
  clientEmail: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
  amount: moneyAmount,
  currency,
  dueDate: isoDate,
});

export const paymentInputSchema = z.object({
  payerName: z.string().trim().min(1).max(120),
  amount: moneyAmount,
  currency,
  reference: z.string().trim().max(200).default(""),
  receivedAt: isoDate,
});

export const invoiceImportSchema = z.object({ invoices: z.array(invoiceInputSchema).min(1).max(500) });
export const paymentImportSchema = z.object({ payments: z.array(paymentInputSchema).min(1).max(500) });

export const matchInputSchema = z.object({ invoiceId: z.string().min(1) });
export const walletInputSchema = z.object({
  label: z.string().trim().min(1).max(60),
  address: z.string().trim().min(26).max(35),
});

export function cents(amount: number): number {
  return Math.round(amount * 100);
}

export function atomicUnits(amount: number): number {
  return Math.round(amount * 1_000_000);
}
