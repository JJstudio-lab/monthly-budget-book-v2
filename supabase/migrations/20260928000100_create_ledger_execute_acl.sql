revoke execute on function public.create_ledger(text) from public, anon;
grant execute on function public.create_ledger(text) to authenticated;
