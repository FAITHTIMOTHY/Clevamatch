import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { api, ApiError } from "./api.js";
import type { DashboardData, Invoice, User, Workspace } from "./types.js";

type AuthMode = "login" | "register";
type InvoiceFilter = "all" | "paid" | "open" | "overdue";
type EntryMode = "invoice";

let bachsInitialized = false;

interface ApiMe {
  user: User;
  workspace: Workspace;
}

function LandingPage({ onGetStarted, onSignIn }: { onGetStarted: () => void; onSignIn: () => void }) {
  return <main className="landing-page">
    <header className="landing-nav">
      <a className="brand" href="#"><span className="brand-mark">s</span><span className="brand-name">Settle<span>Me</span></span></a>
      <nav><a href="#how-it-works">How it works</a><a href="#fees">Fees & payouts</a><a href="#faq">FAQ</a></nav>
      <div><button className="landing-signin" onClick={onSignIn}>Sign in</button><button className="primary-button" onClick={onGetStarted}>Get started <span>→</span></button></div>
    </header>
    <section className="landing-hero">
      <div className="hero-copy">
        <h1>Invoice your clients.<br /><span>Get paid, simply.</span></h1>
        <p>Create an itemized crypto invoice, share one private link, and track payment confirmation in one place. No manual matching or chasing payment screenshots.</p>
        <div className="hero-actions">
          <button className="primary-button" onClick={onGetStarted}>Create your invoice workspace <span>→</span></button>
          <button className="hero-secondary" onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}>See how it works <span>↓</span></button>
        </div>
        <div className="hero-trust"><span>✓</span> Itemized invoices <span className="trust-dot">·</span> One shareable link <span className="trust-dot">·</span> Verified payment status</div>
      </div>
      <div className="hero-art" aria-label="Preview of an itemized invoice and payment status">
        <div className="art-sun" /><div className="art-card"><div className="art-window"><span /><span /><span /></div>
          <div className="art-card-header"><div><small>SETTLEME INVOICES</small><strong>Clear from the start.</strong></div><span className="art-check">✓</span></div>
          <div className="art-metric-row"><div className="art-metric"><small>INVOICE TOTAL</small><strong>2,400 <span>USDT</span></strong></div><div className="art-metric"><small>PAYMENT STATUS</small><strong>Awaiting</strong></div></div>
          <div className="art-invoice-head"><span>DESCRIPTION</span><span>QTY</span><span>LINE TOTAL</span></div>
          <div className="art-invoice-row"><div className="art-client"><span className="art-avatar av-one">01</span><span><b>Product design</b><small>INV-2048</small></span></div><b>1,600</b><span className="art-paid">USDT</span></div>
          <div className="art-invoice-row"><div className="art-client"><span className="art-avatar av-two">02</span><span><b>Prototype review</b><small>Quantity 2 × 400</small></span></div><b>800</b><span className="art-suggested">USDT</span></div>
          <div className="art-floating"><span>✓</span><div><b>Paid status, verified</b><small>Updated after payment confirmation.</small></div></div>
        </div><div className="art-decoration deco-star">✳</div><div className="art-decoration deco-flower">✿</div>
      </div>
    </section>
    <section className="landing-proof"><span>BUILT FOR INDEPENDENT WORK IN NIGERIA</span><div><b>Freelancers</b><i>·</i><b>Consultants</b><i>·</i><b>Small studios</b><i>·</i><b>Project-based teams</b></div></section>
    <section className="landing-how" id="how-it-works">
      <div className="section-intro"><p className="eyebrow">From draft to paid</p><h2>A simple path<br />to <span>payment.</span></h2><p>Set expectations up front, make it easy to pay, and keep the result tied to the invoice.</p></div>
      <div className="how-cards">
        <article><div className="how-icon icon-import">▤</div><span className="step-number">01</span><h3>Build a clear invoice</h3><p>Add your client, describe each service, set quantities and unit prices, and choose a due date. The total is calculated for you.</p></article>
        <article><div className="how-icon icon-match">↗</div><span className="step-number">02</span><h3>Share one private link</h3><p>Your client sees the itemized invoice and total, then pays through the secure crypto checkout available for that invoice.</p></article>
        <article><div className="how-icon icon-review">✓</div><span className="step-number">03</span><h3>Track confirmed payment</h3><p>Payment status changes only after the payment provider confirms it. The invoice and payment stay connected in your workspace.</p></article>
      </div>
    </section>
    <section className="landing-feature" id="why-settleme">
      <div className="feature-mark">s</div>
      <div><p className="eyebrow">Made for client work</p><h2>Less admin.<br />More clarity.</h2><p>SettleMe gives freelancers one place to explain what they did, what’s owed, and whether the client has paid.</p><button className="primary-button" onClick={onGetStarted}>Create your workspace <span>→</span></button></div>
      <ul><li><span>✓</span> Itemized service descriptions, quantities, and prices</li><li><span>✓</span> Shareable invoice pages with due dates</li><li><span>✓</span> Crypto-only checkout using enabled methods</li><li><span>✓</span> Payment records tied to confirmed invoices</li><li><span>✓</span> Payout setup handled through a connected account</li></ul>
    </section>
    <section className="landing-details" id="fees">
      <div className="details-intro"><p className="eyebrow">Fees & payouts</p><h2>Know what happens<br />to every payment.</h2><p>Clear terms help you and your client start on the same page.</p></div>
      <div className="details-grid">
        <article><span className="details-icon">3.5%</span><h3>Platform fee</h3><p>SettleMe deducts a 3.5% fee from the freelancer’s proceeds after a successful payment. It is not added on top of the invoice total your client sees.</p></article>
        <article><span className="details-icon">↗</span><h3>Processing & payout</h3><p>Payment processing fees are separate and depend on the enabled payment method. Funds go to your connected payout account; SettleMe does not hold money for manual payouts.</p></article>
        <article><span className="details-icon">◎</span><h3>Your payout details</h3><p>Complete identity checks and payout setup through the payment provider. SettleMe does not collect or store your raw bank account details.</p></article>
      </div>
      <p className="details-note">Supported crypto assets and networks depend on availability and account approval. You’ll only be able to create invoices using methods enabled for SettleMe.</p>
    </section>
    <section className="landing-faq" id="faq">
      <div className="details-intro"><p className="eyebrow">Good to know</p><h2>Frequently asked<br />questions.</h2></div>
      <div className="faq-list">
        <details><summary>Can I email an invoice from SettleMe?</summary><p>Not yet. Create the invoice, copy its private link, and send it using your usual email or messaging app.</p></details>
        <details><summary>How can my client pay?</summary><p>SettleMe currently supports crypto payments only. The invoice form shows the asset and network options enabled for your account. Your client needs access to a supported payment method.</p></details>
        <details><summary>How do I know a payment went through?</summary><p>The invoice is marked paid only after the payment provider sends a verified confirmation. Returning to the invoice page alone never marks it as paid.</p></details>
        <details><summary>Does the client pay the 3.5% SettleMe fee?</summary><p>No. The 3.5% platform fee is deducted from the freelancer’s proceeds. Payment processing fees are separate and also come from the freelancer’s proceeds.</p></details>
        <details><summary>Does SettleMe store my bank account or hold my money?</summary><p>No. Payout onboarding and payout details are handled by the connected payment provider. SettleMe does not collect raw bank details or manually hold and forward funds.</p></details>
      </div>
    </section>
    <footer className="landing-footer"><a className="brand" href="#"><span className="brand-mark">s</span><span className="brand-name">Settle<span>Me</span></span></a><span>Itemized invoicing and crypto payments for independent work.</span><button onClick={onSignIn}>Already have an account? Sign in</button></footer>
  </main>;
}

interface InvoiceDraft {
  invoiceNumber: string;
  clientName: string;
  clientEmail: string;
  currency: string;
  dueDate: string;
  items: Array<{ description: string; quantity: string; unitAmount: string }>;
}

interface ImportedInvoice {
  invoiceNumber: string;
  clientName: string;
  clientEmail?: string;
  amount: number;
  currency: string;
  dueDate: string;
}

const today = () => new Date().toISOString().slice(0, 10);

const CACHE_KEY = "settleme_cache";
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

interface CachedDashboard {
  user: User;
  workspace: Workspace;
  data: DashboardData;
  timestamp: number;
}

function getCachedData(): CachedDashboard | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: CachedDashboard = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > CACHE_TTL) return null;
    return parsed;
  } catch {
    return null;
  }
}

function setCachedData(user: User | null, workspace: Workspace | null, data: DashboardData): void {
  if (!user || !workspace) return;
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ user, workspace, data, timestamp: Date.now() }));
  } catch {
    // ignore storage errors
  }
}

function clearCachedData(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

const cryptoCurrencies = [
  { value: "USDT_TRC20", label: "USDT · TRON (TRC-20)" },
  { value: "USDT_BEP20", label: "USDT · BNB Smart Chain (BEP-20)" },
  { value: "USDT_ERC20", label: "USDT · Ethereum (ERC-20)" },
  { value: "USDT_SOL", label: "USDT · Solana" },
  { value: "USDC_BEP20", label: "USDC · BNB Smart Chain (BEP-20)" },
];
const currencyNames: Record<string, string> = {
  USD: "USD",
  USDT: "USDT · TRON (TRC-20)",
  USDT_TRC20: "USDT · TRON (TRC-20)",
  USDT_BEP20: "USDT · BNB Smart Chain (BEP-20)",
  USDT_ERC20: "USDT · Ethereum (ERC-20)",
  USDT_SOL: "USDT · Solana",
  USDC_BEP20: "USDC · BNB Smart Chain (BEP-20)",
};
const currencyLabel = (currency: string) => currencyNames[currency] || currency;
const money = (amountAtomic: number, currency = "USD") => currency === "USD"
  ? new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amountAtomic / 1_000_000)
  : `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(amountAtomic / 1_000_000)} ${currencyLabel(currency)}`;
const moneyTotals = (records: Array<{ amountAtomic: number; currency: string }>) =>
  ["USD", ...cryptoCurrencies.map((currency) => currency.value)].map((currency) => {
    const total = records.filter((record) => record.currency === currency).reduce((sum, record) => sum + record.amountAtomic, 0);
    return total ? money(total, currency) : "";
  }).filter(Boolean).join(" · ") || money(0, "USDT_TRC20");
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
const prettyDate = (date: string) => {
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

function parseCsv(text: string): Array<Record<string, string>> {
  const records: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === '"' && quoted && text[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) records.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) records.push(row);
  if (records.length < 2) return [];
  const headers = records.shift()!.map((header) => header.toLowerCase().replace(/[^a-z0-9]/g, ""));
  return records.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function csvValue(record: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== "") return record[key]!;
  }
  return "";
}

function parseAmount(value: string): number | null {
  const amount = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function parseDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function Icon({ children }: { children: string }) {
  return <span className="nav-icon" aria-hidden="true">{children}</span>;
}

function AuthScreen({ onAuthenticated, initialMode, onBack }: { onAuthenticated: (data: ApiMe) => void; initialMode: AuthMode; onBack: () => void }) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      let result: ApiMe;
      if (mode === "register") {
        result = await api<ApiMe>("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({ name, companyName, email, password }),
        }, 30_000);
      } else {
        result = await api<ApiMe>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        }, 30_000);
      }
      onAuthenticated(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not sign you in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-visual">
        <div className="brand auth-brand"><span className="brand-mark">s</span><span className="brand-name">Settle<span>Me</span></span></div>
        <div className="auth-hero-copy">
          <h1>Invoice clients.<br />Get paid.</h1>
          <p>Create a clear invoice, share a private payment link, and let clients check out securely without leaving your invoice page.</p>
        </div>
        <div className="auth-decoration decor-one" /><div className="auth-decoration decor-two" />
      </div>
      <section className="auth-form-side">
        <div className="auth-form-wrap">
          <button className="auth-back-link brand" type="button" onClick={onBack}><span className="brand-mark">s</span><span className="brand-name">Settle<span>Me</span></span></button>
          <div className="auth-heading"><p className="eyebrow">{mode === "register" ? "Start invoicing" : "Welcome back"}</p><h2>{mode === "register" ? "Create your invoice workspace" : "Sign in to your account"}</h2><p>{mode === "register" ? "Create invoices, share payment links, and follow each client payment from one place." : "Your client invoices, payment links, and checkout updates are right where you left them."}</p></div>
          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            {mode === "register" && <>
              <label>Your name<input autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ada Morgan" /></label>
              <label>Workspace or business name<input autoComplete="organization" required minLength={2} maxLength={100} value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Sunday Studio" /></label>
            </>}
            <label>Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@yourstudio.com" /></label>
            <label>Password<span className="password-input-wrap"><input type={showPassword ? "text" : "password"} autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 10 : 1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "register" ? "At least 10 characters" : "Your password"} /><button className="password-visibility-toggle" type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.2-6 9.5-6 9.5 6 9.5 6-3.2 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.7" />{showPassword && <path d="m4 4 16 16" />}</svg></button></span></label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="primary-button auth-submit" disabled={busy}>{busy ? "One moment..." : mode === "register" ? "Create your workspace" : "Sign in"} <span aria-hidden="true">→</span></button>
          </form>
          <p className="auth-switch">{mode === "register" ? "Already have a workspace?" : "New to SettleMe?"} <button type="button" onClick={() => { setError(""); setMode(mode === "register" ? "login" : "register"); }}>{mode === "register" ? "Sign in" : "Create an account"}</button></p>
        </div>
      </section>
    </main>
  );
}

function DashboardApp() {
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [loading, setLoading] = useState(false);
  const [fatalError, setFatalError] = useState("");
  const [toast, setToast] = useState("");
  const [filter, setFilter] = useState<InvoiceFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("due");
  const [entryMode, setEntryMode] = useState<EntryMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft>({
    invoiceNumber: "", clientName: "", clientEmail: "", currency: "USDT_TRC20", dueDate: "",
    items: [{ description: "", quantity: "1", unitAmount: "" }],
  });
  const [connectCountry, setConnectCountry] = useState("NG");
  const [connectEntityType, setConnectEntityType] = useState<"individual" | "company">("individual");
  const [modalError, setModalError] = useState("");
  const invoiceFileRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const reload = useCallback(async () => {
    try {
      const dashboard = await api<DashboardData>("/api/dashboard", {}, 30_000, 3);
      setData(dashboard);
      setWorkspace(dashboard.workspace);
      if (user) setCachedData(user, dashboard.workspace, dashboard);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearCachedData();
        setUser(null);
        setWorkspace(null);
        setData(null);
        setAuthMode("login");
        return;
      }
      throw error;
    }
  }, [user]);

  useEffect(() => {
    let active = true;

    // Restore from cache immediately so the dashboard appears instantly,
    // then refresh in the background.
    const cached = getCachedData();
    if (cached && !user) {
      setUser(cached.user);
      setWorkspace(cached.workspace);
      setData(cached.data);
    }

    async function load() {
      setLoading(true);
      try {
        // Fetch session user first — the dashboard shell needs this to show.
        const meResult = await api<ApiMe>("/api/me", {}, 10_000, 3);

        if (!active) return;
        setUser(meResult.user);
        setWorkspace(meResult.workspace);

        // Dashboard data loads independently — if it fails, the shell still shows.
        try {
          const dashboardResult = await api<DashboardData>("/api/dashboard", {}, 30_000, 3);
          if (!active) return;
          setData(dashboardResult);
          setWorkspace(dashboardResult.workspace);
          setCachedData(meResult.user, dashboardResult.workspace, dashboardResult);
        } catch (dashboardError) {
          if (!active) return;
          // Only show fatal error if we have no cached data to fall back on
          if (!data) {
            setFatalError(
              dashboardError instanceof Error
                ? dashboardError.message
                : "Could not load your workspace.",
            );
          }
        }
      } catch (error: unknown) {
        if (error instanceof ApiError && error.status === 401) {
          // Session invalid — clear cache and show login screen
          clearCachedData();
          setUser(null);
          setWorkspace(null);
          setData(null);
          return;
        }
        if (active && !data) {
          setFatalError(error instanceof Error ? error.message : "Could not load your workspace.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, []);

  const authHistoryPushed = useRef(false);

  // Make the browser back button return to the landing page instead of
  // leaving the site entirely while the user is signing in / registering.
  useEffect(() => {
    if (!authMode) {
      authHistoryPushed.current = false;
      return;
    }

    if (!authHistoryPushed.current) {
      window.history.pushState({ auth: true }, "");
      authHistoryPushed.current = true;
    }

    function onPopState() {
      setAuthMode(null);
      authHistoryPushed.current = false;
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [authMode]);

  useEffect(() => {
    if (loading || user || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const updateSpread = () => {
      const cards = document.querySelector<HTMLElement>(".how-cards");
      if (!cards) return;
      const { top } = cards.getBoundingClientRect();
      const start = window.innerHeight * 0.8;
      const progress = Math.min(1, Math.max(0, (start - top) / (window.innerHeight * 0.55)));
      const desiredDistance = window.matchMedia("(max-width: 720px)").matches ? 28 : 132;
      const bounds = cards.getBoundingClientRect();
      const availableSpace = Math.max(0, Math.min(bounds.left, window.innerWidth - bounds.right) - 8);
      const distance = Math.min(desiredDistance, availableSpace);
      cards.style.setProperty("--feature-left-x", `${-distance * progress}px`);
      cards.style.setProperty("--feature-left-tilt", `${-3 * progress}deg`);
      cards.style.setProperty("--feature-center-y", `${-14 * progress}px`);
      cards.style.setProperty("--feature-right-x", `${distance * progress}px`);
      cards.style.setProperty("--feature-right-tilt", `${3 * progress}deg`);
    };

    updateSpread();
    window.addEventListener("scroll", updateSpread, { passive: true });
    window.addEventListener("resize", updateSpread);
    return () => {
      window.removeEventListener("scroll", updateSpread);
      window.removeEventListener("resize", updateSpread);
    };
  }, [loading, user]);

  const invoices = data?.invoices || [];
  const payments = data?.payments || [];
  const matches = data?.matches || [];
  const enabledCurrencyCodes: string[] = Array.isArray(data?.availableInvoiceCurrencies)
    ? data.availableInvoiceCurrencies
    : [cryptoCurrencies[0]!.value];
  const invoiceCurrencyOptions = useMemo(
    () => cryptoCurrencies.filter((currency) => enabledCurrencyCodes.includes(currency.value)),
    [enabledCurrencyCodes],
  );

  useEffect(() => {
    if (invoiceCurrencyOptions.length && !invoiceCurrencyOptions.some((currency) => currency.value === invoiceDraft.currency)) {
      setInvoiceDraft((draft) => ({ ...draft, currency: invoiceCurrencyOptions[0]!.value }));
    }
  }, [invoiceCurrencyOptions, invoiceDraft.currency]);
  const paymentForInvoice = useMemo(() => new Map(matches.map((match) => [match.invoiceId, match])), [matches]);
  const receivedAmount = moneyTotals(payments.filter((payment) => payment.receivedAt.slice(0, 7) === today().slice(0, 7)));
  const openAmount = moneyTotals(invoices.filter((invoice) => paymentForInvoice.get(invoice.id)?.status !== "confirmed"));
  const filteredInvoices = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    const todayDate = today();
    return [...invoices].filter((invoice) => {
      const status = paymentForInvoice.get(invoice.id)?.status === "confirmed" ? "paid" : invoice.dueDate < todayDate ? "overdue" : "open";
      const matchesFilter = filter === "all" || filter === status;
      const matchesQuery = !term || `${invoice.invoiceNumber} ${invoice.clientName} ${invoice.clientEmail || ""}`.toLocaleLowerCase().includes(term);
      return matchesFilter && matchesQuery;
    }).sort((left, right) => sort === "amount" ? right.amountAtomic - left.amountAtomic : sort === "client" ? left.clientName.localeCompare(right.clientName) : left.dueDate.localeCompare(right.dueDate));
  }, [filter, invoices, paymentForInvoice, search, sort]);

  function showToast(message: string) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3400);
  }

  async function handleAuthenticated(result: ApiMe) {
    setUser(result.user);
    setWorkspace(result.workspace);
    setFatalError("");
    // Dashboard shell already shows immediately — fetch data in background.
    void reload().catch(() => {
      // reload already sets fatalError or redirects to login on 401
    });
  }

  async function retryLoad() {
    setFatalError("");
    setLoading(true);
    try {
      const dashboard = await api<DashboardData>("/api/dashboard", {}, 30_000, 3);
      setData(dashboard);
      setWorkspace(dashboard.workspace);
      if (user) setCachedData(user, dashboard.workspace, dashboard);
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : "Could not load your workspace.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    try {
      await api<void>("/api/auth/logout", { method: "POST" });
      setUser(null);
      setWorkspace(null);
      setData(null);
      setAuthMode(null);
      setFilter("all");
      showToast("You’ve been signed out.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not sign out.");
    }
  }

  async function submitInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setModalError("");
    setBusy(true);
    try {
      await api("/api/invoices", {
        method: "POST",
        body: JSON.stringify({
          ...invoiceDraft,
          items: invoiceDraft.items.map((item) => ({
            ...item,
            quantity: Number(item.quantity),
            unitAmount: Number(item.unitAmount),
          })),
        }),
      });
      setEntryMode(null);
      setInvoiceDraft({
        invoiceNumber: "", clientName: "", clientEmail: "", currency: "USDT_TRC20", dueDate: "",
        items: [{ description: "", quantity: "1", unitAmount: "" }],
      });
      await reload();
      showToast("Itemized invoice added. Copy its payment link to share with your client.");
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "Could not save this invoice.");
    } finally {
      setBusy(false);
    }
  }

  function updateInvoiceItem(index: number, field: "description" | "quantity" | "unitAmount", value: string) {
    setInvoiceDraft((draft) => ({
      ...draft,
      items: draft.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
    }));
  }

  function addInvoiceItem() {
    setInvoiceDraft((draft) => ({
      ...draft,
      items: [...draft.items, { description: "", quantity: "1", unitAmount: "" }],
    }));
  }

  function removeInvoiceItem(index: number) {
    setInvoiceDraft((draft) => ({
      ...draft,
      items: draft.items.length > 1 ? draft.items.filter((_, itemIndex) => itemIndex !== index) : draft.items,
    }));
  }

  const draftLineTotalAtomic = (item: InvoiceDraft["items"][number]) => {
    const unitAmount = Number(item.unitAmount);
    const quantity = Number(item.quantity);
    if (!Number.isFinite(unitAmount) || unitAmount <= 0 || !Number.isFinite(quantity) || quantity <= 0) return 0;
    const unitAtomic = BigInt(Math.round(unitAmount * 1_000_000));
    const quantityMilli = BigInt(Math.round(quantity * 1_000));
    return Number((unitAtomic * quantityMilli + 500n) / 1_000n);
  };
  const draftTotalAtomic = invoiceDraft.items.reduce((sum, item) => sum + draftLineTotalAtomic(item), 0);

  async function startPayoutSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const { onboardingUrl } = await api<{ onboardingUrl: string }>("/api/connect/onboarding", {
        method: "POST",
        body: JSON.stringify({ country: connectCountry, entityType: connectEntityType }),
      });
      window.location.assign(onboardingUrl);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not start payout setup.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshPayoutStatus() {
    setBusy(true);
    try {
      const result = await api<{ connected: boolean; status: string }>("/api/connect/status");
      await reload();
      showToast(result.status === "ready"
        ? "Your freelancer payouts are ready."
        : result.connected ? "Payout setup is still being reviewed or needs your details." : "Set up freelancer payouts to accept invoice payments.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not refresh payout status.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!user || !new URLSearchParams(window.location.search).has("connect")) return;
    window.history.replaceState(null, "", window.location.pathname);
    void refreshPayoutStatus();
  }, [user]);

  async function copyInvoiceLink(invoice: Invoice) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/pay/${invoice.publicId}`);
      showToast(`Payment link copied for ${invoice.invoiceNumber}.`);
    } catch (error) {
      showToast(error instanceof Error ? "Could not copy the payment link." : "Clipboard access is unavailable in this browser.");
    }
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const records = parseCsv(await file.text());
      if (!records.length) throw new Error("This CSV is empty or does not have a header row.");
      const rows: ImportedInvoice[] = records.map((record) => {
        const amount = parseAmount(csvValue(record, "amount", "total", "invoiceamount"));
        const dueDate = parseDate(csvValue(record, "duedate", "due"));
        const invoiceNumber = csvValue(record, "invoicenumber", "invoiceid", "invoice", "id");
        const clientName = csvValue(record, "clientname", "client", "customername", "customer");
        if (!invoiceNumber || !clientName || !amount || !dueDate) throw new Error("Each invoice needs an invoice ID, client, amount, and due date.");
        return {
          invoiceNumber, clientName,
          clientEmail: csvValue(record, "clientemail", "email") || undefined,
          amount,
          currency: csvValue(record, "currency").toUpperCase() || "USDT_TRC20",
          dueDate,
        };
      });
      const result = await api<{ imported: number; skipped: number }>("/api/invoices/import", {
        method: "POST",
        body: JSON.stringify({ invoices: rows }),
      });
      await reload();
      showToast(`${result.imported} invoice${result.imported === 1 ? "" : "s"} imported · ${result.skipped} duplicates skipped.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not import that CSV file.");
    } finally {
      setBusy(false);
    }
  }

  function downloadCsvTemplate() {
    const content = "invoice_number,client_name,client_email,amount,currency,due_date\nINV-3001,Acme Studio,finance@example.com,1250.00,USDT_TRC20,2026-12-01\n";
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "settleme-invoices-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportInvoices() {
    const link = document.createElement("a");
    link.href = "/api/export/invoices.csv";
    link.click();
  }

  function setNavFilter(next: InvoiceFilter) {
    setFilter(next);
    setMobileMenuOpen(false);
    document.getElementById("invoices")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const confirmedMatches = matches.filter((match) => match.status === "confirmed");
  const recentPayments = [...payments].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).slice(0, 5);

  if (!user) {
    if (!authMode) return <LandingPage onGetStarted={() => setAuthMode("register")} onSignIn={() => setAuthMode("login")} />;
    return <><AuthScreen initialMode={authMode} onBack={() => setAuthMode(null)} onAuthenticated={(result) => void handleAuthenticated(result)} />{fatalError && <div className="toast show" role="alert">{fatalError}</div>}</>;
  }

  return (
    <div className="app-shell">
      {mobileMenuOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMobileMenuOpen(false)} />}
      <aside className={`sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <a className="brand" href="#overview" onClick={() => setNavFilter("all")}><span className="brand-mark">s</span><span className="brand-name">Settle<span>Me</span></span></a>
        <div className="workspace-switch"><span className="workspace-avatar">{initials(workspace?.name || "WS")}</span><div className="workspace-meta"><strong>{workspace?.name}</strong><small>Business workspace</small></div><span className="workspace-chevron">⌄</span></div>
        <p className="nav-label">Workspace</p>
        <nav className="nav">
          <button className={filter === "all" ? "active" : ""} onClick={() => setNavFilter("all")}><Icon>◫</Icon>Overview</button>
          <button className={filter === "open" || filter === "overdue" ? "active" : ""} onClick={() => setNavFilter("open")}><Icon>▤</Icon>Invoices</button>
          <button onClick={() => { setMobileMenuOpen(false); document.getElementById("activity")?.scrollIntoView({ behavior: "smooth" }); }}><Icon>↙</Icon>Payment activity</button>
          <button onClick={() => { setMobileMenuOpen(false); document.getElementById("summary")?.scrollIntoView({ behavior: "smooth" }); }}><Icon>▥</Icon>Reports</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="tip-card"><div className="tip-icon">☕</div><strong>A little less admin.</strong><p>Keep payment records in one place, so you have more room for the work you love.</p></div>
          <div className="profile"><span className="profile-avatar">{initials(user.name)}</span><div className="profile-copy"><strong>{user.name}</strong><small>{user.email}</small></div><button className="profile-menu" title="Sign out" aria-label="Sign out" onClick={() => void logout()}>↪</button></div>
        </div>
      </aside>

      <main className="main-area" id="overview">
        <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu-button" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu">☰</button><div className="breadcrumb">Workspace <span>/</span> <strong>Overview</strong></div></div><div className="top-actions"><span className="connected-badge"><span /> Your workspace</span><button className="icon-button" title="Help" onClick={() => showToast("Create an itemized invoice, then copy and share its payment link with your client.")}>?</button></div></header>

        <div className="content">
          {!data && !fatalError ? (
            <div className="loading-screen"><div className="loading-spinner" /><p>Loading your workspace...</p></div>
          ) : fatalError ? (
            <div className="empty-state"><div className="empty-icon">⚠</div><strong>Could not load your workspace.</strong><p>{fatalError}</p><button className="primary-button" onClick={retryLoad}>Try again</button></div>
          ) : (
            <>
              <section className="welcome">
            <div><p className="eyebrow">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p><h1>Good morning, {user.name.split(" ")[0]} <span aria-hidden="true">☀️</span></h1><p className="subtitle">Create and share client invoices, then track every payment from sent to paid.</p></div>
            <div className="welcome-actions"><button className="primary-button" onClick={() => setEntryMode("invoice")}><span>＋</span> Create invoice</button></div>
          </section>

          <section className="stats" id="summary" aria-label="Business payment summary">
            <article className="stat-card"><div className="stat-top"><span>Payments received this month</span><span className="stat-icon">↙</span></div><div className="stat-value">{receivedAmount}</div><div className="stat-note">{payments.length} payment{payments.length === 1 ? "" : "s"} recorded against your invoices</div></article>
            <article className="stat-card"><div className="stat-top"><span>Paid invoices</span><span className="stat-icon">✓</span></div><div className="stat-value">{confirmedMatches.length}<span className="stat-context">of {invoices.length} invoices</span></div><div className="stat-note">Confirmed payments</div></article>
            <article className="stat-card"><div className="stat-top"><span>Awaiting payment</span><span className="stat-icon">◷</span></div><div className="stat-value">{openAmount}</div><div className="stat-note">{invoices.length - confirmedMatches.length} invoice{invoices.length - confirmedMatches.length === 1 ? "" : "s"} not yet confirmed paid</div></article>
            <article className="stat-card"><div className="stat-top"><span>Overdue invoices</span><span className="stat-icon">!</span></div><div className="stat-value">{invoices.filter((invoice) => invoice.dueDate < today() && paymentForInvoice.get(invoice.id)?.status !== "confirmed").length}</div><div className="stat-note">Past due and not yet paid</div></article>
          </section>

          <section className="connect-panel panel">
            <div className="panel-head"><div className="panel-title"><h2>Set up freelancer payouts</h2><p>SettleMe connects your payout account so clients can pay your invoices from their invoice page.</p></div></div>
            <div className="connect-status">
              <span className={`status ${workspace?.bachsAccountStatus === "ready" ? "paid" : "open"}`}>
                {workspace?.bachsAccountStatus === "ready" ? "Ready to accept payments" : workspace?.bachsAccountId ? "Payout setup in progress" : "Payout setup needed"}
              </span>
              <p>Clients can pay without creating a separate SettleMe account. Your connected payout account is set up as part of this flow; you may need to complete identity checks and add payout details before receiving funds.</p>
              <p>Only crypto assets and networks confirmed for SettleMe and enabled for your payout account can be used to create invoices.</p>
            </div>
            <form className="connect-form" onSubmit={(event) => void startPayoutSetup(event)}>
              <label>Country code<input required minLength={2} maxLength={2} value={workspace?.bachsCountry || connectCountry} onChange={(event) => setConnectCountry(event.target.value.toUpperCase())} disabled={Boolean(workspace?.bachsAccountId)} placeholder="NG" autoComplete="country" /></label>
              <label>Account type<select value={connectEntityType} onChange={(event) => setConnectEntityType(event.target.value as "individual" | "company")}><option value="individual">Individual freelancer</option><option value="company">Registered business</option></select></label>
              <button className="primary-button" disabled={busy}>{workspace?.bachsAccountId ? "Continue payout setup" : "Set up payouts"}</button>
              {workspace?.bachsAccountId && <button className="secondary-button" type="button" disabled={busy} onClick={() => void refreshPayoutStatus()}>Refresh payout status</button>}
            </form>
            <p className="connect-disclaimer">SettleMe deducts a 3.5% platform fee from each successful invoice payment. Payment processing fees are additional and separate. Available methods depend on provider approval and your account’s enabled capabilities.</p>
          </section>


          <section className="panel" id="invoices">
            <div className="panel-head"><div className="panel-title"><h2>Client invoices</h2><p>Create an itemized invoice, share its payment link, and see when it’s paid.</p></div><div className="panel-actions"><button className="secondary-button" onClick={() => invoiceFileRef.current?.click()} disabled={busy}>↑ Import invoices</button><button className="secondary-button" onClick={exportInvoices} disabled={invoices.length === 0}>↓ Export invoices</button></div></div>
            <div className="table-tools"><div className="tabs" role="tablist" aria-label="Filter invoices">{(["all", "paid", "open", "overdue"] as InvoiceFilter[]).map((item) => <button key={item} role="tab" aria-selected={filter === item} className={`tab ${filter === item ? "active" : ""}`} onClick={() => setFilter(item)}>{item === "all" ? `All (${invoices.length})` : item[0]!.toUpperCase() + item.slice(1)}</button>)}</div><div className="tool-right"><input className="search" type="search" aria-label="Search invoices" placeholder="Search invoices or clients..." value={search} onChange={(event) => setSearch(event.target.value)} /><select className="filter-select" aria-label="Sort invoices" value={sort} onChange={(event) => setSort(event.target.value)}><option value="due">Sort: due date</option><option value="amount">Sort: amount</option><option value="client">Sort: client</option></select></div></div>
            <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Client</th><th>Amount</th><th>Due date</th><th>Status</th><th>Payment</th><th>Share</th></tr></thead><tbody>
              {filteredInvoices.map((invoice) => {
                const match = paymentForInvoice.get(invoice.id);
                const payment = match && payments.find((item) => item.id === match.paymentId);
                const status = match?.status === "confirmed" ? "paid" : invoice.dueDate < today() ? "overdue" : "open";
                return <tr key={invoice.id}><td><span className="invoice-id">{invoice.invoiceNumber}</span></td><td><div className="client-cell"><span className="client-avatar">{initials(invoice.clientName)}</span><span><span className="client-name">{invoice.clientName}</span><span className="client-email">{invoice.clientEmail || "No email added"}</span></span></div></td><td className="amount">{money(invoice.amountAtomic, invoice.currency)}</td><td className={`due-date ${status === "overdue" ? "late" : ""}`}>{prettyDate(invoice.dueDate)}</td><td><span className={`status ${status}`}>{status === "paid" ? "Paid" : status === "overdue" ? "Overdue" : "Awaiting"}</span></td><td className={`match-cell ${match ? "has-match" : ""}`}>{match && payment ? <>✓ Paid · {payment.payerName} <small>{prettyDate(payment.receivedAt)}</small></> : "Awaiting payment"}</td><td><button className="row-action" onClick={() => void copyInvoiceLink(invoice)}>Copy link</button></td></tr>;
              })}
            </tbody></table>
            {filteredInvoices.length === 0 && <div className="empty-state"><div className="empty-icon">{invoices.length ? "⌕" : "▤"}</div><strong>{invoices.length ? "No invoices found" : "Your first client invoice starts here"}</strong><p>{invoices.length ? "Try a different search or status filter." : "Add an invoice, then share its secure payment link with your client."}</p>{invoices.length === 0 && <button className="primary-button" onClick={() => setEntryMode("invoice")}>＋ Create your first invoice</button>}</div>}
            </div>
            <div className="table-foot"><span>Showing {filteredInvoices.length} of {invoices.length} invoices</span><button onClick={downloadCsvTemplate}>Download invoice CSV template</button></div>
          </section>

          <div className="bottom-grid">
            <section className="activity" id="activity"><div className="section-heading"><h3>Confirmed payments</h3><span>Provider verified</span></div>
              {recentPayments.length === 0 ? <div className="empty-activity"><span>↙</span><strong>No client payments yet</strong><small>Payments confirmed by the provider will appear here and update the matching invoice automatically.</small></div> : recentPayments.map((payment) => {
                const invoice = invoices.find((item) => paymentForInvoice.get(item.id)?.paymentId === payment.id);
                return <div className="activity-item" key={payment.id}><div className="activity-icon">✓</div><div className="activity-copy"><strong>{payment.payerName}</strong><small>{invoice ? `Paid · ${invoice.invoiceNumber}` : payment.reference || "Payment confirmed"} · {prettyDate(payment.receivedAt)}</small></div><div className="activity-trailing"><span className="activity-amount">{money(payment.amountAtomic, payment.currency)}</span></div></div>;
              })}
            </section>
            <section className="attention"><div className="attention-count">{invoices.filter((invoice) => paymentForInvoice.get(invoice.id)?.status !== "confirmed").length}</div><h3>{!invoices.length ? "Create your first client invoice" : invoices.some((invoice) => paymentForInvoice.get(invoice.id)?.status !== "confirmed") ? "Invoices awaiting payment" : "Every invoice is paid"}</h3><p>{!invoices.length ? "Add an invoice, connect your payout account, and share its payment link with your client." : invoices.some((invoice) => paymentForInvoice.get(invoice.id)?.status !== "confirmed") ? "Share each invoice’s payment link and follow its status here. Payments are confirmed before invoices are marked paid." : "Your client payments are confirmed. Create another invoice whenever you’re ready."}</p><button className="secondary-button" onClick={() => invoices.length ? document.getElementById("invoices")?.scrollIntoView({ behavior: "smooth" }) : setEntryMode("invoice")}>{invoices.length ? "View client invoices →" : "＋ Create your first invoice"}</button></section>
          </div>
          <div className="footer-note">SettleMe · Crypto invoice management</div>
            </>
          )}
        </div>
      </main>

      <input ref={invoiceFileRef} type="file" accept=".csv,text/csv" className="visually-hidden" onChange={(event) => void importCsv(event)} />
      {entryMode && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setEntryMode(null); setModalError(""); } }}><section className="modal-card invoice-modal" role="dialog" aria-modal="true" aria-labelledby="entry-title">
        <div className="modal-head"><div><p className="eyebrow">Client billing</p><h2 id="entry-title">Create an invoice</h2><p>Add line items, then share the invoice’s payment link with your client.</p></div><button className="dialog-close" aria-label="Close" onClick={() => { setEntryMode(null); setModalError(""); }}>×</button></div>
        <form className="entry-form" onSubmit={(event) => void submitInvoice(event)}>
          <label>Invoice number<input required maxLength={60} value={invoiceDraft.invoiceNumber} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, invoiceNumber: event.target.value })} placeholder="INV-2048" /></label>
          <label>Client name<input required maxLength={120} value={invoiceDraft.clientName} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, clientName: event.target.value })} placeholder="Northstar Studio" /></label>
          <label>Client email <span className="optional-label">optional</span><input type="email" maxLength={254} value={invoiceDraft.clientEmail} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, clientEmail: event.target.value })} placeholder="hello@client.com" /></label>
          <div className="form-row"><label>Invoice currency<select value={invoiceDraft.currency} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, currency: event.target.value })} disabled={!invoiceCurrencyOptions.length}>{invoiceCurrencyOptions.map((currency) => <option key={currency.value} value={currency.value}>{currency.label}</option>)}</select></label><label>Due date<input required type="date" value={invoiceDraft.dueDate} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, dueDate: event.target.value })} /></label></div>
          <div className="invoice-items-editor">
            <div className="invoice-items-heading"><strong>Line items</strong><span>Description · quantity · unit price</span></div>
            {invoiceDraft.items.map((item, index) => <div className="invoice-item-editor" key={index}>
              <label>Description<input required maxLength={200} value={item.description} onChange={(event) => updateInvoiceItem(index, "description", event.target.value)} placeholder="Design services" /></label>
              <div className="invoice-item-numbers">
                <label>Qty<input required type="number" min="0.001" max="10000" step="0.001" value={item.quantity} onChange={(event) => updateInvoiceItem(index, "quantity", event.target.value)} /></label>
                <label>Unit price<input required type="number" min="0.000001" max="10000000" step="0.000001" value={item.unitAmount} onChange={(event) => updateInvoiceItem(index, "unitAmount", event.target.value)} placeholder="0.00" /></label>
                <strong>{money(draftLineTotalAtomic(item), invoiceDraft.currency)}</strong>
                <button className="remove-line-item" type="button" aria-label={`Remove line ${index + 1}`} disabled={invoiceDraft.items.length === 1} onClick={() => removeInvoiceItem(index)}>×</button>
              </div>
            </div>)}
            <button className="text-button add-line-item" type="button" disabled={invoiceDraft.items.length >= 50} onClick={addInvoiceItem}>＋ Add line item</button>
            <div className="invoice-totals"><span>Subtotal</span><strong>{money(draftTotalAtomic, invoiceDraft.currency)}</strong><span>Total due</span><strong>{money(draftTotalAtomic, invoiceDraft.currency)}</strong></div>
          </div>
          <p className="form-helper">{invoiceCurrencyOptions.length
            ? "Only crypto methods confirmed and enabled for SettleMe are shown. Availability is checked again at checkout."
            : "No crypto payment method is enabled yet. Contact SettleMe support before creating new invoices."}</p>
          {modalError && <div className="form-error" role="alert">{modalError}</div>}
          <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setEntryMode(null)}>Cancel</button><button className="primary-button" disabled={busy || !invoiceCurrencyOptions.length || draftTotalAtomic <= 0}>{busy ? "Saving..." : "Create invoice"}</button></div>
        </form>
        <button className="modal-import-link" onClick={() => { setEntryMode(null); invoiceFileRef.current?.click(); }}>Import invoices from CSV →</button>
      </section></div>}

      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}

interface PublicInvoiceData {
  invoice: {
    invoiceNumber: string;
    amountAtomic: number;
    currency: string;
    dueDate: string;
    clientName: string;
    items: Array<{
      description: string;
      quantity: number;
      unitAmountAtomic: number;
      lineTotalAtomic: number;
    }>;
    paid: boolean;
    workspaceName: string;
  };
  checkoutStatus: string;
}

function PublicInvoicePage({ publicId }: { publicId: string }) {
  const [data, setData] = useState<PublicInvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(new URLSearchParams(window.location.search).get("payment") === "success");
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const result = await api<PublicInvoiceData>(`/api/public/invoices/${encodeURIComponent(publicId)}`);
    setData(result);
    if (result.invoice.paid) setCheckingPayment(false);
  }, [publicId]);

  useEffect(() => {
    let active = true;
    reload().catch((requestError: unknown) => {
      if (active) setError(requestError instanceof Error ? requestError.message : "Could not load this invoice.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => {
    if (!checkingPayment) return;
    const interval = window.setInterval(() => {
      void reload().catch((requestError: unknown) => {
        setError(requestError instanceof Error ? requestError.message : "Could not check payment status.");
      });
    }, 2500);
    const timeout = window.setTimeout(() => setCheckingPayment(false), 30000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [checkingPayment, reload]);

  async function payInvoice() {
    setError("");
    setBusy(true);
    try {
      const { checkoutUrl } = await api<{ checkoutUrl: string }>(
        `/api/public/invoices/${encodeURIComponent(publicId)}/checkout`,
        { method: "POST" },
      );
      if (!window.Bachs) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://checkout.bachs.io/bachs.js";
          script.async = true;
          script.onload = () => window.Bachs ? resolve() : reject(new Error("Secure checkout did not initialize."));
          script.onerror = () => reject(new Error("Could not load secure checkout. Check your connection and try again."));
          document.head.appendChild(script);
        });
      }
      if (!window.Bachs) throw new Error("Secure checkout is unavailable. Please try again.");
      if (!bachsInitialized) {
        window.Bachs.Initialize({
          onEvent: (event) => {
            if (event.type === "checkout.completed") setCheckingPayment(true);
          },
        });
        bachsInitialized = true;
      }
      await window.Bachs.Checkout.open({ checkoutUrl });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not open checkout.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="public-invoice-page"><div className="public-invoice-card">Loading invoice…</div></main>;
  if (!data) return <main className="public-invoice-page"><div className="public-invoice-card"><h1>Invoice unavailable</h1><p>{error || "This invoice link may have expired."}</p></div></main>;

  const { invoice } = data;
  return <main className="public-invoice-page">
    <article className="public-invoice-card">
      <a className="brand" href="/"><span className="brand-mark">s</span><span className="brand-name">Settle<span>Me</span></span></a>
      <p className="eyebrow">Invoice from</p>
      <h1>{invoice.workspaceName}</h1>
      <div className="public-invoice-number">{invoice.invoiceNumber}</div>
      <p className="public-invoice-client">Billed to {invoice.clientName}</p>
      <div className="public-invoice-items">
        {invoice.items.map((item, index) => <div className="public-invoice-item" key={`${item.description}-${index}`}>
          <div><strong>{item.description}</strong><small>{item.quantity} × {money(item.unitAmountAtomic, invoice.currency)}</small></div>
          <strong>{money(item.lineTotalAtomic, invoice.currency)}</strong>
        </div>)}
        <div className="public-invoice-total"><span>Total due</span><strong>{money(invoice.amountAtomic, invoice.currency)}</strong></div>
      </div>
      <p className="public-invoice-due">Due {prettyDate(invoice.dueDate)}</p>
      {invoice.paid
        ? <div className="public-invoice-paid" role="status">✓ Payment confirmed. Thank you.</div>
        : <button className="primary-button public-pay-button" disabled={busy} onClick={() => void payInvoice()}>{busy ? "Opening secure checkout…" : `Pay ${money(invoice.amountAtomic, invoice.currency)}`}</button>}
      {checkingPayment && !invoice.paid && <p className="public-payment-check" role="status">Payment submitted. Waiting for secure confirmation…</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="public-invoice-footnote">Secure crypto checkout is provided by our payment partner. SettleMe does not store your payment details.</p>
    </article>
  </main>;
}

export default function App() {
  const payMatch = window.location.pathname.match(/^\/pay\/([a-f0-9]{32})$/i);
  return payMatch ? <PublicInvoicePage publicId={payMatch[1]!} /> : <DashboardApp />;
}
