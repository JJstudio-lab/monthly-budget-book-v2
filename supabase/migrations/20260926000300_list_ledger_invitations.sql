-- Expose invitation metadata to ledger owners without exposing token digests.
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

revoke all on function public.list_ledger_invitations(uuid) from public, anon, authenticated;
grant execute on function public.list_ledger_invitations(uuid) to authenticated;
