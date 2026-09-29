# Monthly Budget Book V2 — Project Rules

## Shared project state

- For this long-running V2 repo, `PROJECT_STATUS.md` is the concise shared-state summary; `AGENTS.md` holds durable project rules. Do not create status files for one-off work or when a reliable existing status source is sufficient.
- Every specialist taking a repository task must read this `AGENTS.md`, then `PROJECT_STATUS.md`, and inspect the actual repo, DB, or service state before work. Ai_Dango task handoffs contain only the current goal, limits, and acceptance criteria—not full chat context.
- After task completion and verification, update `PROJECT_STATUS.md` only when project state actually changed. Record verified PASS items, current phase, key constraints/decisions, blockers, unfinished items, and next phase only; no chat, tool/debug logs, or daily history. The primary worker owns the update after the phase; never edit it concurrently with another Bot.

## Goal
Build a multi-user monthly budgeting and bookkeeping app that Hermes can maintain long term.

## Data and security architecture
- Develop against Local Supabase first; production is never a development or experimentation environment.
- Version all schema changes with migrations.
- Use synthetic users and fake data for testing; never use production user data as test fixtures.
- Treat Row Level Security (RLS) as the actual authorization boundary, not UI-only controls.
- Personal and shared ledgers use the same data model.

## Product rules
- Categories and payment methods are data-driven and support adding, renaming, reordering, and disabling.
- When historical transactions reference a category or payment method, prefer disabling it over hard deletion.

## Production boundary
- Prepare production deployment only after Local Supabase passes.
- Production migrations and destructive operations require JJ's explicit approval.
