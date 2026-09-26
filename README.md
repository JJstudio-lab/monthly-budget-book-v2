# Monthly Budget Book V2 — local MVP

This worktree is isolated from the original production app. The production `index.html` and original project are not used or changed here. Do not deploy or push this branch as part of the MVP task.

## Run the app

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Without `.env.local`, the app uses an explicitly labeled browser-local demo store with synthetic users A/B and fake data; nothing is sent to a backend. Demo data is stored only in this browser's localStorage. It is not production authentication or secure multi-user storage.

## Local Supabase

Requires Docker Desktop or another compatible local container runtime. The Supabase CLI is pinned in this project's dev dependencies and installed by `npm ci`. From this worktree only, run:

```sh
npm run test:rls
```

This starts the local stack, resets/replays migrations against the local DB, and runs pgTAP tests. Manual local-only commands (after `npm ci`) are `npm exec -- supabase start`, `npm exec -- supabase db reset --local`, and `npm exec -- supabase test db --local`. `supabase db reset --local` destroys and recreates only this project's local DB; never remove `--local` or add `--linked`/remote options. The migration creates the entire app schema from an empty DB. pgTAP tests use synthetic `example.test` users and fixed fake rows only.

To use the local Auth/Data API instead of demo mode, copy the local-only values from `npm exec -- supabase status -o env` into ignored `.env.local`:

```dotenv
VITE_DEMO_MODE=false
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local anon/publishable key>
```

The client has a runtime guard that rejects any non-loopback Supabase hostname. Never place production URLs, keys, service-role keys, or real financial data in this worktree. Local Auth confirmations are disabled for synthetic test accounts. Sign up, create a ledger, then use the app.

## Checks

```sh
npm test
npm run build
npm run test:e2e
npm run test:rls
```

Vitest covers pure monthly summary, budget percentage, filtering, and TWD formatting. Playwright covers synthetic A's login, expense creation, budget setting, search, logout, and data separation from synthetic B. Database tests cover cross-user read/write denials, non-member denial, and RPC execute permissions. A successful browser-demo test does not substitute for running the Supabase/RLS tests.

## First-version scope

- Supabase Auth signup/login/logout and personal/shared ledger membership schema.
- Ledger-specific categories and payment methods: create, rename, sort, deactivate/reactivate, and delete only when not referenced.
- Income/expense entry create/edit/delete, month budget, monthly overview, and month/type/category/text filtering.
- Responsive mobile-first UI and desktop navigation.
- Shared-ledger membership/roles exist in the schema and are RLS-protected; member invitations/management UI is not included yet.
