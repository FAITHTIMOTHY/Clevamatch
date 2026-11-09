import { z } from "zod";

function hasPrecision(value: number, precision: number): boolean {
  const [coefficient, exponentText] = value.toString().toLowerCase().split("e");
  const decimalPlaces = coefficient!.split(".")[1]?.length || 0;
  const exponent = exponentText ? Number(exponentText) : 0;
  return decimalPlaces - exponent <= precision;
}

const moneyAmount = z.coerce.number().finite().positive().max(10_000_000)
  .refine((value) => hasPrecision(value, 6), "Amounts can have up to six decimal places.");
const invoiceCurrency = z.enum(["USDT_TRC20", "USDT_BEP20", "USDT_ERC20", "USDT_SOL", "USDC_BEP20"]);
const importedCurrency = z.enum(["USD", "USDT_TRC20", "USDT_BEP20", "USDT_ERC20", "USDT_SOL", "USDC_BEP20", "USDT"])
  .transform((value) => value === "USDT" ? "USDT_TRC20" : value);
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
  currency: invoiceCurrency,
  dueDate: isoDate,
  items: z.array(z.object({
    description: z.string().trim().min(1).max(200),
    quantity: z.coerce.number().finite().min(0.001).max(10_000)
      .refine((value) => hasPrecision(value, 3), "Quantity can have up to three decimal places."),
    unitAmount: moneyAmount,
  })).min(1).max(50),
});

export const invoiceInputSchema = invoiceFields.superRefine((value, context) => {
  const total = value.items.reduce((sum, item) => {
    const unitAtomic = BigInt(Math.round(item.unitAmount * 1_000_000));
    const quantityMilli = BigInt(Math.round(item.quantity * 1_000));
    return sum + (unitAtomic * quantityMilli + 500n) / 1_000n;
  }, 0n);
  if (total > 10_000_000_000_000n) {
    context.addIssue({ code: "custom", path: ["items"], message: "Invoice total cannot exceed 10,000,000." });
  }
});

const legacyInvoiceImportSchema = z.object({
  invoiceNumber: z.string().trim().min(1).max(60),
  clientName: z.string().trim().min(1).max(120),
  clientEmail: z.union([z.string().trim().email().max(254), z.literal("")]).optional(),
  amount: moneyAmount,
  currency: importedCurrency.default("USD"),
  dueDate: isoDate,
}).superRefine((value, context) => {
  if (value.currency === "USD" && !hasPrecision(value.amount, 2)) {
    context.addIssue({ code: "custom", path: ["amount"], message: "USD invoices can have up to two decimal places." });
  }
});

export const invoiceImportSchema = z.object({ invoices: z.array(legacyInvoiceImportSchema).min(1).max(500) });
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

export function quantityMilli(quantity: number): number {
  return Math.round(quantity * 1_000);
}

export function lineTotalAtomic(unitAmount: number, quantity: number): number {
  const unitAtomic = BigInt(atomicUnits(unitAmount));
  const quantityUnits = BigInt(quantityMilli(quantity));
  return Number((unitAtomic * quantityUnits + 500n) / 1_000n);
}
