# Monthly Budget Book V2 — Project Rules

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
