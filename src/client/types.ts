export interface User {
  id: string;
  workspaceId: string;
  name: string;
  email: string;
}

export interface Workspace {
  id: string;
  name: string;
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
  source: "manual" | "csv" | "tron";
  walletId: string | null;
  senderAddress: string | null;
  sourceTransactionId: string | null;
  receivedAt: string;
  createdAt: string;
}

export interface Wallet {
  id: string;
  workspaceId: string;
  label: string;
  address: string;
  lastSyncedAt: string | null;
  lastSyncedTimestamp: number;
  syncCursor: string | null;
  historyComplete: boolean;
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
  wallets: Wallet[];
}
