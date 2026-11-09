# Cleva Match

Cleva Match helps independent freelancers create invoices, share a public payment link, and get paid through Bachs Connect checkout without sending clients away from the invoice page. When Bachs confirms a payment by webhook, the invoice is automatically marked paid. Each direct charge includes a 3.5% platform fee on the invoice amount.

The dashboard also supports manual and CSV invoice/payment records, suggested payment matching, and invoice CSV export. Invoice currencies are USD, USDT on TRON (TRC-20), and USDT on Ethereum (ERC-20), subject to Bachs account capabilities and availability.

## Run locally

Requirements: Node.js 22.12 or newer and npm.

```powershell
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Create an account and workspace to begin. The app creates and migrates a local SQLite-compatible `local.db` file automatically on startup. The database file and `.env` are ignored by Git.

Copy `.env.example` to `.env` and configure Bachs sandbox credentials and the webhook signing secret. Never put secret values in browser code or source control. For local checkout testing, configure Bachs to send Connect events to `https://your-public-host/api/webhooks/bachs` (use a secure tunnel to expose a local server). Set `APP_BASE_URL` to the public app origin so Bachs can return clients to the correct invoice page.

For hosted Turso/libSQL, set:

```dotenv
DATABASE_URL=libsql://your-database-name-your-org.turso.io
DATABASE_AUTH_TOKEN=your-database-auth-token
```

Keep database tokens private and out of source control.

## Bachs Connect setup

1. Configure the Bachs platform account and enable the required Connect capabilities.
2. Set `BACHS_SECRET_KEY` and `BACHS_WEBHOOK_SECRET` in the server environment. Sandbox keys use the Bachs sandbox API; live keys use the production API.
3. Configure the Bachs webhook endpoint `/api/webhooks/bachs` to send Connect events. The server verifies `X-Bachs-Signature-V2` and treats verified success events as the source of truth.
4. In the Cleva Match dashboard, start Bachs onboarding and complete the connected-account requirements.
5. Create an invoice and copy its public payment link. The client can pay from that page using the Bachs checkout overlay.

The freelancer is the merchant for direct charges and bears Bachs processing fees and refund/dispute responsibilities. Cleva Match's 3.5% fee is separate and calculated from the invoice's gross amount. Bachs documents support for USDT on TRON (TRC-20) and Ethereum (ERC-20); availability still depends on the freelancer's enabled Bachs payment settings. The app does not directly connect to wallets or smart contracts.

## Build and serve

```powershell
npm run typecheck
npm run build
npm start
```

The production server serves the Vite website and JSON API from one origin. Configure `NODE_ENV=production`, `PORT`, `HOST` (optional; defaults to `0.0.0.0` in production), `DATABASE_URL`, and `DATABASE_AUTH_TOKEN` as required by the hosting environment. Apply schema migrations during application startup.

For Vercel, configure a persistent Turso/libSQL database and the Bachs environment variables in the Vercel project settings. Vercel's static filesystem is not a persistent database. Existing accounts remain available only when the deployment connects to the database where they were created.

## Import CSV files

Use the in-app template downloads for the supported columns:

- Invoices: `invoice_number`, `client_name`, `client_email`, `amount`, `currency`, `due_date`
- Payments: `received_date`, `payer`, `amount`, `currency`, `reference`

Amounts can have up to six decimal places. Currency must be `USD`, `USDT_TRC20`, or `USDT_ERC20`; legacy `USDT` CSV values are treated as TRC-20. The import screen also accepts common header variants such as `invoice_id`, `client`, `total`, `date`, `sender`, `memo`, and `description`. Dates must be parseable and are stored as `YYYY-MM-DD`. Rows without a required value are rejected. Duplicate invoice numbers and duplicate payment rows are skipped.

## Authentication and data boundaries

- Passwords are stored as salted scrypt hashes; plaintext passwords are never saved.
- Login sessions use random opaque tokens in `HttpOnly`, `SameSite=Strict` cookies. Only the SHA-256 token hash is stored in the database.
- Workspace IDs are taken from the authenticated session for dashboard data operations.
- Public invoice IDs are random, unguessable links. Only the invoice details needed for payment are exposed on the public invoice page.
- Successful checkout is recorded only after a verified Bachs webhook; browser return URLs do not mark invoices paid.
- Write requests reject cross-origin `Origin` headers. The server applies browser security headers and a per-process limit to registration/login attempts.

## Current product scope

Cleva Match supports invoice creation and sharing, Bachs Connect onboarding, USD/USDT checkout links, verified payment webhooks, manual payment entry, CSV imports, and payment matching. It does not directly custody funds, connect wallets, initiate on-chain transfers, send email, support password recovery or multi-user invitations, or provide accounting, payroll, tax, or legal advice.
