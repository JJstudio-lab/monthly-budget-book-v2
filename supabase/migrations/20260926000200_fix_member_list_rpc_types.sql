-- Keep the member-list RPC return types aligned with auth.users/profiles columns.
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

revoke all on function public.list_ledger_members(uuid) from public, anon, authenticated;
grant execute on function public.list_ledger_members(uuid) to authenticated;
