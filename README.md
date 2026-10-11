# Monthly Budget Book V2

*Web-first, Local Personal budget and expense management. App-ready in direction, not yet a native mobile app.*

Monthly Budget Book V2 is currently intended for personal use on a Mac mini with Local Supabase, with optional private access over Tailscale. The source in this repository is a local-first application; it does not require Vercel or Supabase Cloud for this setup. Do not publish private network addresses, credentials, or real financial data in this repository.

## Current status

### Implemented in the application

- Email/password sign-up, sign-in, and sign-out with Supabase Auth.
- Personal ledgers and shared-ledger membership roles (owner, editor, viewer), invitations, and database row-level security (RLS).
- Income and expense records: create, edit, delete, and filter by month, type, category, or text.
- Monthly and per-category budgets, spending/remaining summaries, and category budget usage indicators.
- Ledger-specific income/expense categories and payment methods, including ordering, activation/deactivation, and guarded deletion.
- Monthly consumption analysis and six-month expense trends.
- Responsive layouts for phone-sized screens and desktop; viewer-role screens are read-only in the UI.
- Explicit browser-local demo mode with synthetic data for trying the interface without a backend. Demo data stays in that browser's `localStorage`; demo mode is not secure authentication or multi-user storage.

### Verified in this sync-preparation worktree

- `npm test`: PASS, 2 test files / 19 tests.
- `npm run build`: PASS (TypeScript check and Vite production build).
- Local Supabase Playwright checks: PASS, 6 tests across category budgets, responsive Local Personal flows, and shared-ledger viewer behavior; run against a disposable isolated Local Supabase stack.
- `npm run test:rls`: PASS, 115 pgTAP tests across 3 database test files on that isolated stack.
- The Local Personal UI changes prepared here include expandable home category budgets, viewer read-only controls, and a more compact category-budget delete action.

The isolated test stack was stopped after testing; the running Mac mini service and its data were not modified. See **Not re-verified here** below.

### Not re-verified here

- The running Mac mini dataset/service and any Cloud/Production environment were not tested or changed. The passing checks above use synthetic data in a disposable isolated Local Supabase stack; they do not prove backups, recovery, or operational readiness.
- Public access, Vercel deployment behavior, Supabase Cloud, backups/recovery, and production security have not been validated by these local checks.

## Technology

- **UI:** React 18, TypeScript, Vite, and Lucide icons.
- **Data/auth:** Supabase JavaScript client; Local Supabase Auth and PostgreSQL for the personal setup.
- **Authorization:** PostgreSQL RLS policies and SQL migrations under `supabase/migrations/`; database tests use pgTAP under `supabase/tests/database/`.
- **Checks:** Vitest for calculation/policy logic, Playwright for browser flows, and pgTAP for database authorization.

The app includes an explicit development URL policy: Local mode accepts the local Supabase API; optional Tailnet test mode uses an explicitly configured Vite proxy to the local API. This does not make the app or Local Supabase a public service.

## Local Personal setup (Mac mini)

### 1. Install and start the local stack

Use a disposable/local development environment with Docker Desktop or another compatible container runtime. From this repository:

```sh
npm ci
npm exec -- supabase start
```

Use the Supabase CLI's local status output to obtain the *local* API URL and anon/publishable key. Do not use a Cloud project URL, service-role key, or production credentials. Add only the local values to the ignored `.env.local` file at the repository root:

```dotenv
VITE_DEMO_MODE=false
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local anon/publishable key>
```

Then start the web app:

```sh
npm run dev
```

Open `http://127.0.0.1:5173`, create a local account, and create a ledger. Without `.env.local`, the app instead uses synthetic browser-local demo data and does not send it to a backend.

### 2. Optional private Tailscale access

The default development server binds to loopback. To access it privately from another device, configure the Tailnet test mode in an ignored local environment file with the Mac mini's own Tailscale IP as `VITE_TAILNET_HOST` and `VITE_TAILNET_TEST_MODE=true`. Keep that address local; do not commit it. Tailnet mode binds Vite to that explicit address and proxies the local Supabase API through the development server. It is not intended for public Internet exposure.

### 3. Tests and local database caution

```sh
npm test
npm run build
```

Playwright and database/RLS commands are available, but use them only with a disposable local test database and synthetic accounts. In particular, `npm run test:rls` resets/replays this project's local database before running pgTAP. Never point these commands at Supabase Cloud or a production database; do not remove local-only safeguards or add remote/link options.

## Product direction: Web-first / App-ready

The product is Web-first: the browser application is the current usable surface and the primary target for the Local Personal setup. Responsive UI and a separated data-store boundary are a foundation for future app clients, but *App-ready does not mean native apps exist or have been tested*. Public Beta, an App Store release, and a Google Play release are future directions only; none is currently announced or implied as available.

## Development boundary

Current priority is Mac mini + Local Supabase + Tailscale for private personal use. Public Beta and mobile-store distribution require separate decisions and validation for public hosting, identity/security, backups, privacy, operational support, and platform-specific app work. This repository's local checks are not evidence that those future environments are ready.
