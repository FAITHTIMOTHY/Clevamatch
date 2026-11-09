export interface User {
  id: string;
  workspaceId: string;
  name: string;
  email: string;
}

export interface Workspace {
  id: string;
  name: string;
  bachsAccountId: string | null;
  bachsAccountStatus: string | null;
  bachsCountry: string | null;
}

export interface Invoice {
  id: string;
  workspaceId: string;
  invoiceNumber: string;
  clientName: string;
  clientEmail: string | null;
  amountCents: number;
  amountAtomic: number;
  currency: string;
  dueDate: string;
  publicId: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  workspaceId: string;
  payerName: string;
  amountCents: number;
  amountAtomic: number;
  currency: string;
  reference: string;
  source: "manual" | "csv" | "bachs" | "tron";
  bachsCheckoutId: string | null;
  receivedAt: string;
  createdAt: string;
}

export interface Match {
  invoiceId: string;
  paymentId: string;
  status: "confirmed" | "suggested";
  source: "manual" | "automatic";
}

export interface DashboardData {
  invoices: Invoice[];
  payments: Payment[];
  matches: Match[];
  workspace: Workspace | null;
}
