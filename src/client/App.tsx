import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { api, ApiError } from "./api.js";
import type { DashboardData, Invoice, Match, Payment, User, Wallet, Workspace } from "./types.js";

type AuthMode = "login" | "register";
type InvoiceFilter = "all" | "paid" | "open" | "overdue" | "review";
type EntryMode = "invoice" | "payment";

interface ApiMe {
  user: User;
  workspace: Workspace;
}

function LandingPage({ onGetStarted, onSignIn }: { onGetStarted: () => void; onSignIn: () => void }) {
  return <main className="landing-page">
    <header className="landing-nav"><a className="brand" href="#"><span className="brand-mark">c</span><span className="brand-name">cleva<span>match</span></span></a><nav><a href="#how-it-works">How it works</a><a href="#why-cleva">Why Cleva Match</a></nav><div><button className="landing-signin" onClick={onSignIn}>Sign in</button><button className="primary-button" onClick={onGetStarted}>Get started <span>→</span></button></div></header>
    <section className="landing-hero">
      <div className="hero-copy"><h1>Your money came in.<br /><span>Let’s find its invoice.</span></h1><p>Bring your invoices and incoming international payments together. Spend less time wondering what landed—and more time doing your thing.</p><div className="hero-actions"><button className="primary-button" onClick={onGetStarted}>Create your free workspace <span>→</span></button><button className="hero-secondary" onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}>See how it works <span>↓</span></button></div><div className="hero-trust"><span>✓</span> Private workspace <span className="trust-dot">·</span> Simple CSV imports <span className="trust-dot">·</span> You approve every match</div></div>
      <div className="hero-art" aria-label="Preview of invoice matching dashboard"><div className="art-sun" /><div className="art-card"><div className="art-window"><span /><span /><span /></div><div className="art-card-header"><div><small>MONDAY, NOVEMBER 9</small><strong>Your money, sorted.</strong></div><span className="art-check">✓</span></div><div className="art-metric-row"><div className="art-metric"><small>RECEIVED</small><strong>$8,140</strong></div><div className="art-metric"><small>INVOICES MATCHED</small><strong>4 <span>/ 6</span></strong></div></div><div className="art-invoice-head"><span>INVOICE</span><span>PAYMENT</span><span>STATUS</span></div><div className="art-invoice-row"><div className="art-client"><span className="art-avatar av-one">NS</span><span><b>Northstar Studio</b><small>INV-2048</small></span></div><b>$2,400</b><span className="art-paid">✓ Matched</span></div><div className="art-invoice-row"><div className="art-client"><span className="art-avatar av-two">BC</span><span><b>Bloom Creative</b><small>INV-2051</small></span></div><b>$1,850</b><span className="art-suggested">✦ Review</span></div><div className="art-invoice-row"><div className="art-client"><span className="art-avatar av-three">OL</span><span><b>Orbit Labs</b><small>INV-2054</small></span></div><b>$3,200</b><span className="art-open">◷ Awaiting</span></div><div className="art-floating"><span>✦</span><div><b>Possible match found</b><small>We’ll always ask before confirming.</small></div></div></div><div className="art-decoration deco-star">✳</div><div className="art-decoration deco-flower">✿</div></div>
    </section>
    <section className="landing-proof"><span>MADE FOR PEOPLE WHO WORK ACROSS BORDERS</span><div><b>Freelancers</b><i>·</i><b>Small studios</b><i>·</i><b>Global teams</b><i>·</i><b>Growing businesses</b></div></section>
    <section className="landing-how" id="how-it-works"><div className="section-intro"><p className="eyebrow">Goodbye, “what was this for?”</p><h2>Less untangling.<br />More <span>everything else.</span></h2><p>No new bank account. No mystery math. Just your invoices and incoming payments, finally in the same room.</p></div><div className="how-cards"><article><div className="how-icon icon-import">↥</div><span className="step-number">01</span><h3>Bring your records</h3><p>Add an invoice or import a CSV of invoices and incoming payments. You stay in control of your records.</p></article><article><div className="how-icon icon-match">✦</div><span className="step-number">02</span><h3>Find the right match</h3><p>Cleva Match looks at the amount, currency, client name, and reference to surface possible matches.</p></article><article><div className="how-icon icon-review">✓</div><span className="step-number">03</span><h3>Review and reconcile</h3><p>Confirm a suggestion, match an exact-amount payment manually, and export a tidy record when you need it.</p></article></div></section>
    <section className="landing-feature" id="why-cleva"><div className="feature-mark">c</div><div><p className="eyebrow">The nice-and-simple promise</p><h2>A little clarity for<br />every dollar coming in.</h2><p>One place to see what’s been received, what’s still open, and which payments need a human’s eyes. No busywork theater, just the important bits.</p><button className="primary-button" onClick={onGetStarted}>Make a workspace <span>→</span></button></div><ul><li><span>✓</span> Private to your business</li><li><span>✓</span> Exact-currency matching</li><li><span>✓</span> No surprise auto-confirmations</li><li><span>✓</span> CSV in, clear records out</li></ul></section>
    <footer className="landing-footer"><a className="brand" href="#"><span className="brand-mark">c</span><span className="brand-name">cleva<span>match</span></span></a><span>An independent invoice and payment matching product concept.</span><button onClick={onSignIn}>Already have an account? Sign in</button></footer>
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
const money = (amountAtomic: number, currency = "USDT") => currency === "USDT"
  ? `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(amountAtomic / 1_000_000)} USDT`
  : new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amountAtomic / 1_000_000);
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
          <div className="auth-kicker"><span className="sparkle">✦</span> A calmer way to get paid</div>
          <h1>Money in.<br />Admin out.</h1>
          <p>Bring your invoices and incoming payments together. Spend less time wondering what landed—and more time doing your thing.</p>
        </div>
        <div className="auth-note"><span>☕</span><div><strong>Made for people building good things.</strong><small>One workspace for invoices, payments, and the little details in between.</small></div></div>
        <div className="auth-decoration decor-one" /><div className="auth-decoration decor-two" />
      </div>
      <section className="auth-form-side">
        <div className="auth-form-wrap">
          <button className="auth-back-link brand" type="button" onClick={onBack}><span className="brand-mark">c</span><span className="brand-name">cleva<span>match</span></span></button>
          <div className="auth-heading"><p className="eyebrow">{mode === "register" ? "Get started" : "Welcome back"}</p><h2>{mode === "register" ? "Set up your workspace" : "Sign in to your account"}</h2><p>{mode === "register" ? "It’s your space to keep money moving smoothly." : "Your invoices and payment activity are right where you left them."}</p></div>
          <form className="auth-form" onSubmit={(event) => void submit(event)}>
            {mode === "register" && <>
              <label>Your name<input autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ada Morgan" /></label>
              <label>Business name<input autoComplete="organization" required minLength={2} maxLength={100} value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Sunday Studio" /></label>
            </>}
            <label>Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@yourstudio.com" /></label>
            <label>Password<input type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={mode === "register" ? 10 : 1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "register" ? "At least 10 characters" : "Your password"} /></label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <button className="primary-button auth-submit" disabled={busy}>{busy ? "One moment..." : mode === "register" ? "Create your workspace" : "Sign in"} <span aria-hidden="true">→</span></button>
          </form>
          <p className="auth-switch">{mode === "register" ? "Already have a workspace?" : "New to Cleva Match?"} <button type="button" onClick={() => { setError(""); setMode(mode === "register" ? "login" : "register"); }}>{mode === "register" ? "Sign in" : "Create an account"}</button></p>
          <p className="auth-footnote">By continuing, you agree to use Cleva Match for your business financial records. Keep your password safe.</p>
        </div>
      </section>
    </main>
  );
}

export default function App() {
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
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft>({ invoiceNumber: "", clientName: "", clientEmail: "", amount: "", currency: "USDT", dueDate: "" });
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft>({ payerName: "", amount: "", currency: "USDT", reference: "", receivedAt: today() });
  const [walletLabel, setWalletLabel] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [syncingWalletId, setSyncingWalletId] = useState("");
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
  const connectedWallets = data?.wallets || [];
  const paymentForInvoice = useMemo(() => new Map(matches.map((match) => [match.invoiceId, match])), [matches]);
  const invoiceForPayment = useMemo(() => new Map(matches.map((match) => [match.paymentId, match])), [matches]);
  const matchByInvoice = useMemo(() => new Map(invoices.map((invoice) => [invoice.id, paymentForInvoice.get(invoice.id)])), [invoices, paymentForInvoice]);
  const unmatchedPayments = payments.filter((payment) => !invoiceForPayment.has(payment.id));
  const selectedPaymentCandidates = selectedPayment ? invoices.filter((invoice) =>
    !paymentForInvoice.has(invoice.id) && invoice.amountAtomic === selectedPayment.amountAtomic && invoice.currency === selectedPayment.currency,
  ) : [];
  const confirmedAmount = invoices.filter((invoice) => paymentForInvoice.get(invoice.id)?.status === "confirmed")
    .reduce((sum, invoice) => sum + invoice.amountAtomic, 0);
  const receivedAmount = payments.filter((payment) => payment.receivedAt.slice(0, 7) === today().slice(0, 7))
    .reduce((sum, payment) => sum + payment.amountAtomic, 0);
  const openAmount = invoices.filter((invoice) => paymentForInvoice.get(invoice.id)?.status !== "confirmed")
    .reduce((sum, invoice) => sum + invoice.amountAtomic, 0);
  const matchedCount = matches.length;

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
      setInvoiceDraft({ invoiceNumber: "", clientName: "", clientEmail: "", amount: "", currency: "USDT", dueDate: "" });
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
      setPaymentDraft({ payerName: "", amount: "", currency: "USDT", reference: "", receivedAt: today() });
      await reload();
      showToast("Payment saved. We’ve checked for invoice matches.");
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "Could not save this payment.");
    } finally {
      setBusy(false);
    }
  }

  async function addWallet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await api<{ wallet: Wallet }>("/api/wallets", {
        method: "POST",
        body: JSON.stringify({ label: walletLabel, address: walletAddress }),
      });
      setWalletLabel("");
      setWalletAddress("");
      await reload();
      showToast("TRON wallet connected. Its public activity is read-only.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not connect that wallet.");
    } finally {
      setBusy(false);
    }
  }

  async function syncWallet(wallet: Wallet) {
    setSyncingWalletId(wallet.id);
    try {
      const result = await api<{ imported: number; historyComplete: boolean }>(`/api/wallets/${encodeURIComponent(wallet.id)}/sync`, { method: "POST" });
      await reload();
      showToast(result.historyComplete
        ? `${result.imported} confirmed USDT transfer${result.imported === 1 ? "" : "s"} imported.`
        : `${result.imported} transfers imported. Sync again to continue the full wallet history.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not sync this wallet.");
    } finally {
      setSyncingWalletId("");
    }
  }

  async function disconnectWallet(wallet: Wallet) {
    if (!window.confirm(`Disconnect ${wallet.label}? Imported transfers will remain in your records.`)) return;
    setBusy(true);
    try {
      await api<void>(`/api/wallets/${encodeURIComponent(wallet.id)}`, { method: "DELETE" });
      await reload();
      showToast("Wallet disconnected. Its imported transfers were kept.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not disconnect that wallet.");
    } finally {
      setBusy(false);
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
            currency: csvValue(record, "currency").toUpperCase() || "USDT",
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
            currency: csvValue(record, "currency").toUpperCase() || "USDT",
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
      ? "invoice_number,client_name,client_email,amount,currency,due_date\nINV-3001,Acme Studio,finance@example.com,1250.000000,USDT,2026-12-01\n"
      : "received_date,payer,amount,currency,reference\n2026-11-09,Acme Studio,1250.000000,USDT,INV-3001\n";
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
          <button className={filter === "review" ? "active" : ""} onClick={() => { setNavFilter("review"); document.getElementById("activity")?.scrollIntoView({ behavior: "smooth" }); }}><Icon>↗</Icon>Payments{unmatchedPayments.length + suggestedMatches.length > 0 && <span className="nav-count">{unmatchedPayments.length + suggestedMatches.length}</span>}</button>
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
            <div><p className="eyebrow">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p><h1>Good morning, {user.name.split(" ")[0]} <span aria-hidden="true">☀️</span></h1><p className="subtitle">Your money came in. Let’s make sure it found its way home.</p></div>
            <div className="welcome-actions"><button className="secondary-button" onClick={() => setEntryMode("payment")}>＋ Add payment</button><button className="primary-button" onClick={() => setEntryMode("invoice")}><span>＋</span> Add invoice</button></div>
          </section>

          <section className="stats" id="summary" aria-label="Business payment summary">
            <article className="stat-card"><div className="stat-top"><span>Received this month</span><span className="stat-icon">↙</span></div><div className="stat-value">{money(receivedAmount)}</div><div className="stat-note">{payments.length} payment{payments.length === 1 ? "" : "s"} recorded in your workspace</div></article>
            <article className="stat-card"><div className="stat-top"><span>Matched to invoices</span><span className="stat-icon">✓</span></div><div className="stat-value">{matchedCount}<span className="stat-context">of {invoices.length} invoices</span></div><div className="stat-note">{confirmedMatches.length} confirmed · {suggestedMatches.length} suggested</div></article>
            <article className="stat-card"><div className="stat-top"><span>Awaiting payment</span><span className="stat-icon">◷</span></div><div className="stat-value">{money(openAmount)}</div><div className="stat-note">{invoices.length - confirmedMatches.length} invoice{invoices.length - confirmedMatches.length === 1 ? "" : "s"} not yet confirmed paid</div></article>
            <article className="stat-card"><div className="stat-top"><span>Needs a look</span><span className="stat-icon">!</span></div><div className="stat-value">{unmatchedPayments.length + suggestedMatches.length}<span className="stat-context">item{unmatchedPayments.length + suggestedMatches.length === 1 ? "" : "s"}</span></div><div className="stat-note">{suggestedMatches.length} suggestion{suggestedMatches.length === 1 ? "" : "s"} · {unmatchedPayments.length} unmatched</div></article>
          </section>

          <section className="wallet-panel panel">
            <div className="panel-head"><div className="panel-title"><h2>TRON wallets</h2><p>Connect public addresses to import confirmed TRC-20 USDT transfers. Read-only—never enter a private key or seed phrase.</p></div></div>
            <form className="wallet-connect-form" onSubmit={(event) => void addWallet(event)}>
              <label>Wallet label<input required maxLength={60} value={walletLabel} onChange={(event) => setWalletLabel(event.target.value)} placeholder="Business treasury" /></label>
              <label>TRON public address<input required maxLength={35} value={walletAddress} onChange={(event) => setWalletAddress(event.target.value)} placeholder="T..." autoComplete="off" /></label>
              <button className="primary-button" disabled={busy || !walletLabel.trim() || !walletAddress.trim()}>Connect wallet</button>
            </form>
            {connectedWallets.length === 0 ? <p className="wallet-empty">No wallets connected yet. Add an address to start importing on-chain USDT transfers.</p> : <div className="wallet-list">{connectedWallets.map((wallet) => <div className="wallet-row" key={wallet.id}>
              <div className="wallet-copy"><strong>{wallet.label}</strong><code>{wallet.address}</code><small>{wallet.historyComplete ? wallet.lastSyncedAt ? `History synced · ${prettyDate(wallet.lastSyncedAt.slice(0, 10))}` : "History import complete" : wallet.syncCursor ? "Full history import in progress" : "Not synced yet"}</small></div>
              <div className="wallet-actions"><button className="secondary-button" disabled={Boolean(syncingWalletId)} onClick={() => void syncWallet(wallet)}>{syncingWalletId === wallet.id ? "Syncing..." : wallet.historyComplete ? "Sync now" : wallet.syncCursor ? "Continue import" : "Import history"}</button><button className="row-action subtle-action" disabled={busy || Boolean(syncingWalletId)} onClick={() => void disconnectWallet(wallet)}>Disconnect</button></div>
            </div>)}</div>}
            <p className="wallet-disclaimer">Transactions are imported from TRON’s public chain through TronGrid. The sender address may not identify the client. Review suggested invoice matches before confirming.</p>
          </section>

          {suggestedMatches.length > 0 && <section className="match-banner"><div className="sparkle">✦</div><div className="match-copy"><strong>{suggestedMatches.length} possible match{suggestedMatches.length === 1 ? "" : "es"} ready for your review</strong><span>We used the amount, currency, client name, and payment reference to find these.</span></div><button className="banner-link" onClick={() => setNavFilter("review")}>Review suggestions <span>→</span></button></section>}

          <section className="panel" id="invoices">
            <div className="panel-head"><div className="panel-title"><h2>Your invoices</h2><p>A little clarity on every dollar coming in.</p></div><div className="panel-actions"><button className="secondary-button" onClick={() => paymentFileRef.current?.click()} disabled={busy}>↑ Import payments</button><button className="secondary-button" onClick={exportInvoices} disabled={invoices.length === 0}>↓ Export</button></div></div>
            <div className="table-tools"><div className="tabs" role="tablist" aria-label="Filter invoices">{(["all", "paid", "open", "overdue", "review"] as InvoiceFilter[]).map((item) => <button key={item} role="tab" aria-selected={filter === item} className={`tab ${filter === item ? "active" : ""}`} onClick={() => setFilter(item)}>{item === "all" ? `All (${invoices.length})` : item === "review" ? "Review match" : item[0]!.toUpperCase() + item.slice(1)}</button>)}</div><div className="tool-right"><input className="search" type="search" aria-label="Search invoices" placeholder="Search invoices or clients..." value={search} onChange={(event) => setSearch(event.target.value)} /><select className="filter-select" aria-label="Sort invoices" value={sort} onChange={(event) => setSort(event.target.value)}><option value="due">Sort: due date</option><option value="amount">Sort: amount</option><option value="client">Sort: client</option></select></div></div>
            <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Client</th><th>Amount</th><th>Due date</th><th>Status</th><th>Payment match</th><th /></tr></thead><tbody>
              {filteredInvoices.map((invoice) => {
                const match = paymentForInvoice.get(invoice.id);
                const payment = match && payments.find((item) => item.id === match.paymentId);
                const status = match?.status === "confirmed" ? "paid" : match?.status === "suggested" ? "review" : invoice.dueDate < today() ? "overdue" : "open";
                return <tr key={invoice.id}><td><span className="invoice-id">{invoice.invoiceNumber}</span></td><td><div className="client-cell"><span className="client-avatar">{initials(invoice.clientName)}</span><span><span className="client-name">{invoice.clientName}</span><span className="client-email">{invoice.clientEmail || "No email added"}</span></span></div></td><td className="amount">{money(invoice.amountAtomic, invoice.currency)}</td><td className={`due-date ${status === "overdue" ? "late" : ""}`}>{prettyDate(invoice.dueDate)}</td><td><span className={`status ${status}`}>{status === "paid" ? "Paid" : status === "review" ? "Review match" : status === "overdue" ? "Overdue" : "Awaiting"}</span></td><td className={`match-cell ${match ? "has-match" : ""}`}>{match && payment ? <>{match.status === "confirmed" ? "✓ Matched" : "✦ Suggested"} · {payment.payerName} <small>{prettyDate(payment.receivedAt)}</small></> : "No match yet"}</td><td>{match?.status === "suggested" && payment ? <div className="review-actions"><button className="row-action" disabled={busy} onClick={() => void confirmMatch(payment.id, invoice.id)}>Confirm</button><button className="row-action subtle-action" disabled={busy} onClick={() => void dismissMatch(payment.id, invoice.id)}>Not a match</button></div> : match?.status === "confirmed" ? <button className="row-action subtle-action" disabled={busy} onClick={() => void removeMatch(invoice)}>Undo</button> : <button className="row-action" onClick={() => showToast(`No payment has been linked to ${invoice.invoiceNumber} yet.`)}>Details →</button>}</td></tr>;
              })}
            </tbody></table>
            {filteredInvoices.length === 0 && <div className="empty-state"><div className="empty-icon">{invoices.length ? "⌕" : "▤"}</div><strong>{invoices.length ? "No invoices found" : "Your first invoice starts here"}</strong><p>{invoices.length ? "Try a different search or status filter." : "Add one invoice or import a CSV to start matching incoming payments."}</p>{invoices.length === 0 && <button className="primary-button" onClick={() => setEntryMode("invoice")}>＋ Add your first invoice</button>}</div>}
            </div>
            <div className="table-foot"><span>Showing {filteredInvoices.length} of {invoices.length} invoices</span><button onClick={() => downloadCsvTemplate("invoice")}>Download invoice CSV template</button></div>
          </section>

          <div className="bottom-grid">
            <section className="activity" id="activity"><div className="section-heading"><h3>Recent payments</h3><button onClick={() => paymentFileRef.current?.click()}>Import payments →</button></div>
              {recentPayments.length === 0 ? <div className="empty-activity"><span>↙</span><strong>No payments yet</strong><small>Import a payments CSV or add a payment to check for invoice matches.</small><button className="text-button" onClick={() => setEntryMode("payment")}>＋ Add a payment</button></div> : recentPayments.map((payment) => {
                const match = invoiceForPayment.get(payment.id);
                const invoice = match && invoices.find((item) => item.id === match.invoiceId);
                return <div className="activity-item" key={payment.id}><div className={`activity-icon ${match ? "" : "unmatched"}`}>{match?.status === "confirmed" ? "✓" : match?.status === "suggested" ? "✦" : "↗"}</div><div className="activity-copy"><strong>{payment.payerName}</strong><small>{invoice ? `${match?.status === "confirmed" ? "Matched" : "Suggested"} · ${invoice.invoiceNumber}` : payment.reference || "No invoice match yet"}</small>{payment.sourceTransactionId && <a className="transaction-link" href={`https://tronscan.org/#/transaction/${encodeURIComponent(payment.sourceTransactionId)}`} target="_blank" rel="noreferrer">View on TronScan ↗</a>}</div><div className="activity-trailing"><span className="activity-amount">{money(payment.amountAtomic, payment.currency)}</span>{!match && <button className="mini-action" onClick={() => startManualMatch(payment)}>Match</button>}</div></div>;
              })}
            </section>
            <section className="attention"><div className="attention-count">{unmatchedPayments.length + suggestedMatches.length}</div><h3>{suggestedMatches.length ? `${suggestedMatches.length} possible match${suggestedMatches.length === 1 ? "" : "es"} need review` : unmatchedPayments.length ? `${unmatchedPayments.length} payment${unmatchedPayments.length === 1 ? "" : "s"} need${unmatchedPayments.length === 1 ? "s" : ""} a home` : invoices.length || payments.length ? "All payments are accounted for" : "Your workspace is ready"}</h3><p>{suggestedMatches.length ? "A payment looks like it belongs to an invoice. Confirm the suggestion to mark it paid, or dismiss it to find a different match." : unmatchedPayments.length ? `${money(unmatchedPayments[0]!.amountAtomic, unmatchedPayments[0]!.currency)} from ${unmatchedPayments[0]!.payerName} has no invoice match. Choose an exact amount match to reconcile it safely.` : invoices.length || payments.length ? "Every recorded payment is matched. Nice work keeping things tidy." : "Start with an invoice or payment. Cleva Match will look for a possible match."}</p>{suggestedMatches.length > 0 ? (() => { const match = suggestedMatches[0]!; const invoice = invoices.find((item) => item.id === match.invoiceId); const payment = payments.find((item) => item.id === match.paymentId); return invoice && payment ? <div className="review-actions"><button className="secondary-button" disabled={busy} onClick={() => void confirmMatch(payment.id, invoice.id)}>Confirm suggestion →</button><button className="attention-dismiss" disabled={busy} onClick={() => void dismissMatch(payment.id, invoice.id)}>Not this one</button></div> : null; })() : unmatchedPayments.length > 0 ? <button className="secondary-button" onClick={() => startManualMatch(unmatchedPayments[0]!)}>Review unmatched payment →</button> : <button className="secondary-button" onClick={() => setEntryMode("payment")}>＋ Add a payment</button>}</section>
          </div>
          <div className="footer-note">Your Cleva Match workspace · Records stay in your account.</div>
        </div>
      </main>

      <input ref={invoiceFileRef} type="file" accept=".csv,text/csv" className="visually-hidden" onChange={(event) => void importCsv(event, "invoice")} />
      <input ref={paymentFileRef} type="file" accept=".csv,text/csv" className="visually-hidden" onChange={(event) => void importCsv(event, "payment")} />
      {entryMode && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setEntryMode(null); setModalError(""); } }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="entry-title">
        <div className="modal-head"><div><p className="eyebrow">{entryMode === "invoice" ? "Your receivables" : "Money received"}</p><h2 id="entry-title">Add a {entryMode}</h2><p>{entryMode === "invoice" ? "Keep a record and let us look for its payment." : "Add an incoming payment and we’ll look for its invoice."}</p></div><button className="dialog-close" aria-label="Close" onClick={() => { setEntryMode(null); setModalError(""); }}>×</button></div>
        <form className="entry-form" onSubmit={(event) => void (entryMode === "invoice" ? submitInvoice(event) : submitPayment(event))}>
          {entryMode === "invoice" ? <>
            <label>Invoice number<input required maxLength={60} value={invoiceDraft.invoiceNumber} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, invoiceNumber: event.target.value })} placeholder="INV-2048" /></label>
            <label>Client name<input required maxLength={120} value={invoiceDraft.clientName} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, clientName: event.target.value })} placeholder="Northstar Studio" /></label>
            <label>Client email <span className="optional-label">optional</span><input type="email" maxLength={254} value={invoiceDraft.clientEmail} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, clientEmail: event.target.value })} placeholder="hello@client.com" /></label>
            <div className="form-row"><label>Amount<input required type="number" min="0.01" max="10000000" step="0.01" value={invoiceDraft.amount} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, amount: event.target.value })} placeholder="1,250.00" /></label><label>Currency<select value={invoiceDraft.currency} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, currency: event.target.value })}><option>USD</option><option>EUR</option><option>GBP</option><option>NGN</option><option>CAD</option><option>AUD</option></select></label></div>
            <label>Due date<input required type="date" value={invoiceDraft.dueDate} onChange={(event) => setInvoiceDraft({ ...invoiceDraft, dueDate: event.target.value })} /></label>
          </> : <>
            <label>Payer name<input required maxLength={120} value={paymentDraft.payerName} onChange={(event) => setPaymentDraft({ ...paymentDraft, payerName: event.target.value })} placeholder="Client or sender name" /></label>
            <div className="form-row"><label>Amount<input required type="number" min="0.01" max="10000000" step="0.01" value={paymentDraft.amount} onChange={(event) => setPaymentDraft({ ...paymentDraft, amount: event.target.value })} placeholder="1,250.00" /></label><label>Currency<select value={paymentDraft.currency} onChange={(event) => setPaymentDraft({ ...paymentDraft, currency: event.target.value })}><option>USD</option><option>EUR</option><option>GBP</option><option>NGN</option><option>CAD</option><option>AUD</option></select></label></div>
            <label>Payment date<input required type="date" value={paymentDraft.receivedAt} onChange={(event) => setPaymentDraft({ ...paymentDraft, receivedAt: event.target.value })} /></label>
            <label>Reference <span className="optional-label">optional</span><input maxLength={200} value={paymentDraft.reference} onChange={(event) => setPaymentDraft({ ...paymentDraft, reference: event.target.value })} placeholder="INV-2048 or payment note" /></label>
          </>}
          {modalError && <div className="form-error" role="alert">{modalError}</div>}
          <div className="modal-actions"><button className="secondary-button" type="button" onClick={() => setEntryMode(null)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving..." : `Save ${entryMode}`}</button></div>
        </form>
        {entryMode === "invoice" && <button className="modal-import-link" onClick={() => { setEntryMode(null); invoiceFileRef.current?.click(); }}>Have several? Import an invoice CSV →</button>}
        {entryMode === "payment" && <button className="modal-import-link" onClick={() => { setEntryMode(null); paymentFileRef.current?.click(); }}>Have several? Import a payments CSV →</button>}
      </section></div>}

      {selectedPayment && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedPayment(null); }}><section className="modal-card match-modal" role="dialog" aria-modal="true" aria-labelledby="match-title"><div className="modal-head"><div><p className="eyebrow">Reconcile payment</p><h2 id="match-title">Find this payment a home</h2><p>Choose an invoice with the same amount and currency.</p></div><button className="dialog-close" aria-label="Close" onClick={() => setSelectedPayment(null)}>×</button></div><div className="entry-form"><div className="payment-summary"><strong>{selectedPayment.payerName} · {money(selectedPayment.amountCents, selectedPayment.currency)}</strong><span>{prettyDate(selectedPayment.receivedAt)} · {selectedPayment.reference || "No reference"}</span></div><label>Open invoice<select value={selectedInvoiceId} onChange={(event) => setSelectedInvoiceId(event.target.value)} disabled={invoices.filter((invoice) => !paymentForInvoice.has(invoice.id) && invoice.amountCents === selectedPayment.amountCents && invoice.currency === selectedPayment.currency).length === 0}><option value="">Choose an invoice...</option>{invoices.filter((invoice) => !paymentForInvoice.has(invoice.id) && invoice.amountCents === selectedPayment.amountCents && invoice.currency === selectedPayment.currency).map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNumber} · {invoice.clientName} · {money(invoice.amountCents, invoice.currency)}</option>)}</select></label><p className="form-helper">{invoices.some((invoice) => !paymentForInvoice.has(invoice.id) && invoice.amountCents === selectedPayment.amountCents && invoice.currency === selectedPayment.currency) ? "Only open invoices with an exact amount and currency are shown." : "No open invoice matches this amount and currency. Add the right invoice before reconciling."}</p><div className="modal-actions"><button className="secondary-button" onClick={() => setSelectedPayment(null)}>Not now</button><button className="primary-button" disabled={busy || !selectedInvoiceId} onClick={() => void confirmMatch(selectedPayment.id, selectedInvoiceId)}>{busy ? "Saving..." : "Match payment"}</button></div></div></section></div>}

      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}
