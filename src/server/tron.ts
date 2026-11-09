import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db/client.js";
import { payments, wallets } from "./db/schema.js";
import { z } from "zod";
import { cents } from "./validation.js";

export const TRON_USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const transferPageSchema = z.object({
  data: z.array(z.object({
    transaction_id: z.string().regex(/^[a-fA-F0-9]{64}$/),
    block_timestamp: z.number().int().positive(),
    from: z.string().min(1),
    to: z.string().min(1),
    value: z.string().regex(/^\d+$/),
    token_info: z.object({
      address: z.string(),
      decimals: z.coerce.number().int(),
    }),
    transaction_index: z.union([z.number(), z.string()]).optional(),
  }).passthrough()),
  meta: z.object({ fingerprint: z.string().optional() }).passthrough().optional(),
});

export interface TronTransfer {
  eventId: string;
  transactionId: string;
  senderAddress: string;
  amountAtomic: number;
  amountCents: number;
  receivedAt: string;
  timestamp: number;
}

export interface SyncableWallet {
  id: string;
  workspaceId: string;
  address: string;
  lastSyncedTimestamp: number;
  syncCursor: string | null;
  historyComplete: boolean;
}

export class TronSyncError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "TronSyncError";
    this.status = status;
  }
}

export function isValidTronAddress(address: string): boolean {
  if (address.length < 26 || address.length > 35) return false;
  let value = 0n;
  for (const character of address) {
    const digit = BASE58.indexOf(character);
    if (digit < 0) return false;
    value = value * 58n + BigInt(digit);
  }
  const decoded = value === 0n ? [] : [...Buffer.from(value.toString(16).padStart(Math.ceil(value.toString(16).length / 2) * 2, "0"), "hex")];
  let leadingZeroes = 0;
  while (address[leadingZeroes] === "1") leadingZeroes += 1;
  const payload = Buffer.concat([Buffer.alloc(leadingZeroes), Buffer.from(decoded)]);
  if (payload.length !== 25 || payload[0] !== 0x41) return false;
  const checksum = createHash("sha256").update(createHash("sha256").update(payload.subarray(0, 21)).digest()).digest().subarray(0, 4);
  return checksum.equals(payload.subarray(21));
}

export async function fetchTronTransfers(address: string, fingerprint?: string): Promise<{ transfers: TronTransfer[]; fingerprint?: string }> {
  const apiKey = process.env.TRONGRID_API_KEY;
  if (!apiKey) throw new TronSyncError("TRON transaction sync is not configured yet. Add a TRONGRID_API_KEY to the server environment.", 503);

  const url = new URL(`https://api.trongrid.io/v1/accounts/${encodeURIComponent(address)}/transactions/trc20`);
  url.searchParams.set("only_confirmed", "true");
  url.searchParams.set("limit", "200");
  url.searchParams.set("order_by", "block_timestamp,desc");
  url.searchParams.set("contract_address", TRON_USDT_CONTRACT);
  if (fingerprint) url.searchParams.set("fingerprint", fingerprint);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "TRON-PRO-API-KEY": apiKey },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new TronSyncError("TRON transaction service timed out. Please try syncing again.", 504);
    }
    throw new TronSyncError("Could not reach the TRON transaction service. Please try again.");
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new TronSyncError("The TRON transaction service rejected its API key. Check TRONGRID_API_KEY.", 503);
    }
    if (response.status === 429) {
      throw new TronSyncError("The TRON transaction service is rate-limiting requests. Please try again shortly.", 429);
    }
    throw new TronSyncError(`The TRON transaction service returned an error (${response.status}).`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) throw new TronSyncError("The TRON transaction service returned an unreadable response.");
    throw error;
  }
  const parsed = transferPageSchema.safeParse(payload);
  if (!parsed.success) throw new TronSyncError("The TRON transaction service returned an unexpected response.");

  const transfers: TronTransfer[] = [];
  for (const transfer of parsed.data.data) {
    if (transfer.to !== address || transfer.token_info.address.toLowerCase() !== TRON_USDT_CONTRACT.toLowerCase() || transfer.token_info.decimals !== 6) continue;
    const units = BigInt(transfer.value);
    if (units <= 0n || units > BigInt(Number.MAX_SAFE_INTEGER)) continue;
    const amountAtomic = Number(units);
    const eventParts = [
      transfer.transaction_id.toLowerCase(),
      transfer.transaction_index ?? "",
      transfer.from,
      transfer.to,
      transfer.value,
      transfer.block_timestamp,
    ];
    transfers.push({
      eventId: createHash("sha256").update(JSON.stringify(eventParts)).digest("hex"),
      transactionId: transfer.transaction_id.toLowerCase(),
      senderAddress: transfer.from,
      amountAtomic,
      amountCents: cents(amountAtomic / 1_000_000),
      receivedAt: new Date(transfer.block_timestamp).toISOString().slice(0, 10),
      timestamp: transfer.block_timestamp,
    });
  }

  return { transfers, fingerprint: parsed.data.meta?.fingerprint };
}

export async function syncTronWallet(wallet: SyncableWallet): Promise<{ imported: number; historyComplete: boolean }> {
  let cursor = wallet.historyComplete ? undefined : wallet.syncCursor || undefined;
  let historyComplete = wallet.historyComplete;
  let lastSyncedTimestamp = wallet.lastSyncedTimestamp;
  let imported = 0;
  const maxPagesPerSync = 10;

  for (let page = 0; page < maxPagesPerSync; page += 1) {
    const result = await fetchTronTransfers(wallet.address, cursor);
    const newTransfers = historyComplete
      ? result.transfers.filter((transfer) => transfer.timestamp > wallet.lastSyncedTimestamp)
      : result.transfers;
    const records = newTransfers.map((transfer) => ({
      id: createHash("sha256").update(`${wallet.id}:${transfer.eventId}`).digest("hex"),
      workspaceId: wallet.workspaceId,
      payerName: transfer.senderAddress,
      amountCents: transfer.amountCents,
      amountAtomic: transfer.amountAtomic,
      currency: "USDT",
      reference: transfer.transactionId,
      source: "tron" as const,
      walletId: wallet.id,
      senderAddress: transfer.senderAddress,
      sourceTransactionId: transfer.transactionId,
      sourceEventId: `${wallet.id}:${transfer.eventId}`,
      receivedAt: transfer.receivedAt,
      createdAt: new Date().toISOString(),
    }));

    for (let offset = 0; offset < records.length; offset += 50) {
      const inserted = await db.insert(payments).values(records.slice(offset, offset + 50))
        .onConflictDoNothing().returning({ id: payments.id });
      imported += inserted.length;
    }

    for (const transfer of result.transfers) {
      lastSyncedTimestamp = Math.max(lastSyncedTimestamp, transfer.timestamp);
    }

    if (historyComplete && result.transfers.some((transfer) => transfer.timestamp <= wallet.lastSyncedTimestamp)) {
      cursor = undefined;
      break;
    }
    if (!result.fingerprint) {
      cursor = undefined;
      historyComplete = true;
      break;
    }
    cursor = result.fingerprint;
  }

  await db.update(wallets).set({
    lastSyncedAt: new Date().toISOString(),
    lastSyncedTimestamp,
    syncCursor: historyComplete ? null : cursor || null,
    historyComplete,
  }).where(eq(wallets.id, wallet.id));

  return { imported, historyComplete };
}
