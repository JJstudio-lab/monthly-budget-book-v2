create table public.category_monthly_budgets (
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  category_id uuid not null,
  category_type public.transaction_type not null default 'expense' check (category_type = 'expense'),
  amount bigint not null check (amount >= 0 and amount <= 1000000000000),
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (ledger_id, month, category_id),
  foreign key (ledger_id, category_id, category_type)
    references public.categories(ledger_id, id, type) on delete restrict
);

alter table public.category_monthly_budgets enable row level security;

create policy "members read category budgets"
on public.category_monthly_budgets for select to authenticated
using (public.is_ledger_member(ledger_id));

create policy "editors manage category budgets"
on public.category_monthly_budgets for all to authenticated
using (public.can_edit_ledger(ledger_id))
with check (public.can_edit_ledger(ledger_id));

grant select, insert, update, delete on public.category_monthly_budgets to authenticated;
