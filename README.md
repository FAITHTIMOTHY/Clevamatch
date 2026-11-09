# Cleva Match

Cleva Match helps independent freelancers create invoices, share a public payment link, and get paid through Bachs Connect checkout without sending clients away from the invoice page. When Bachs confirms a payment by webhook, the invoice is automatically marked paid. Each direct charge includes a 3.5% platform fee on the invoice amount.

The dashboard also supports manual and CSV invoice/payment records, suggested payment matching, and invoice CSV export. Invoice currencies are USD, USDT on TRON (TRC-20), and USDT on Ethereum (ERC-20), subject to Bachs account capabilities and availability.

## Run locally

Requirements: Node.js 22.12 or newer and npm.

```powershell
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The app needs `DATABASE_URL` set to your Supabase Postgres connection string in `.env` or the server environment to start.

Copy `.env.example` to `.env` and configure the Supabase Postgres connection string and Bachs sandbox credentials. Never put secret values in browser code or source control. For local checkout testing, configure Bachs to send Connect events to `https://your-public-host/api/webhooks/bachs` (use a secure tunnel to expose a local server). Set `APP_BASE_URL` to the public app origin so Bachs can return clients to the correct invoice page.

Use the Supabase session pooler connection string for long-running local/server connections, or its transaction pooler string for serverless deployments, with SSL required. The migration and transfer commands prompt for connection strings in the local terminal if valid values are not already configured, so they do not have to be saved in `.env`.

## Database migration

The application uses Supabase Postgres. Generate schema migrations with `npm run db:generate`; apply them with `npm run db:migrate:supabase`. The migration command asks for the Supabase connection string if `DATABASE_URL` is not set. Migrations are explicit commands and do not run automatically during serverless function startup.

To copy existing data, take a source backup, apply the schema migration, then run `npm run db:transfer`. It securely prompts for the Supabase connection and a source URL. Use `file:local.db` to transfer the local project database; this requires no legacy database token. For a remote Turso/libSQL source, use its `libsql://` URL and provide an auth token if required. The transfer refuses a non-empty target and preserves users' existing scrypt password hashes and sessions, so current sign-in continues temporarily. The initial local-data transfer for this project has already been completed.

This database move does not switch authentication to Supabase Auth yet. Sign-in remains in the app using the existing scrypt password hashes and session cookies, stored in the Supabase Postgres tables. A later Supabase Auth migration needs a separate user-migration/password-reset plan.

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

The production server serves the Vite website and JSON API from one origin. Configure `NODE_ENV=production`, `PORT`, `HOST` (optional; defaults to `0.0.0.0` in production), and `DATABASE_URL` as required by the hosting environment. Apply schema migrations as a release/deployment step before routing traffic to a new version.

For Vercel, configure the Supabase Postgres connection string and Bachs environment variables in the Vercel project settings. Existing accounts remain available only when the deployment connects to the database where they were migrated.

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
