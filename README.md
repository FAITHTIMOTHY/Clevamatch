# Cleva Match

Cleva Match is a full-stack TypeScript workspace for keeping USDT invoices and incoming TRON payments together. It reads confirmed TRC-20 USDT transfers from public wallet addresses and suggests exact-amount invoice matches; a person must confirm a suggestion before an invoice is marked paid.

The app includes a public product website, account registration and sign-in, private workspaces, multiple read-only TRON wallet connections, paginated transaction-history imports, six-decimal USDT amounts, manual invoice/payment entry, CSV imports, match review, and invoice CSV export.

## Run locally

Requirements: Node.js 22.12 or newer and npm.

```powershell
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Create an account and workspace to begin. The app creates and migrates a local SQLite-compatible `local.db` file automatically on startup. The database file and `.env` are ignored by Git.

To select a database, port, or TRON transaction provider key, copy `.env.example` to `.env` and set values there. Wallet syncing requires a TronGrid API key configured on the server as `TRONGRID_API_KEY`; wallet owners never provide this key. For local development, the default database is `file:local.db`. A hosted Turso/libSQL database can be used by setting:

```dotenv
DATABASE_URL=libsql://your-database-name-your-org.turso.io
DATABASE_AUTH_TOKEN=your-database-auth-token
```

Keep database tokens private and out of source control.

## TRON wallet imports

- Connect one or more TRON mainnet public addresses from the dashboard. The app validates TRON Base58Check addresses and only reads confirmed incoming transfers of Tether's TRC-20 USD₮ contract (`TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`).
- No wallet signature, private key, or seed phrase is requested. The integration does not move funds.
- Initial history is imported in pages of up to 2,000 transfers per sync request. If the wallet has more history, choose **Continue import** until it is complete; later syncs check for new confirmed transfers.
- Imported events are deduplicated by wallet and transfer event. Each imported payment retains its transaction ID and links to TronScan.
- Invoice and payment amounts use up to six decimal places and are stored as integer USDT atomic units. USD and other fiat currencies are not treated as equivalent to USDT.
- On-chain transfers do not include a dependable invoice reference or client identity. The sender address and transaction ID are recorded. The app only suggests a chain match when its exact USDT amount uniquely identifies one open invoice and there is no competing payment; a person must still confirm it.
- Disconnecting a wallet stops future imports but keeps already imported payment records.

## Build and serve

```powershell
npm run typecheck
npm run build
npm start
```

The production server serves the Vite website and JSON API from one origin. Configure `NODE_ENV=production`, `PORT`, `HOST` (optional; defaults to `0.0.0.0` in production), `DATABASE_URL`, and `DATABASE_AUTH_TOKEN` as required by the hosting environment. Apply schema migrations during application startup.

For Vercel, configure `DATABASE_URL` and `DATABASE_AUTH_TOKEN` to point to a persistent Turso/libSQL database in the Vercel project settings. The Vercel API function runs the same Express routes and applies the checked-in migrations; Vercel's static filesystem is not a persistent database. Existing accounts remain available only when the deployment connects to the database where they were created.

## Import CSV files

Use the in-app template downloads for the supported columns:

- Invoices: `invoice_number`, `client_name`, `client_email`, `amount`, `currency`, `due_date`
- Payments: `received_date`, `payer`, `amount`, `currency`, `reference`

Amounts can have up to six decimal places. Currency must be `USDT` (and defaults to `USDT` when omitted). The import screen also accepts common header variants such as `invoice_id`, `client`, `total`, `date`, `sender`, `memo`, and `description`. Dates must be parseable and are stored as `YYYY-MM-DD`. Rows without a required value are rejected. Duplicate invoice numbers and duplicate payment rows are skipped.

## Authentication and data boundaries

- Passwords are stored as salted scrypt hashes; plaintext passwords are never saved.
- Login sessions use random opaque tokens in `HttpOnly`, `SameSite=Strict` cookies. Only the SHA-256 token hash is stored in the database.
- Workspace IDs are taken from the authenticated session for data operations. Invoice and payment records are scoped to that workspace.
- USDT amounts are stored as integer six-decimal atomic units, not floating-point values.
- Write requests reject cross-origin `Origin` headers. The server applies basic browser security headers and a per-process limit to registration/login attempts.

## Current product scope

This is a working USDT invoice and payment matching product, not just a static dashboard. It does **not** connect to Cleva banking/payment APIs, initiate transfers, send email, support password recovery or multi-user invitations, or provide accounting, payroll, tax, or legal advice. TRON wallet imports require a configured TronGrid API key and are started manually from the dashboard. Only connect addresses whose activity you are authorized to process.
