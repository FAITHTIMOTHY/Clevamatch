import { createHmac, timingSafeEqual } from "node:crypto";

interface BachsAccount {
  id: string;
  is_active?: boolean;
}

interface BachsAccountLink {
  url: string;
}

interface BachsCheckout {
  checkout_id: string;
  checkout_url: string;
  amount?: string;
  currency?: string;
  expires_at?: string;
}

interface BachsResponse<T> {
  data?: T;
  error?: { message?: string };
  message?: string;
}

export const bachsCryptoCurrencies = [
  "USDT_TRC20",
  "USDT_BEP20",
  "USDT_ERC20",
  "USDT_SOL",
  "USDC_BEP20",
] as const;
export type BachsCryptoCurrency = typeof bachsCryptoCurrencies[number];

export class BachsError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "BachsError";
    this.status = status;
  }
}

export function getEnabledBachsCryptoCurrencies(): BachsCryptoCurrency[] {
  const configured = process.env.BACHS_SUPPORTED_CRYPTO_CURRENCIES;
  if (!configured?.trim()) return [];
  const requested = configured.split(",").map((currency) => currency.trim().toUpperCase()).filter(Boolean);
  const supported = new Set<string>(bachsCryptoCurrencies);
  const invalid = requested.filter((currency) => !supported.has(currency));
  if (invalid.length) {
    throw new BachsError(`Unsupported currency in BACHS_SUPPORTED_CRYPTO_CURRENCIES: ${invalid.join(", ")}.`, 503);
  }
  const enabled = new Set(requested);
  return bachsCryptoCurrencies.filter((currency) => enabled.has(currency));
}

function getCredentials(): { key: string; baseUrl: string } {
  const key = process.env.BACHS_SECRET_KEY;
  if (!key) throw new BachsError("Payments are not configured yet. Please try again later.", 503);
  if (key.startsWith("sk_sandbox_")) return { key, baseUrl: "https://sandbox-api.bachs.io" };
  if (key.startsWith("sk_live_")) return { key, baseUrl: "https://api.bachs.io" };
  throw new BachsError("The Bachs secret key has an unsupported format.", 503);
}

async function bachsRequest<T>(
  path: string,
  options: { method?: "GET" | "POST"; body?: unknown; accountId?: string; idempotencyKey?: string } = {},
): Promise<T> {
  const { key, baseUrl } = getCredentials();
  const headers: Record<string, string> = {
    Authorization: "Bearer " + key,
    Accept: "application/json",
  };
  if (options.body) headers["Content-Type"] = "application/json";
  if (options.accountId) headers["X-Account-Id"] = options.accountId;
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers,
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new BachsError("Could not reach Bachs. Please try again.");
  }

  const payload = await response.json().catch(() => null) as BachsResponse<T> | null;
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || "Bachs could not complete this request.";
    throw new BachsError(message, response.status >= 400 && response.status < 500 ? response.status : 502);
  }
  if (payload === null) throw new BachsError("Bachs returned an unreadable response.");
  return (payload.data ?? payload) as T;
}

export function createBachsAccount(input: {
  email: string;
  displayName: string;
  country: string;
  entityType: "individual" | "company";
}): Promise<BachsAccount> {
  return bachsRequest<BachsAccount>("/v1/accounts", {
    method: "POST",
    idempotencyKey: `cleva-workspace-${input.email}`,
    body: {
      contact_email: input.email,
      display_name: input.displayName,
      country: input.country,
      entity_type: input.entityType,
      configuration: {
        merchant: {
          capabilities: {
            crypto: { requested: true },
          },
        },
        recipient: {
          capabilities: {
            payouts: { requested: true },
            transfers: { requested: true },
          },
        },
      },
    },
  });
}

export function createBachsOnboardingLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string,
): Promise<BachsAccountLink> {
  return bachsRequest<BachsAccountLink>(`/v1/accounts/${encodeURIComponent(accountId)}/account-links`, {
    method: "POST",
    body: { type: "onboarding", refresh_url: refreshUrl, return_url: returnUrl },
  });
}

export function getBachsCapabilities(accountId: string): Promise<{ items: Array<{ name: string; status: string }> }> {
  return bachsRequest(`/v1/accounts/${encodeURIComponent(accountId)}/capabilities`);
}

export function createBachsCheckout(input: {
  accountId: string;
  amount: string;
  currency: BachsCryptoCurrency;
  platformFee: string;
  email: string | null;
  customerName: string;
  successUrl: string;
  cancelUrl: string;
  idempotencyKey: string;
}): Promise<BachsCheckout> {
  return bachsRequest<BachsCheckout>("/v1/checkout-sessions", {
    method: "POST",
    accountId: input.accountId,
    idempotencyKey: input.idempotencyKey,
    body: {
      pricing: { amount: input.amount, currency: input.currency },
      platform_fee: input.platformFee,
      customer: {
        name: input.customerName,
        ...(input.email ? { email: input.email } : {}),
      },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    },
  });
}

export function verifyBachsSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  const secret = process.env.BACHS_WEBHOOK_SECRET;
  if (!secret) throw new BachsError("Payment webhooks are not configured.", 503);
  if (!signatureHeader) return false;

  const parts = signatureHeader.split(",");
  const timestampPart = parts.find((part) => part.trim().startsWith("t="))?.trim().slice(2);
  const timestamp = Number(timestampPart);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;

  const signatures = parts
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3))
    .filter((signature) => /^[a-f0-9]{64}$/i.test(signature));
  if (!signatures.length) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody.toString("utf8")}`).digest();
  return signatures.some((signature) => timingSafeEqual(Buffer.from(signature, "hex"), expected));
}
