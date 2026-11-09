# Cleva Match

Cleva Match is a full-stack TypeScript workspace for keeping business invoices and incoming payments together. It suggests matches using exact amount, currency, client name, and payment reference; a person must confirm any suggestion before an invoice is marked paid.

The app includes a public product website, account registration and sign-in, private workspaces, persistent storage, manual invoice/payment entry, CSV imports, match review, and invoice CSV export.

## Run locally

Requirements: Node.js 22.12 or newer and npm.

```powershell
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). Create an account and workspace to begin. The app creates and migrates a local SQLite-compatible `local.db` file automatically on startup. The database file and `.env` are ignored by Git.

To select a database or port, copy `.env.example` to `.env` and set values there. For local development, the default database is `file:local.db`. A hosted Turso/libSQL database can be used by setting:

```dotenv
DATABASE_URL=libsql://your-database-name-your-org.turso.io
DATABASE_AUTH_TOKEN=your-database-auth-token
```

Keep database tokens private and out of source control.

## Build and serve

```powershell
npm run typecheck
npm run build
npm start
```

The production server serves the Vite website and JSON API from one origin. Configure `NODE_ENV=production`, `PORT`, `HOST` (optional; defaults to `0.0.0.0` in production), `DATABASE_URL`, and `DATABASE_AUTH_TOKEN` as required by the hosting environment. Apply schema migrations during application startup.

## Import CSV files

Use the in-app template downloads for the supported columns:

- Invoices: `invoice_number`, `client_name`, `client_email`, `amount`, `currency`, `due_date`
- Payments: `received_date`, `payer`, `amount`, `currency`, `reference`

The import screen also accepts common header variants such as `invoice_id`, `client`, `total`, `date`, `sender`, `memo`, and `description`. Dates must be parseable and are stored as `YYYY-MM-DD`. Rows without a required value are rejected. Duplicate invoice numbers and duplicate payment rows are skipped.

## Authentication and data boundaries

- Passwords are stored as salted scrypt hashes; plaintext passwords are never saved.
- Login sessions use random opaque tokens in `HttpOnly`, `SameSite=Strict` cookies. Only the SHA-256 token hash is stored in the database.
- Workspace IDs are taken from the authenticated session for data operations. Invoice and payment records are scoped to that workspace.
- Amounts are stored as integer minor units, not floating-point values.
- Write requests reject cross-origin `Origin` headers. The server applies basic browser security headers and a per-process limit to registration/login attempts.

## Current product scope

This is a working invoice and payment matching product, not just a static dashboard. It does **not** yet connect to Cleva banking/payment APIs, initiate transfers, ingest bank feeds, send email, support password recovery or multi-user invitations, or provide accounting, payroll, tax, or legal advice. Incoming transactions must currently be entered or imported by the workspace owner. Only test with data you are authorized to process.
