create extension if not exists pgcrypto;

create type public.ledger_role as enum ('owner', 'editor', 'viewer');
create type public.transaction_type as enum ('income', 'expense');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.ledgers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  currency char(3) not null default 'TWD' check (currency = 'TWD'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.ledger_members (
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.ledger_role not null default 'editor',
  joined_at timestamptz not null default now(),
  primary key (ledger_id, user_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 50),
  type public.transaction_type not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (ledger_id, type, name),
  unique (ledger_id, id),
  unique (ledger_id, id, type)
);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 50),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (ledger_id, name),
  unique (ledger_id, id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  category_id uuid not null,
  payment_method_id uuid not null,
  type public.transaction_type not null,
  amount bigint not null check (amount > 0 and amount <= 1000000000000),
  occurred_on date not null,
  description text not null default '' check (length(description) <= 240),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (ledger_id, category_id, type) references public.categories(ledger_id, id, type) on delete restrict,
  foreign key (ledger_id, payment_method_id) references public.payment_methods(ledger_id, id) on delete restrict
);

create table public.monthly_budgets (
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount bigint not null check (amount >= 0 and amount <= 1000000000000),
  updated_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (ledger_id, month)
);

create index transactions_ledger_date_idx on public.transactions (ledger_id, occurred_on desc);
create index transactions_ledger_category_idx on public.transactions (ledger_id, category_id);

create or replace function public.is_ledger_member(p_ledger_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ledger_members m where m.ledger_id = p_ledger_id and m.user_id = (select auth.uid()))
$$;

create or replace function public.can_edit_ledger(p_ledger_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ledger_members m where m.ledger_id = p_ledger_id and m.user_id = (select auth.uid()) and m.role in ('owner', 'editor'))
$$;

create or replace function public.is_ledger_owner(p_ledger_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ledger_members m where m.ledger_id = p_ledger_id and m.user_id = (select auth.uid()) and m.role = 'owner')
$$;

create or replace function public.create_ledger(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_ledger uuid;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_name is null or length(trim(p_name)) not between 1 and 80 then raise exception 'invalid ledger name' using errcode = '22023'; end if;
  insert into public.ledgers(name, created_by) values (trim(p_name), v_user) returning id into v_ledger;
  insert into public.ledger_members(ledger_id, user_id, role) values (v_ledger, v_user, 'owner');
  insert into public.categories(ledger_id, name, type, sort_order) values
    (v_ledger, '餐飲', 'expense', 10), (v_ledger, '交通', 'expense', 20), (v_ledger, '生活', 'expense', 30), (v_ledger, '薪資', 'income', 10), (v_ledger, '其他收入', 'income', 20);
  insert into public.payment_methods(ledger_id, name, sort_order) values (v_ledger, '現金', 10), (v_ledger, '信用卡', 20), (v_ledger, '轉帳', 30);
  return v_ledger;
end
$$;

create or replace function public.on_auth_user_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.on_auth_user_created();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;
create trigger transactions_touch_updated_at before update on public.transactions for each row execute function public.touch_updated_at();
create trigger budgets_touch_updated_at before update on public.monthly_budgets for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.ledgers enable row level security;
alter table public.ledger_members enable row level security;
alter table public.categories enable row level security;
alter table public.payment_methods enable row level security;
alter table public.transactions enable row level security;
alter table public.monthly_budgets enable row level security;

create policy "profile read own" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profile update own" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "ledger members read" on public.ledgers for select to authenticated using (public.is_ledger_member(id));
create policy "ledger members list" on public.ledger_members for select to authenticated using (public.is_ledger_member(ledger_id));
create policy "ledger owner manages members" on public.ledger_members for all to authenticated using (public.is_ledger_owner(ledger_id)) with check (public.is_ledger_owner(ledger_id));
create policy "members read categories" on public.categories for select to authenticated using (public.is_ledger_member(ledger_id));
create policy "editors manage categories" on public.categories for all to authenticated using (public.can_edit_ledger(ledger_id)) with check (public.can_edit_ledger(ledger_id));
create policy "members read payment methods" on public.payment_methods for select to authenticated using (public.is_ledger_member(ledger_id));
create policy "editors manage payment methods" on public.payment_methods for all to authenticated using (public.can_edit_ledger(ledger_id)) with check (public.can_edit_ledger(ledger_id));
create policy "members read transactions" on public.transactions for select to authenticated using (public.is_ledger_member(ledger_id));
create policy "editors manage transactions" on public.transactions for all to authenticated using (public.can_edit_ledger(ledger_id)) with check (public.can_edit_ledger(ledger_id));
create policy "members read budgets" on public.monthly_budgets for select to authenticated using (public.is_ledger_member(ledger_id));
create policy "editors manage budgets" on public.monthly_budgets for all to authenticated using (public.can_edit_ledger(ledger_id)) with check (public.can_edit_ledger(ledger_id));

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.ledgers, public.ledger_members to authenticated;
grant select, insert, update, delete on public.categories, public.payment_methods, public.transactions, public.monthly_budgets to authenticated;
grant execute on function public.is_ledger_member(uuid), public.can_edit_ledger(uuid), public.is_ledger_owner(uuid), public.create_ledger(text) to authenticated;
revoke all on function public.is_ledger_member(uuid), public.can_edit_ledger(uuid), public.is_ledger_owner(uuid), public.create_ledger(text) from public, anon;
-- RLS invokes the security-definer helpers as authenticated users.
grant execute on function public.is_ledger_member(uuid), public.can_edit_ledger(uuid), public.is_ledger_owner(uuid), public.create_ledger(text) to authenticated;
