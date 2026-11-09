import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { api, ApiError } from "./api.js";
import type { DashboardData, Invoice, Match, Payment, User, Workspace } from "./types.js";

type AuthMode = "login" | "register";
type InvoiceFilter = "all" | "paid" | "open" | "overdue" | "review";
type EntryMode = "invoice" | "payment";

let bachsInitialized = false;

interface ApiMe {
  user: User;
  workspace: Workspace;
}

function LandingPage({ onGetStarted, onSignIn }: { onGetStarted: () => void; onSignIn: () => void }) {
  return <main className="landing-page">
    <header className="landing-nav"><a className="brand" href="#"><span className="brand-mark">c</span><span className="brand-name">cleva<span>match</span></span></a><nav><a href="#how-it-works">How it works</a><a href="#why-cleva">Why Cleva Match</a></nav><div><button className="landing-signin" onClick={onSignIn}>Sign in</button><button className="primary-button" onClick={onGetStarted}>Get started <span>→</span></button></div></header>
    <section className="landing-hero">
      <div className="hero-copy"><h1>Invoice your clients.<br /><span>Get paid, simply.</span></h1><p>Create a professional invoice, share one link, and let clients pay through secure Bachs checkout without leaving your page. Payment status updates when Bachs confirms it.</p><div className="hero-actions"><button className="primary-button" onClick={onGetStarted}>Create your invoice workspace <span>→</span></button><button className="hero-secondary" onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}>See how it works <span>↓</span></button></div><div className="hero-trust"><span>✓</span> Shareable invoice links <span className="trust-dot">·</span> Embedded Bachs checkout <span className="trust-dot">·</span> Automatic payment confirmation</div></div>
      <div className="hero-art" aria-label="Preview of invoices and payment status"><div className="art-sun" /><div className="art-card"><div className="art-window"><span /><span /><span /></div><div className="art-card-header"><div><small>MONDAY, NOVEMBER 9</small><strong>Your invoices, sorted.</strong></div><span className="art-check">✓</span></div><div className="art-metric-row"><div className="art-metric"><small>PAID THIS MONTH</small><strong>$8,140</strong></div><div className="art-metric"><small>INVOICES PAID</small><strong>4 <span>/ 6</span></strong></div></div><div className="art-invoice-head"><span>INVOICE</span><span>AMOUNT</span><span>STATUS</span></div><div className="art-invoice-row"><div className="art-client"><span className="art-avatar av-one">NS</span><span><b>Northstar Studio</b><small>INV-2048</small></span></div><b>$2,400</b><span className="art-paid">✓ Paid</span></div><div className="art-invoice-row"><div className="art-client"><span className="art-avatar av-two">BC</span><span><b>Bloom Creative</b><small>INV-2051</small></span></div><b>$1,850</b><span className="art-suggested">↗ Sent</span></div><div className="art-invoice-row"><div className="art-client"><span className="art-avatar av-three">OL</span><span><b>Orbit Labs</b><small>INV-2054</small></span></div><b>$3,200</b><span className="art-open">◷ Awaiting</span></div><div className="art-floating"><span>✓</span><div><b>Payment confirmed</b><small>Your invoice status is up to date.</small></div></div></div><div className="art-decoration deco-star">✳</div><div className="art-decoration deco-flower">✿</div></div>
    </section>
    <section className="landing-proof"><span>INVOICING THAT FITS YOUR INDEPENDENT WORK</span><div><b>Freelancers</b><i>·</i><b>Consultants</b><i>·</i><b>Small studios</b><i>·</i><b>Global clients</b></div></section>
    <section className="landing-how" id="how-it-works"><div className="section-intro"><p className="eyebrow">From draft to paid</p><h2>Get your time<br />back from <span>admin.</span></h2><p>One simple flow for professional invoices, client checkout, and knowing when the money arrives.</p></div><div className="how-cards"><article><div className="how-icon icon-import">▤</div><span className="step-number">01</span><h3>Create your invoice</h3><p>Add your client, amount, and due date. Keep every invoice organized in your workspace.</p></article><article><div className="how-icon icon-match">↗</div><span className="step-number">02</span><h3>Share the payment link</h3><p>Your client gets a private invoice page with the amount due and a clear way to pay.</p></article><article><div className="how-icon icon-review">✓</div><span className="step-number">03</span><h3>Know when it’s paid</h3><p>Bachs checkout opens on the invoice page. Verified payment confirmation updates your dashboard.</p></article></div></section>
    <section className="landing-feature" id="why-cleva"><div className="feature-mark">c</div><div><p className="eyebrow">The nice-and-simple promise</p><h2>One invoice link.<br />From sent to paid.</h2><p>Give clients a straightforward way to pay while you keep invoice details and payment status together in one workspace.</p><button className="primary-button" onClick={onGetStarted}>Create your workspace <span>→</span></button></div><ul><li><span>✓</span> Professional freelancer invoices</li><li><span>✓</span> Shareable client payment pages</li><li><span>✓</span> Bachs checkout stays on-page</li><li><span>✓</span> 3.5% platform fee on paid invoices</li><li><span>✓</span> Bachs processing fees are separate</li></ul></section>
    <footer className="landing-footer"><a className="brand" href="#"><span className="brand-mark">c</span><span className="brand-name">cleva<span>match</span></span></a><span>Client invoicing and embedded payment collection for freelancers.</span><button onClick={onSignIn}>Already have an account? Sign in</button></footer>
  </main>;
}

interface InvoiceDraft {
  invoiceNumber: string;
  clientName: string;
  clientEmail: string;
  amount: string;
  currency: string;
  dueDate: string;
}

interface PaymentDraft {
  payerName: string;
  amount: string;
  currency: string;
  reference: string;
  receivedAt: string;
}

interface ImportedInvoice {
  invoiceNumber: string;
  clientName: string;
  clientEmail?: string;
  amount: number;
  currency: string;
  dueDate: string;
}

interface ImportedPayment {
  payerName: string;
  amount: number;
  currency: string;
  reference: string;
  receivedAt: string;
}

const today = () => new Date().toISOString().slice(0, 10);
const money = (amountAtomic: number, currency = "USD") => currency !== "USD"
  ? `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(amountAtomic / 1_000_000)} ${currency === "USDT_ERC20" ? "USDT (ERC-20)" : "USDT (TRC-20)"}`
  : new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amountAtomic / 1_000_000);
const moneyTotals = (records: Array<{ amountAtomic: number; currency: string }>) =>
  ["USD", "USDT_TRC20", "USDT_ERC20"].map((currency) => {
    const total = records.filter((record) => record.currency === currency).reduce((sum, record) => sum + record.amountAtomic, 0);
    return total ? money(total, currency) : "";
  }).filter(Boolean).join(" · ") || money(0, "USD");
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
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register") {
        await api<{ user: User }>("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({ name, companyName, email, password }),
        });
      } else {
        await api<{ user: User }>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
      }
      onAuthenticated(await api<ApiMe>("/api/me"));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not sign you in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-visual">
        <div className="brand auth-brand"><span className="brand-mark">c</span><span className="brand-name">cleva<span>match</span></span></div>
        <div className="auth-hero-copy">
          <h1>Invoice clients.<br />Get paid.</h1>
          <p>Create a clear invoice, share a private payment link, and let clients check out securely with Bachs without leaving your invoice page.</p>
        </div>
        <div className="auth-decoration decor-one" /><div className="auth-decoration decor-two" />
      </div>
      <section className="auth-form-side">
        <div className="auth-form-wrap">
          <button className="auth-back-link brand" type="button" onClick={onBack}><span className="brand-mark">c</span><span className="brand-name">cleva<span>match</span></span></button>
          <div className="auth-heading"><p className="eyebrow">{mode === "register" ? "Start invoicing" : "Welcome back"}</p><h2>{mode === "register" ? "Create your invoice workspace" : "Sign in to your account"}</h2><p>{mode === "register" ? "Create invoices, share payment links, and follow each client payment from one place." : "Your client invoices, payment links, and checkout updates are right where you left them."}</p></div>
          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            {mode === "register" && <>
              <label>Your name<input autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ada Morgan" /></label>
              <label>Workspace or business name<input autoComplete="organization" required minLength={2} maxLength={100} value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Sunday Studio" /></label>
            </>}
            <label>Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@yourstudio.com" /></label>
            <label>Password<input type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 10 : 1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "register" ? "At least 10 characters" : "Your password"} /></label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="primary-button auth-submit" disabled={busy}>{busy ? "One moment..." : mode === "register" ? "Create your workspace" : "Sign in"} <span aria-hidden="true">→</span></button>
          </form>
          <p className="auth-switch">{mode === "register" ? "Already have a workspace?" : "New to Cleva Match?"} <button type="button" onClick={() => { setError(""); setMode(mode === "register" ? "login" : "register"); }}>{mode === "register" ? "Sign in" : "Create an account"}</button></p>
          <p className="auth-footnote">Your workspace is for creating and managing client invoices. Checkout is handled by Bachs; Cleva Match does not store clients’ card or crypto payment details.</p>
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
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState("");
  const [toast, setToast] = useState("");
  const [filter, setFilter] = useState<InvoiceFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("due");
  const [entryMode, setEntryMode] = useState<EntryMode | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft>({ invoiceNumber: "", clientName: "", clientEmail: "", amount: "", currency: "USD", dueDate: "" });
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft>({ payerName: "", amount: "", currency: "USD", reference: "", receivedAt: today() });
  const [connectCountry, setConnectCountry] = useState("US");
  const [connectEntityType, setConnectEntityType] = useState<"individual" | "company">("individual");
  const [modalError, setModalError] = useState("");
  const invoiceFileRef = useRef<HTMLInputElement>(null);
  const paymentFileRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const reload = useCallback(async () => {
    const dashboard = await api<DashboardData>("/api/dashboard");
    setData(dashboard);
    setWorkspace(dashboard.workspace);
  }, []);

  useEffect(() => {
    let active = true;
    api<ApiMe>("/api/me").then((result) => {
      if (!active) return;
      setUser(result.user);
      setWorkspace(result.workspace);
      return api<DashboardData>("/api/dashboard").then((dashboard) => { if (active) setData(dashboard); });
    }).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) return;
      if (active) setFatalError(error instanceof Error ? error.message : "Could not load your workspace.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

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
  const paymentForInvoice = useMemo(() => new Map(matches.map((match) => [match.invoiceId, match])), [matches]);
  const invoiceForPayment = useMemo(() => new Map(matches.map((match) => [match.paymentId, match])), [matches]);
  const matchByInvoice = useMemo(() => new Map(invoices.map((invoice) => [invoice.id, paymentForInvoice.get(invoice.id)])), [invoices, paymentForInvoice]);
  const unmatchedPayments = payments.filter((payment) => !invoiceForPayment.has(payment.id));
  const selectedPaymentCandidates = selectedPayment ? invoices.filter((invoice) =>
    !paymentForInvoice.has(invoice.id) && invoice.amountAtomic === selectedPayment.amountAtomic && invoice.currency === selectedPayment.currency,
  ) : [];
  const receivedAmount = moneyTotals(payments.filter((payment) => payment.receivedAt.slice(0, 7) === today().slice(0, 7)));
  const openAmount = moneyTotals(invoices.filter((invoice) => paymentForInvoice.get(invoice.id)?.status !== "confirmed"));
  const filteredInvoices = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    const todayDate = today();
    return [...invoices].filter((invoice) => {
      const match = matchByInvoice.get(invoice.id);
      const status = match?.status === "confirmed" ? "paid" : match?.status === "suggested" ? "review" : invoice.dueDate < todayDate ? "overdue" : "open";
      const matchesFilter = filter === "all" || filter === status || (filter === "open" && status === "review");
      const matchesQuery = !term || `${invoice.invoiceNumber} ${invoice.clientName} ${invoice.clientEmail || ""}`.toLocaleLowerCase().includes(term);
      return matchesFilter && matchesQuery;
    }).sort((left, right) => sort === "amount" ? right.amountAtomic - left.amountAtomic : sort === "client" ? left.clientName.localeCompare(right.clientName) : left.dueDate.localeCompare(right.dueDate));
  }, [filter, invoices, matchByInvoice, search, sort]);

  function showToast(message: string) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3400);
  }

  async function handleAuthenticated(result: ApiMe) {
    setUser(result.user);
    setWorkspace(result.workspace);
    setFatalError("");
    setLoading(true);
    try {
      await reload();
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
      setAuthMode("login");
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
        body: JSON.stringify({ ...invoiceDraft, amount: Number(invoiceDraft.amount) }),
      });
      setEntryMode(null);
      setInvoiceDraft({ invoiceNumber: "", clientName: "", clientEmail: "", amount: "", currency: "USD", dueDate: "" });
      await reload();
      showToast("Invoice added to your workspace.");
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "Could not save this invoice.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setModalError("");
    setBusy(true);
    try {
      await api("/api/payments", {
        method: "POST",
        body: JSON.stringify({ ...paymentDraft, amount: Number(paymentDraft.amount) }),
      });
      setEntryMode(null);
      setPaymentDraft({ payerName: "", amount: "", currency: "USD", reference: "", receivedAt: today() });
      await reload();
      showToast("Payment saved. We’ve checked for invoice matches.");
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "Could not save this payment.");
    } finally {
      setBusy(false);
    }
  }

  async function startBachsOnboarding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const { onboardingUrl } = await api<{ onboardingUrl: string }>("/api/connect/onboarding", {
        method: "POST",
        body: JSON.stringify({ country: connectCountry, entityType: connectEntityType }),
      });
      window.location.assign(onboardingUrl);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not start Bachs onboarding.");
    } finally {
      setBusy(false);
    }
  }

  async function refreshBachsStatus() {
    setBusy(true);
    try {
      const result = await api<{ connected: boolean; status: string }>("/api/connect/status");
      await reload();
      showToast(result.status === "ready"
        ? "Your freelancer payouts are ready."
        : result.connected ? "Payout setup is still being reviewed or needs your details." : "Set up freelancer payouts to accept invoice payments.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not refresh Bachs account status.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!user || !new URLSearchParams(window.location.search).has("connect")) return;
    window.history.replaceState(null, "", window.location.pathname);
    void refreshBachsStatus();
  }, [user]);

  async function copyInvoiceLink(invoice: Invoice) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/pay/${invoice.publicId}`);
      showToast(`Payment link copied for ${invoice.invoiceNumber}.`);
    } catch (error) {
      showToast(error instanceof Error ? "Could not copy the payment link." : "Clipboard access is unavailable in this browser.");
    }
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>, type: EntryMode) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const records = parseCsv(await file.text());
      if (!records.length) throw new Error("This CSV is empty or does not have a header row.");
      if (type === "invoice") {
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
            currency: csvValue(record, "currency").toUpperCase() || "USD",
            dueDate,
          };
        });
        const result = await api<{ imported: number; skipped: number }>("/api/invoices/import", {
          method: "POST",
          body: JSON.stringify({ invoices: rows }),
        });
        await reload();
        showToast(`${result.imported} invoice${result.imported === 1 ? "" : "s"} imported · ${result.skipped} duplicates skipped.`);
      } else {
        const rows: ImportedPayment[] = records.map((record) => {
          const amount = parseAmount(csvValue(record, "amount", "total"));
          const receivedAt = parseDate(csvValue(record, "receiveddate", "date", "transactiondate"));
          const payerName = csvValue(record, "payer", "payername", "sender", "clientname", "client", "customer");
          if (!payerName || !amount || !receivedAt) throw new Error("Each payment needs a date, payer, and amount.");
          return {
            payerName, amount,
            currency: csvValue(record, "currency").toUpperCase() || "USD",
            reference: csvValue(record, "reference", "memo", "description", "transactionreference"),
            receivedAt,
          };
        });
        const result = await api<{ imported: number; skipped: number }>("/api/payments/import", {
          method: "POST",
          body: JSON.stringify({ payments: rows }),
        });
        await reload();
        showToast(`${result.imported} payment${result.imported === 1 ? "" : "s"} imported · ${result.skipped} duplicates skipped.`);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not import that CSV file.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmMatch(paymentId: string, invoiceId: string) {
    setBusy(true);
    try {
      await api(`/api/payments/${encodeURIComponent(paymentId)}/match`, { method: "POST", body: JSON.stringify({ invoiceId }) });
      await reload();
      setSelectedPayment(null);
      setSelectedInvoiceId("");
      showToast("Payment matched to invoice.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save that match.");
      if (error instanceof ApiError && error.status === 409) await reload();
    } finally {
      setBusy(false);
    }
  }

  async function dismissMatch(paymentId: string, invoiceId: string) {
    setBusy(true);
    try {
      await api(`/api/payments/${encodeURIComponent(paymentId)}/dismiss-match`, {
        method: "POST",
        body: JSON.stringify({ invoiceId }),
      });
      await reload();
      showToast("Suggestion dismissed. You can still match this payment manually.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not dismiss that suggestion.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMatch(invoice: Invoice) {
    const match = paymentForInvoice.get(invoice.id);
    if (!match || match.status !== "confirmed") return;
    setBusy(true);
    try {
      await api(`/api/invoices/${encodeURIComponent(invoice.id)}/match`, { method: "DELETE" });
      await reload();
      showToast("Match removed. The invoice is open again.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not remove that match.");
    } finally {
      setBusy(false);
    }
  }

  function startManualMatch(payment: Payment) {
    const openCandidates = invoices.filter((invoice) =>
      !paymentForInvoice.has(invoice.id) && invoice.amountAtomic === payment.amountAtomic && invoice.currency === payment.currency,
    );
    setSelectedPayment(payment);
    setSelectedInvoiceId(openCandidates[0]?.id || "");
  }

  function downloadCsvTemplate(type: EntryMode) {
    const content = type === "invoice"
      ? "invoice_number,client_name,client_email,amount,currency,due_date\nINV-3001,Acme Studio,finance@example.com,1250.00,USD,2026-12-01\n"
      : "received_date,payer,amount,currency,reference\n2026-11-09,Acme Studio,1250.00,USD,INV-3001\n";
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `cleva-match-${type}-template.csv`;
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

  const suggestedMatches = matches.filter((match) => match.status === "suggested");
  const confirmedMatches = matches.filter((match) => match.status === "confirmed");
  const recentPayments = [...payments].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).slice(0, 5);

  if (loading) {
    return <main className="loading-screen"><div className="brand"><span className="brand-mark">c</span><span className="brand-name">cleva<span>match</span></span></div><div className="loading-spinner" /><p>Getting your workspace ready...</p></main>;
  }
  if (!user || !data) {
    if (!authMode) return <LandingPage onGetStarted={() => setAuthMode("register")} onSignIn={() => setAuthMode("login")} />;
    return <><AuthScreen initialMode={authMode} onBack={() => setAuthMode(null)} onAuthenticated={(result) => void handleAuthenticated(result)} />{fatalError && <div className="toast show" role="alert">{fatalError}</div>}</>;
  }

  return (
    <div className="app-shell">
      {mobileMenuOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMobileMenuOpen(false)} />}
      <aside className={`sidebar ${mobileMenuOpen ? "mobile-open" : ""}`}>
        <a className="brand" href="#overview" onClick={() => setNavFilter("all")}><span className="brand-mark">c</span><span className="brand-name">cleva<span>match</span></span></a>
        <div className="workspace-switch"><span className="workspace-avatar">{initials(workspace?.name || "WS")}</span><div className="workspace-meta"><strong>{workspace?.name}</strong><small>Business workspace</small></div><span className="workspace-chevron">⌄</span></div>
        <p className="nav-label">Workspace</p>
        <nav className="nav">
          <button className={filter === "all" ? "active" : ""} onClick={() => setNavFilter("all")}><Icon>◫</Icon>Overview</button>
          <button className={filter === "open" || filter === "overdue" ? "active" : ""} onClick={() => setNavFilter("open")}><Icon>▤</Icon>Invoices</button>
          <button className={filter === "review" ? "active" : ""} onClick={() => { setNavFilter("review"); document.getElementById("activity")?.scrollIntoView({ behavior: "smooth" }); }}><Icon>↗</Icon>Payment activity{unmatchedPayments.length + suggestedMatches.length > 0 && <span className="nav-count">{unmatchedPayments.length + suggestedMatches.length}</span>}</button>
          <button onClick={() => { setMobileMenuOpen(false); document.getElementById("summary")?.scrollIntoView({ behavior: "smooth" }); }}><Icon>▥</Icon>Reports</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="tip-card"><div className="tip-icon">☕</div><strong>A little less admin.</strong><p>Keep payment records in one place, so you have more room for the work you love.</p></div>
          <div className="profile"><span className="profile-avatar">{initials(user.name)}</span><div className="profile-copy"><strong>{user.name}</strong><small>{user.email}</small></div><button className="profile-menu" title="Sign out" aria-label="Sign out" onClick={() => void logout()}>↪</button></div>
        </div>
      </aside>

      <main className="main-area" id="overview">
        <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu-button" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu">☰</button><div className="breadcrumb">Workspace <span>/</span> <strong>Overview</strong></div></div><div className="top-actions"><span className="connected-badge"><span /> Your workspace</span><button className="icon-button" title="Help" onClick={() => showToast("Import invoices and payments from CSV, or add records one at a time.")}>?</button><button className="icon-button notification-button" title="Payment alerts" onClick={() => showToast(unmatchedPayments.length ? `${unmatchedPayments.length} payment${unmatchedPayments.length === 1 ? "" : "s"} without a match.` : "You’re all caught up.")}>♧{unmatchedPayments.length > 0 && <span className="notification-dot" />}</button></div></header>

        <div className="content">
          <section className="welcome">
            <div><p className="eyebrow">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p><h1>Good morning, {user.name.split(" ")[0]} <span aria-hidden="true">☀️</span></h1><p className="subtitle">Create and share client invoices, then track every payment from sent to paid.</p></div>
            <div className="welcome-actions"><button className="primary-button" onClick={() => setEntryMode("invoice")}><span>＋</span> Create invoice</button></div>
          </section>

          <section className="stats" id="summary" aria-label="Business payment summary">
            <article className="stat-card"><div className="stat-top"><span>Payments received this month</span><span className="stat-icon">↙</span></div><div className="stat-value">{receivedAmount}</div><div className="stat-note">{payments.length} payment{payments.length === 1 ? "" : "s"} recorded against your invoices</div></article>
            <article className="stat-card"><div className="stat-top"><span>Paid invoices</span><span className="stat-icon">✓</span></div><div className="stat-value">{confirmedMatches.length}<span className="stat-context">of {invoices.length} invoices</span></div><div className="stat-note">Confirmed payments</div></article>
            <article className="stat-card"><div className="stat-top"><span>Awaiting payment</span><span className="stat-icon">◷</span></div><div className="stat-value">{openAmount}</div><div className="stat-note">{invoices.length - confirmedMatches.length} invoice{invoices.length - confirmedMatches.length === 1 ? "" : "s"} not yet confirmed paid</div></article>
            <article className="stat-card"><div className="stat-top"><span>Payment follow-up</span><span className="stat-icon">!</span></div><div className="stat-value">{unmatchedPayments.length + suggestedMatches.length}<span className="stat-context">item{unmatchedPayments.length + suggestedMatches.length === 1 ? "" : "s"}</span></div><div className="stat-note">{suggestedMatches.length} to review · {unmatchedPayments.length} unmatched</div></article>
          </section>

          <section className="connect-panel panel">
            <div className="panel-head"><div className="panel-title"><h2>Set up freelancer payouts</h2><p>Cleva Match connects your payout account so clients can pay your invoices from their invoice page.</p></div></div>
            <div className="connect-status">
              <span className={`status ${workspace?.bachsAccountStatus === "ready" ? "paid" : "open"}`}>
                {workspace?.bachsAccountStatus === "ready" ? "Ready to accept payments" : workspace?.bachsAccountId ? "Payout setup in progress" : "Payout setup needed"}
              </span>
              <p>Clients can pay without creating a Bachs account. You won’t need a separate Bachs login either: Cleva Match creates your connected payout account. Bachs may ask you to verify your identity and add payout details before you can receive funds.</p>
              <p>Once enabled, offer USD, USDT on TRC-20, or USDT on ERC-20. Checkout stays on your invoice page, and Bachs confirms successful payments before invoices are marked paid.</p>
            </div>
            <form className="connect-form" onSubmit={(event) => void startBachsOnboarding(event)}>
              <label>Country code<input required minLength={2} maxLength={2} value={connectCountry} onChange={(event) => setConnectCountry(event.target.value.toUpperCase())} placeholder="US" autoComplete="country" /></label>
              <label>Account type<select value={connectEntityType} onChange={(event) => setConnectEntityType(event.target.value as "individual" | "company")}><option value="individual">Individual freelancer</option><option value="company">Registered business</option></select></label>
              <button className="primary-button" disabled={busy}>{workspace?.bachsAccountId ? "Continue payout setup" : "Set up payouts"}</button>
              {workspace?.bachsAccountId && <button className="secondary-button" type="button" disabled={busy} onClick={() => void refreshBachsStatus()}>Refresh payout status</button>}
            </form>
            <p className="connect-disclaimer">Cleva Match deducts a 3.5% platform fee from each successful invoice payment. Bachs processing fees are additional and separate. Payment methods depend on Bachs approval and your account’s enabled capabilities.</p>
          </section>

          {suggestedMatches.length > 0 && <section className="match-banner"><div className="sparkle">✦</div><div className="match-copy"><strong>{suggestedMatches.length} possible match{suggestedMatches.length === 1 ? "" : "es"} ready for your review</strong><span>Review imported payment records and confirm the invoice they belong to.</span></div><button className="banner-link" onClick={() => setNavFilter("review")}>Review suggestions <span>→</span></button></section>}

          <section className="panel" id="invoices">
            <div className="panel-head"><div className="panel-title"><h2>Client invoices</h2><p>Create an invoice, share its payment link, and see when it’s paid.</p></div><div className="panel-actions"><button className="secondary-button" onClick={() => paymentFileRef.current?.click()} disabled={busy}>↑ Import payment records</button><button className="secondary-button" onClick={exportInvoices} disabled={invoices.length === 0}>↓ Export invoices</button></div></div>
            <div className="table-tools"><div className="tabs" role="tablist" aria-label="Filter invoices">{(["all", "paid", "open", "overdue", "review"] as InvoiceFilter[]).map((item) => <button key={item} role="tab" aria-selected={filter === item} className={`tab ${filter === item ? "active" : ""}`} onClick={() => setFilter(item)}>{item === "all" ? `All (${invoices.length})` : item === "review" ? "Review match" : item[0]!.toUpperCase() + item.slice(1)}</button>)}</div><div className="tool-right"><input className="search" type="search" aria-label="Search invoices" placeholder="Search invoices or clients..." value={search} onChange={(event) => setSearch(event.target.value)} /><select className="filter-select" aria-label="Sort invoices" value={sort} onChange={(event) => setSort(event.target.value)}><option value="due">Sort: due date</option><option value="amount">Sort: amount</option><option value="client">Sort: client</option></select></div></div>
            <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Client</th><th>Amount</th><th>Due date</th><th>Status</th><th>Payment</th><th>Share</th></tr></thead><tbody>
              {filteredInvoices.map((invoice) => {
                const match = paymentForInvoice.get(invoice.id);
                const payment = match && payments.find((item) => item.id === match.paymentId);
                const status = match?.status === "confirmed" ? "paid" : match?.status === "suggested" ? "review" : invoice.dueDate < today() ? "overdue" : "open";
                return <tr key={invoice.id}><td><span className="invoice-id">{invoice.invoiceNumber}</span></td><td><div className="client-cell"><span className="client-avatar">{initials(invoice.clientName)}</span><span><span className="client-name">{invoice.clientName}</span><span className="client-email">{invoice.clientEmail || "No email added"}</span></span></div></td><td className="amount">{money(invoice.amountAtomic, invoice.currency)}</td><td className={`due-date ${status === "overdue" ? "late" : ""}`}>{prettyDate(invoice.dueDate)}</td><td><span className={`status ${status}`}>{status === "paid" ? "Paid" : status === "review" ? "Review match" : status === "overdue" ? "Overdue" : "Awaiting"}</span></td><td className={`match-cell ${match ? "has-match" : ""}`}>{match && payment ? <>{match.status === "confirmed" ? "✓ Paid" : "✦ Suggested"} · {payment.payerName} <small>{prettyDate(payment.receivedAt)}</small></> : "Awaiting payment"}</td><td><button className="row-action" onClick={() => void copyInvoiceLink(invoice)}>Copy link</button></td></tr>;
              })}
            </tbody></table>
            {filteredInvoices.length === 0 && <div className="empty-state"><div className="empty-icon">{invoices.length ? "⌕" : "▤"}</div><strong>{invoices.length ? "No invoices found" : "Your first client invoice starts here"}</strong><p>{invoices.length ? "Try a different search or status filter." : "Add an invoice, then share its secure payment link with your client."}</p>{invoices.length === 0 && <button className="primary-button" onClick={() => setEntryMode("invoice")}>＋ Create your first invoice</button>}</div>}
            </div>
            <div className="table-foot"><span>Showing {filteredInvoices.length} of {invoices.length} invoices</span><button onClick={() => downloadCsvTemplate("invoice")}>Download invoice CSV template</button></div>
          </section>

          <div className="bottom-grid">
            <section className="activity" id="activity"><div className="section-heading"><h3>Payment activity</h3><button onClick={() => paymentFileRef.current?.click()}>Import payment records →</button></div>
              {recentPayments.length === 0 ? <div className="empty-activity"><span>↙</span><strong>No client payments yet</strong><small>Payments confirmed through Bachs will appear here. You can also import existing payment records.</small><button className="text-button" onClick={() => setEntryMode("payment")}>＋ Record an existing payment</button></div> : recentPayments.map((payment) => {
                const match = invoiceForPayment.get(payment.id);
                const invoice = match && invoices.find((item) => item.id === match.invoiceId);
                return <div className="activity-item" key={payment.id}><div className={`activity-icon ${match ? "" : "unmatched"}`}>{match?.status === "confirmed" ? "✓" : match?.status === "suggested" ? "✦" : "↗"}</div><div className="activity-copy"><strong>{payment.payerName}</strong><small>{invoice ? `${match?.status === "confirmed" ? "Paid" : "Suggested"} · ${invoice.invoiceNumber}` : payment.reference || "No invoice match yet"}</small></div><div className="activity-trailing"><span className="activity-amount">{money(payment.amountAtomic, payment.currency)}</span>{!match && <button className="mini-action" onClick={() => startManualMatch(payment)}>Match</button>}</div></div>;
              })}
            </section>
            <section className="attention"><div className="attention-count">{invoices.filter((invoice) => paymentForInvoice.get(invoice.id)?.status !== "confirmed").length}</div><h3>{!invoices.length ? "Create your first client invoice" : invoices.some((invoice) => paymentForInvoice.get(invoice.id)?.status !== "confirmed") ? "Invoices awaiting payment" : "Every invoice is paid"}</h3><p>{!invoices.length ? "Add an invoice, connect Bachs, and share its payment link with your client." : invoices.some((invoice) => paymentForInvoice.get(invoice.id)?.status !== "confirmed") ? "Share each invoice’s payment link and follow its status here. Bachs confirms payments before invoices are marked paid." : "Your client payments are confirmed. Create another invoice whenever you’re ready."}</p><button className="secondary-button" onClick={() => invoices.length ? document.getElementById("invoices")?.scrollIntoView({ behavior: "smooth" }) : setEntryMode("invoice")}>{invoices.length ? "View client invoices →" : "＋ Create your first invoice"}</button></section>
          </div>
          <div className="footer-note">Cleva Match · Client invoicing with embedded Bachs checkout</div>
        </div>
      </main>

      <input ref={invoiceFileRef} type="file" accept=".csv,text/csv" className="visually-hidden" onChange={(event) => void importCsv(event, "invoice")} />
      <input ref={paymentFileRef} type="file" accept=".csv,text/csv" className="visually-hidden" onChange={(event) => void importCsv(event, "payment")} />
      {entryMode && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setEntryMode(null); setModalError(""); } }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="entry-title">
        <div className="modal-head"><div><p className="eyebrow">{entryMode === "invoice" ? "Client billing" : "Existing payment record"}</p><h2 id="entry-title">{entryMode === "invoice" ? "Create an invoice" : "Record a payment"}</h2><p>{entryMode === "invoice" ? "Add your client and amount, then share the invoice’s payment link." : "Log an existing payment to keep your client records complete."}</p></div><button className="dialog-close" aria-label="Close" onClick={() => { setEntryMode(null); setModalError(""); }}>×</button></div>
        <form className="entry-form" onSubmit={(event) => void (entryMode === "invoice" ? submitInvoice(event) : submitPayment(event))}>
          {entryMode === "invoice" ? <>
            <label>Invoice number<input required maxLength={60} value={invoiceDraft.invoiceNumber} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, invoiceNumber: event.target.value })} placeholder="INV-2048" /></label>
            <label>Client name<input required maxLength={120} value={invoiceDraft.clientName} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, clientName: event.target.value })} placeholder="Northstar Studio" /></label>
            <label>Client email <span className="optional-label">optional</span><input type="email" maxLength={254} value={invoiceDraft.clientEmail} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, clientEmail: event.target.value })} placeholder="hello@client.com" /></label>
            <div className="form-row"><label>Amount<input required type="number" min="0.01" max="10000000" step={invoiceDraft.currency === "USD" ? "0.01" : "0.000001"} value={invoiceDraft.amount} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, amount: event.target.value })} placeholder={invoiceDraft.currency === "USD" ? "1,250.00" : "1,250.000000"} /></label><label>Currency<select value={invoiceDraft.currency} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, currency: event.target.value })}><option value="USD">USD</option><option value="USDT_TRC20">USDT · TRC-20</option><option value="USDT_ERC20">USDT · ERC-20</option></select></label></div>
            <label>Due date<input required type="date" value={invoiceDraft.dueDate} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, dueDate: event.target.value })} /></label>
          </> : <>
            <label>Payer name<input required maxLength={120} value={paymentDraft.payerName} onChange={(event) => setPaymentDraft({ ...paymentDraft, payerName: event.target.value })} placeholder="Client or sender name" /></label>
            <div className="form-row"><label>Amount<input required type="number" min="0.01" max="10000000" step={paymentDraft.currency === "USD" ? "0.01" : "0.000001"} value={paymentDraft.amount} onChange={(event) => setPaymentDraft({ ...paymentDraft, amount: event.target.value })} placeholder={paymentDraft.currency === "USD" ? "1,250.00" : "1,250.000000"} /></label><label>Currency<select value={paymentDraft.currency} onChange={(event) => setPaymentDraft({ ...paymentDraft, currency: event.target.value })}><option value="USD">USD</option><option value="USDT_TRC20">USDT · TRC-20</option><option value="USDT_ERC20">USDT · ERC-20</option></select></label></div>
            <label>Payment date<input required type="date" value={paymentDraft.receivedAt} onChange={(event) => setPaymentDraft({ ...paymentDraft, receivedAt: event.target.value })} /></label>
            <label>Reference <span className="optional-label">optional</span><input maxLength={200} value={paymentDraft.reference} onChange={(event) => setPaymentDraft({ ...paymentDraft, reference: event.target.value })} placeholder="INV-2048 or payment note" /></label>
          </>}
          {modalError && <div className="form-error" role="alert">{modalError}</div>}
          <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setEntryMode(null)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving..." : `Save ${entryMode}`}</button></div>
        </form>
        {entryMode === "invoice" && <button className="modal-import-link" onClick={() => { setEntryMode(null); invoiceFileRef.current?.click(); }}>Have several? Import an invoice CSV →</button>}
        {entryMode === "payment" && <button className="modal-import-link" onClick={() => { setEntryMode(null); paymentFileRef.current?.click(); }}>Have several? Import a payments CSV →</button>}
      </section></div>}

      {selectedPayment && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedPayment(null); }}><section className="modal-card match-modal" role="dialog" aria-modal="true" aria-labelledby="match-title"><div className="modal-head"><div><p className="eyebrow">Reconcile payment</p><h2 id="match-title">Find this payment a home</h2><p>Choose an invoice with the same currency and exact amount.</p></div><button className="dialog-close" aria-label="Close" onClick={() => setSelectedPayment(null)}>×</button></div><div className="entry-form"><div className="payment-summary"><strong>{selectedPayment.payerName} · {money(selectedPayment.amountAtomic, selectedPayment.currency)}</strong><span>{prettyDate(selectedPayment.receivedAt)} · {selectedPayment.reference || "No reference"}</span></div><label>Open invoice<select value={selectedInvoiceId} onChange={(event) => setSelectedInvoiceId(event.target.value)} disabled={selectedPaymentCandidates.length === 0}><option value="">Choose an invoice...</option>{selectedPaymentCandidates.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} · {invoice.clientName} · {money(invoice.amountAtomic, invoice.currency)}</option>)}</select></label><p className="form-helper">{selectedPaymentCandidates.length ? "Only open invoices with the exact amount and currency are shown." : "No open invoice matches this amount. Add the right invoice before reconciling."}</p><div className="modal-actions"><button className="secondary-button" onClick={() => setSelectedPayment(null)}>Not now</button><button className="primary-button" disabled={busy || !selectedInvoiceId} onClick={() => void confirmMatch(selectedPayment.id, selectedInvoiceId)}>{busy ? "Saving..." : "Match payment"}</button></div></div></section></div>}

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
          script.onload = () => window.Bachs ? resolve() : reject(new Error("Bachs checkout did not initialize."));
          script.onerror = () => reject(new Error("Could not load Bachs checkout. Check your connection and try again."));
          document.head.appendChild(script);
        });
      }
      if (!window.Bachs) throw new Error("Bachs checkout is unavailable. Please try again.");
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
      <a className="brand" href="/"><span className="brand-mark">c</span><span className="brand-name">cleva<span>match</span></span></a>
      <p className="eyebrow">Invoice from</p>
      <h1>{invoice.workspaceName}</h1>
      <div className="public-invoice-number">{invoice.invoiceNumber}</div>
      <div className="public-invoice-amount">{money(invoice.amountAtomic, invoice.currency)}</div>
      <p className="public-invoice-due">Due {prettyDate(invoice.dueDate)}</p>
      {invoice.paid
        ? <div className="public-invoice-paid" role="status">✓ Payment confirmed. Thank you.</div>
        : <button className="primary-button public-pay-button" disabled={busy} onClick={() => void payInvoice()}>{busy ? "Opening secure checkout…" : `Pay ${money(invoice.amountAtomic, invoice.currency)}`}</button>}
      {checkingPayment && !invoice.paid && <p className="public-payment-check" role="status">Payment submitted. Waiting for secure confirmation…</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="public-invoice-footnote">Secure checkout powered by Bachs. Your card or payment details are handled by Bachs, not stored by Cleva Match.</p>
    </article>
  </main>;
}

export default function App() {
  const payMatch = window.location.pathname.match(/^\/pay\/([a-f0-9]{32})$/i);
  return payMatch ? <PublicInvoicePage publicId={payMatch[1]!} /> : <DashboardApp />;
}
