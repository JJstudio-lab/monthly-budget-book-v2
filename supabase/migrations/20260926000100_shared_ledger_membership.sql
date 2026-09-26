-- Shared-ledger invitations and owner-only membership management.
-- Invitation tokens are returned once at creation and only their SHA-256 digests are stored.

create table public.ledger_invitations (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  email text not null check (
    email = lower(btrim(email))
    and length(email) between 3 and 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  role public.ledger_role not null check (role in ('editor', 'viewer')),
  token_hash bytea not null unique check (octet_length(token_hash) = 32),
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  revoked_at timestamptz,
  check (expires_at > created_at),
  check ((accepted_at is null) = (accepted_by is null)),
  check (accepted_at is null or revoked_at is null)
);

create unique index ledger_invitations_one_open_email_idx
  on public.ledger_invitations (ledger_id, email)
  where accepted_at is null and revoked_at is null;
create index ledger_invitations_ledger_created_idx
  on public.ledger_invitations (ledger_id, created_at desc);

alter table public.ledger_invitations enable row level security;
revoke all on public.ledger_invitations from public, anon, authenticated;

-- Member rows remain visible to ledger members under the existing SELECT policy,
-- but all membership mutations go through narrowly-scoped SECURITY DEFINER RPCs.
drop policy if exists "ledger owner manages members" on public.ledger_members;
revoke insert, update, delete on public.ledger_members from public, anon, authenticated;
grant select on public.ledger_members to authenticated;

create or replace function public.create_ledger_invitation(
  p_ledger_id uuid,
  p_email text,
  p_role public.ledger_role
)
returns table (invitation_id uuid, invite_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_raw_token text;
  v_invitation_id uuid;
  v_expires_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not public.is_ledger_owner(p_ledger_id) then
    raise exception 'ledger owner required' using errcode = '42501';
  end if;

  v_email := lower(btrim(coalesce(p_email, '')));
  if length(v_email) not between 3 and 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid invitation email' using errcode = '22023';
  end if;
  if p_role is null or p_role not in ('editor'::public.ledger_role, 'viewer'::public.ledger_role) then
    raise exception 'invitation role must be editor or viewer' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.ledger_members m
    join auth.users u on u.id = m.user_id
    where m.ledger_id = p_ledger_id and lower(btrim(u.email)) = v_email
  ) then
    raise exception 'user is already a ledger member' using errcode = '23505';
  end if;

  -- Retire expired tokens before enforcing the one-open-invitation constraint.
  update public.ledger_invitations i
  set revoked_at = now()
  where i.ledger_id = p_ledger_id
    and i.email = v_email
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at <= now();

  if exists (
    select 1 from public.ledger_invitations i
    where i.ledger_id = p_ledger_id
      and i.email = v_email
      and i.accepted_at is null
      and i.revoked_at is null
  ) then
    raise exception 'an invitation is already pending for this email' using errcode = '23505';
  end if;

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at := now() + interval '7 days';
  insert into public.ledger_invitations (
    ledger_id, email, role, token_hash, invited_by, expires_at
  ) values (
    p_ledger_id,
    v_email,
    p_role,
    extensions.digest(decode(v_raw_token, 'hex'), 'sha256'),
    auth.uid(),
    v_expires_at
  ) returning id into v_invitation_id;

  return query select v_invitation_id, v_raw_token, v_expires_at;
end
$$;

create or replace function public.accept_ledger_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_email_confirmed_at timestamptz;
  v_invitation public.ledger_invitations%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_token is null or length(p_token) <> 64 or p_token !~ '^[0-9A-Fa-f]{64}$' then
    raise exception 'invalid or expired invitation' using errcode = '42501';
  end if;

  select lower(btrim(u.email)), u.email_confirmed_at
  into v_email, v_email_confirmed_at
  from auth.users u
  where u.id = v_user_id;
  if v_email is null or v_email_confirmed_at is null then
    raise exception 'verified account email required' using errcode = '42501';
  end if;

  select i.* into v_invitation
  from public.ledger_invitations i
  where i.token_hash = extensions.digest(decode(lower(p_token), 'hex'), 'sha256')
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now()
  for update;
  if not found or v_invitation.email <> v_email then
    raise exception 'invalid or expired invitation' using errcode = '42501';
  end if;

  insert into public.ledger_members (ledger_id, user_id, role)
  values (v_invitation.ledger_id, v_user_id, v_invitation.role)
  on conflict (ledger_id, user_id) do nothing;

  update public.ledger_invitations
  set accepted_at = now(), accepted_by = v_user_id
  where id = v_invitation.id;

  return v_invitation.ledger_id;
end
$$;

create or replace function public.list_ledger_members(p_ledger_id uuid)
returns table (
  user_id uuid,
  email text,
  display_name text,
  role public.ledger_role,
  joined_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_ledger_owner(p_ledger_id) then
    raise exception 'ledger owner required' using errcode = '42501';
  end if;

  return query
  select m.user_id, u.email::text, coalesce(p.display_name, '')::text, m.role, m.joined_at
  from public.ledger_members m
  join auth.users u on u.id = m.user_id
  left join public.profiles p on p.id = m.user_id
  where m.ledger_id = p_ledger_id
  order by m.joined_at, u.email;
end
$$;

create or replace function public.list_ledger_invitations(p_ledger_id uuid)
returns table (
  invitation_id uuid,
  email text,
  role public.ledger_role,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_ledger_owner(p_ledger_id) then
    raise exception 'ledger owner required' using errcode = '42501';
  end if;

  return query
  select i.id, i.email, i.role, i.created_at, i.expires_at
  from public.ledger_invitations i
  where i.ledger_id = p_ledger_id
    and i.accepted_at is null
    and i.revoked_at is null
  order by i.created_at desc, i.id;
end
$$;

create or replace function public.set_ledger_member_role(
  p_ledger_id uuid,
  p_user_id uuid,
  p_role public.ledger_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_ledger_owner(p_ledger_id) then
    raise exception 'ledger owner required' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('editor'::public.ledger_role, 'viewer'::public.ledger_role) then
    raise exception 'member role must be editor or viewer' using errcode = '22023';
  end if;

  update public.ledger_members m
  set role = p_role
  where m.ledger_id = p_ledger_id
    and m.user_id = p_user_id
    and m.role <> 'owner'::public.ledger_role;
  if not found then
    raise exception 'member not found or owner role is immutable' using errcode = '22023';
  end if;
end
$$;

create or replace function public.remove_ledger_member(p_ledger_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_ledger_owner(p_ledger_id) then
    raise exception 'ledger owner required' using errcode = '42501';
  end if;

  delete from public.ledger_members m
  where m.ledger_id = p_ledger_id
    and m.user_id = p_user_id
    and m.role <> 'owner'::public.ledger_role;
  if not found then
    raise exception 'member not found or owner cannot be removed' using errcode = '22023';
  end if;
end
$$;

create or replace function public.revoke_ledger_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ledger_invitations i
  set revoked_at = now()
  where i.id = p_invitation_id
    and i.accepted_at is null
    and i.revoked_at is null
    and public.is_ledger_owner(i.ledger_id);
  if not found then
    raise exception 'invitation not found or not manageable' using errcode = '42501';
  end if;
end
$$;

revoke all on function public.create_ledger_invitation(uuid, text, public.ledger_role) from public, anon, authenticated;
revoke all on function public.accept_ledger_invitation(text) from public, anon, authenticated;
revoke all on function public.list_ledger_members(uuid) from public, anon, authenticated;
revoke all on function public.list_ledger_invitations(uuid) from public, anon, authenticated;
revoke all on function public.set_ledger_member_role(uuid, uuid, public.ledger_role) from public, anon, authenticated;
revoke all on function public.remove_ledger_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.revoke_ledger_invitation(uuid) from public, anon, authenticated;
grant execute on function public.create_ledger_invitation(uuid, text, public.ledger_role) to authenticated;
grant execute on function public.accept_ledger_invitation(text) to authenticated;
grant execute on function public.list_ledger_members(uuid) to authenticated;
grant execute on function public.list_ledger_invitations(uuid) to authenticated;
grant execute on function public.set_ledger_member_role(uuid, uuid, public.ledger_role) to authenticated;
grant execute on function public.remove_ledger_member(uuid, uuid) to authenticated;
grant execute on function public.revoke_ledger_invitation(uuid) to authenticated;
