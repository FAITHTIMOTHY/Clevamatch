# SettleMe

SettleMe is a Nigeria-first invoicing and payment product for freelancers. Create an itemized invoice, share its private payment link, and let the client pay through a secure crypto checkout. A verified payment-provider notification—not the browser redirect—confirms payment and updates the invoice.

Invoices use one enabled crypto asset/network. SettleMe deducts a 3.5% platform fee from the freelancer's proceeds; payment-processing fees are separate. Seller onboarding and payout details are handled through a connected account. SettleMe does not collect bank account numbers or hold funds for manual payouts.

Available crypto methods are controlled by an explicit platform allowlist and account approval. An administrator must enable only corridors confirmed for SettleMe.

## Run locally

Requirements: Node.js 22.12 or newer and npm.

```powershell
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The app needs `DATABASE_URL` set to your Supabase Postgres connection string in `.env` or the server environment to start.

Copy `.env.example` to `.env` and configure the Supabase Postgres connection string and payment integration credentials. Never put secret values in browser code or source control. Provider-specific setup is documented in the maintainer section below. Set `APP_BASE_URL` to the public app origin so clients return to the correct invoice page.

Use the Supabase session pooler connection string for long-running local/server connections, or its transaction pooler string for serverless deployments, with SSL required. The migration and transfer commands prompt for connection strings in the local terminal if valid values are not already configured, so they do not have to be saved in `.env`.

## Database migration

The application uses Supabase Postgres. Generate schema migrations with `npm run db:generate`; apply them with `npm run db:migrate:supabase`. The migration command asks for the Supabase connection string if `DATABASE_URL` is not set. Migrations are explicit commands and do not run automatically during serverless function startup. Migration `0001_invoice_items` creates `invoice_items` and backfills each existing invoice as one “Imported invoice total” line; it leaves the original invoice total and payment records unchanged.

To copy existing data, take a source backup, apply the schema migration, then run `npm run db:transfer`. It securely prompts for the Supabase connection and a source URL. Use `file:local.db` to transfer the local project database; this requires no legacy database token. For a remote Turso/libSQL source, use its `libsql://` URL and provide an auth token if required. The transfer refuses a non-empty target and preserves users' existing scrypt password hashes and sessions, so current sign-in continues temporarily. The initial local-data transfer for this project has already been completed.

This database move does not switch authentication to Supabase Auth yet. Sign-in remains in the app using the existing scrypt password hashes and session cookies, stored in the Supabase Postgres tables. A later Supabase Auth migration needs a separate user-migration/password-reset plan.

## Maintainer setup: payment integration

The checkout and connected-account integration currently uses Bachs Connect. This section is for maintainers configuring that integration; provider-specific names are intentionally omitted from the customer-facing product.

1. Configure the Bachs platform account and enable Connect. Seller onboarding requests crypto merchant capability and recipient payouts/transfers.
2. Set `BACHS_SECRET_KEY` and `BACHS_WEBHOOK_SECRET` in the server environment. Sandbox keys use the sandbox API; live keys use the production API.
3. After confirming the exact SettleMe corridors with the provider, set `BACHS_SUPPORTED_CRYPTO_CURRENCIES` to a comma-separated allowlist, for example `USDT_TRC20,USDT_BEP20`. Leave it unset until confirmation; the invoice form then offers no crypto methods and new invoice creation is blocked. Allowed codes are `USDT_TRC20`, `USDT_BEP20`, `USDT_ERC20`, `USDT_SOL`, and `USDC_BEP20`.
4. Configure `/api/webhooks/bachs` to send Connect events. The server verifies `X-Bachs-Signature-V2` and treats verified success events as the source of truth. For local checkout testing, use a secure tunnel and configure the provider to send events to `https://your-public-host/api/webhooks/bachs`.
5. In the SettleMe dashboard, start payout onboarding and complete the connected-account requirements.
6. Create an itemized crypto invoice and copy its public payment link. The client can pay from that page using the hosted checkout.

SettleMe uses direct charges: the freelancer's connected account is the merchant and bears processing fees and refund/dispute responsibilities. The 3.5% platform fee is a separate amount calculated from the invoice total and deducted from the freelancer's proceeds. The provider manages seller identity and payout details; SettleMe never asks sellers to enter bank account numbers in the app. Verify checkout/API availability in the provider sandbox before enabling production use. The app does not connect to seller wallets or initiate on-chain transfers.

## Build and serve

```powershell
npm run typecheck
npm run build
npm start
```

The production server serves the Vite website and JSON API from one origin. Configure `NODE_ENV=production`, `PORT`, `HOST` (optional; defaults to `0.0.0.0` in production), and `DATABASE_URL` as required by the hosting environment. Apply schema migrations as a release/deployment step before routing traffic to a new version.

For Vercel, configure the Supabase Postgres connection string and payment integration environment variables in the Vercel project settings. Existing accounts remain available only when the deployment connects to the database where they were migrated.

## Import CSV files

Invoice CSV import/export uses these columns:

- Invoices: `invoice_number`, `client_name`, `client_email`, `amount`, `currency`, `due_date`

CSV import remains a compatibility path for older flat invoices: each imported row becomes one line item named “Imported invoice total.” New invoices must use itemized lines and an enabled crypto currency. Existing CSV values `USD` and legacy `USDT` can still be imported for recordkeeping; unsupported legacy currencies cannot start a new checkout. Amounts can have up to six decimal places. Common header variants such as `invoice_id`, `client`, `total`, and `date` are accepted. Dates must be parseable and are stored as `YYYY-MM-DD`. Rows without required values are rejected and duplicate invoice numbers are skipped.

## Authentication and data boundaries

- Passwords are stored as salted scrypt hashes; plaintext passwords are never saved.
- Login sessions use random opaque tokens in `HttpOnly`, `SameSite=Strict` cookies. Only the SHA-256 token hash is stored in the database.
- Workspace IDs are taken from the authenticated session for dashboard data operations.
- Public invoice IDs are random, unguessable links. Only the invoice details needed for payment are exposed on the public invoice page.
- Successful checkout is recorded only after a verified payment-provider webhook; browser return URLs do not mark invoices paid.
- Write requests reject cross-origin `Origin` headers. The server applies browser security headers and a per-process limit to registration/login attempts.

## Current product scope

SettleMe supports itemized invoice creation, invoice-link sharing, connected payout onboarding, crypto checkout links, webhook-confirmed payments, and invoice CSV import/export. Manual payment entry, payment-file import, and reconciliation/matching are not part of the current flow; existing payment records remain stored, while only provider-confirmed payments are shown as payment history. The app does not custody funds, collect bank details, connect wallets, initiate on-chain transfers, send email, support password recovery or multi-user invitations, or provide accounting, payroll, tax, or legal advice.
