begin;
select plan(78);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','authenticated','authenticated','a@example.test','',now(),'{}','{"display_name":"Synthetic A"}'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','authenticated','authenticated','b@example.test','',now(),'{}','{"display_name":"Synthetic B"}'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','authenticated','authenticated','c@example.test','',now(),'{}','{"display_name":"Synthetic C"}'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','authenticated','authenticated','d@example.test','',now(),'{}','{"display_name":"Synthetic D"}');

insert into public.ledgers(id,name,created_by) values
 ('11111111-1111-4111-8111-111111111111','Shared A','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('22222222-2222-4222-8222-222222222222','Private B','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.ledger_members(ledger_id,user_id,role) values
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','owner');
insert into public.categories(id,ledger_id,name,type) values
 ('11111111-1111-4111-8111-111111111101','11111111-1111-4111-8111-111111111111','Food A','expense'),
 ('22222222-2222-4222-8222-222222222201','22222222-2222-4222-8222-222222222222','Food B','expense');
insert into public.payment_methods(id,ledger_id,name) values
 ('11111111-1111-4111-8111-111111111102','11111111-1111-4111-8111-111111111111','Cash A'),
 ('22222222-2222-4222-8222-222222222202','22222222-2222-4222-8222-222222222222','Cash B');
insert into public.transactions(id,ledger_id,category_id,payment_method_id,type,amount,occurred_on,description,created_by) values
 ('11111111-1111-4111-8111-111111111103','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111101','11111111-1111-4111-8111-111111111102','expense',123,'2026-09-01','Synthetic A transaction','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('22222222-2222-4222-8222-222222222203','22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222201','22222222-2222-4222-8222-222222222202','expense',456,'2026-09-01','Synthetic B transaction','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.monthly_budgets(ledger_id,month,amount,updated_by) values
 ('11111111-1111-4111-8111-111111111111','2026-09-01',1000,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('22222222-2222-4222-8222-222222222222','2026-09-01',2000,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.category_monthly_budgets(ledger_id,month,category_id,amount,updated_by) values
 ('11111111-1111-4111-8111-111111111111','2026-09-01','11111111-1111-4111-8111-111111111101',500,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

create temporary table test_invites (
  purpose text not null,
  invitation_id uuid not null,
  invite_token text not null,
  expires_at timestamptz not null,
  ledger_id uuid not null
);
grant select, insert on test_invites to authenticated;

select ok(to_regclass('public.ledger_invitations') is not null, 'invitation table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.ledger_invitations'::regclass), 'invitation table has RLS enabled');
select ok(not has_table_privilege('anon', 'public.ledger_invitations', 'select'), 'anon cannot read invitations');
select ok(not has_table_privilege('authenticated', 'public.ledger_invitations', 'select'), 'authenticated clients cannot read token records directly');
select ok(not has_function_privilege('anon', 'public.create_ledger_invitation(uuid,text,public.ledger_role)', 'execute'), 'anon cannot create invitations');
select ok(has_function_privilege('authenticated', 'public.create_ledger_invitation(uuid,text,public.ledger_role)', 'execute'), 'authenticated can call invitation RPC');
select ok(not has_function_privilege('anon', 'public.accept_ledger_invitation(text)', 'execute'), 'anon cannot accept invitations');
select ok(has_function_privilege('authenticated', 'public.accept_ledger_invitation(text)', 'execute'), 'authenticated can accept invitations');
select ok(not has_function_privilege('anon', 'public.list_ledger_invitations(uuid)', 'execute'), 'anon cannot list invitations');
select ok(has_function_privilege('authenticated', 'public.list_ledger_invitations(uuid)', 'execute'), 'authenticated can call owner-gated invitation list RPC');
select ok(not has_table_privilege('authenticated', 'public.ledger_members', 'insert'), 'clients cannot insert membership rows directly');
select ok(not has_table_privilege('authenticated', 'public.ledger_members', 'update'), 'clients cannot change membership rows directly');
select ok(not has_table_privilege('authenticated', 'public.ledger_members', 'delete'), 'clients cannot delete membership rows directly');
select ok(has_table_privilege('authenticated', 'public.ledger_members', 'select'), 'authenticated can read visible ledger membership rows');

set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select lives_ok($$insert into test_invites select 'c', invitation_id, invite_token, expires_at, '11111111-1111-4111-8111-111111111111'::uuid from public.create_ledger_invitation('11111111-1111-4111-8111-111111111111','C@EXAMPLE.TEST','editor')$$, 'owner creates a normalized editor invitation');
select ok((select invite_token ~ '^[0-9a-f]{64}$' from test_invites where purpose='c'), 'invitation returns an unguessable-format token');
select throws_ok($$select * from public.create_ledger_invitation('11111111-1111-4111-8111-111111111111','c@example.test','viewer')$$, '23505', null, 'duplicate open invite is rejected');
select throws_ok($$select * from public.create_ledger_invitation('11111111-1111-4111-8111-111111111111','not-an-email','viewer')$$, '22023', null, 'invalid invite email is rejected');
select throws_ok($$select * from public.create_ledger_invitation('11111111-1111-4111-8111-111111111111','x@example.test','owner')$$, '22023', null, 'owner cannot be granted by invitation');
select is((select count(*) from public.list_ledger_members('11111111-1111-4111-8111-111111111111')), 1::bigint, 'owner can list member details');
select is((select count(*) from public.list_ledger_invitations('11111111-1111-4111-8111-111111111111')), 1::bigint, 'owner can list outstanding invitations');
select lives_ok($$insert into test_invites select 'b', invitation_id, invite_token, expires_at, '11111111-1111-4111-8111-111111111111'::uuid from public.create_ledger_invitation('11111111-1111-4111-8111-111111111111','b@example.test','viewer')$$, 'owner invites a second synthetic user');
select lives_ok($$insert into test_invites select 'd', invitation_id, invite_token, expires_at, '11111111-1111-4111-8111-111111111111'::uuid from public.create_ledger_invitation('11111111-1111-4111-8111-111111111111','d@example.test','viewer')$$, 'owner creates revocable invitation');
select throws_ok($$select * from public.list_ledger_members('22222222-2222-4222-8222-222222222222')$$, '42501', null, 'owner cannot inspect a different ledger roster');
reset role;

select ok((select i.token_hash = extensions.digest(decode(t.invite_token,'hex'),'sha256') from test_invites t join public.ledger_invitations i on i.id=t.invitation_id where t.purpose='c'), 'only a token digest is stored');

set local role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
select is((select count(*) from public.ledgers), 1::bigint, 'user B initially sees only their own ledger');
select is((select count(*) from public.transactions), 1::bigint, 'user B initially sees only their own ledger transactions');
select throws_ok($$select * from public.create_ledger_invitation('11111111-1111-4111-8111-111111111111','x@example.test','viewer')$$, '42501', null, 'non-owner cannot invite to another ledger');
select throws_ok($$select * from public.list_ledger_members('11111111-1111-4111-8111-111111111111')$$, '42501', null, 'non-owner cannot list member contact details');
select throws_ok($$select * from public.list_ledger_invitations('11111111-1111-4111-8111-111111111111')$$, '42501', null, 'non-owner cannot list pending invitations');
select throws_ok($$select public.set_ledger_member_role('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','viewer')$$, '42501', null, 'non-owner cannot change member roles');
select throws_ok($$select public.remove_ledger_member('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, '42501', null, 'non-owner cannot remove members');
select throws_ok($$select public.revoke_ledger_invitation((select invitation_id from test_invites where purpose='c'))$$, '42501', null, 'non-owner cannot revoke invitations');
select throws_ok($$select public.accept_ledger_invitation((select invite_token from test_invites where purpose='c'))$$, '42501', null, 'invitation cannot be claimed by a different email');
select lives_ok($$select public.accept_ledger_invitation((select invite_token from test_invites where purpose='b'))$$, 'invited user B joins the shared ledger');
select is((select count(*) from public.ledger_members), 3::bigint, 'B sees memberships only in ledgers they belong to');
select is((select count(*) from public.transactions), 2::bigint, 'B can read transactions from both ledgers they now belong to');
select is((select count(*) from public.categories where ledger_id='11111111-1111-4111-8111-111111111111'), 1::bigint, 'B can read categories in the joined ledger');
select is((select count(*) from public.monthly_budgets where ledger_id='11111111-1111-4111-8111-111111111111'), 1::bigint, 'B can read the joined ledger monthly budget');
select is((select count(*) from public.category_monthly_budgets where ledger_id='11111111-1111-4111-8111-111111111111'), 1::bigint, 'B can read joined ledger category budgets');
select is((select role::text from public.ledger_members where ledger_id='11111111-1111-4111-8111-111111111111' and user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'viewer', 'invite assigns the requested viewer role');
select throws_ok($$select public.accept_ledger_invitation((select invite_token from test_invites where purpose='b'))$$, '42501', null, 'accepted invitation token is one-time');
select throws_ok($$insert into public.categories(ledger_id,name,type) values ('11111111-1111-4111-8111-111111111111','Viewer write','expense')$$, '42501', null, 'viewer cannot write shared-ledger categories');
select throws_ok($$insert into public.transactions(ledger_id,category_id,payment_method_id,type,amount,occurred_on,description) values ('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111101','11111111-1111-4111-8111-111111111102','expense',10,'2026-09-02','Viewer write')$$, '42501', null, 'viewer cannot write shared-ledger transactions');
select throws_ok($$insert into public.monthly_budgets(ledger_id,month,amount) values ('11111111-1111-4111-8111-111111111111','2026-10-01',3000)$$, '42501', null, 'viewer cannot write shared-ledger monthly budgets');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
select lives_ok($$select public.accept_ledger_invitation((select invite_token from test_invites where purpose='c'))$$, 'invited user C joins with the matching verified email');
select is((select count(*) from public.ledgers where id='11111111-1111-4111-8111-111111111111'), 1::bigint, 'joined user C can read the shared ledger');
select is((select count(*) from public.ledgers where id='22222222-2222-4222-8222-222222222222'), 0::bigint, 'joined user C still cannot read an unrelated ledger');
select is((select count(*) from public.transactions where ledger_id='11111111-1111-4111-8111-111111111111'), 1::bigint, 'joined user C can read shared-ledger transactions');
select is((select count(*) from public.transactions where ledger_id='22222222-2222-4222-8222-222222222222'), 0::bigint, 'joined user C cannot read unrelated-ledger transactions');
select lives_ok($$insert into public.categories(ledger_id,name,type) values ('11111111-1111-4111-8111-111111111111','Editor write','expense')$$, 'editor can write to the shared ledger');
select lives_ok($$insert into public.transactions(ledger_id,category_id,payment_method_id,type,amount,occurred_on,description) values ('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111101','11111111-1111-4111-8111-111111111102','expense',77,'2026-09-02','Editor write')$$, 'editor can write shared-ledger transactions');
select lives_ok($$insert into public.monthly_budgets(ledger_id,month,amount) values ('11111111-1111-4111-8111-111111111111','2026-10-01',3000)$$, 'editor can write shared-ledger monthly budgets');
select lives_ok($$insert into public.category_monthly_budgets(ledger_id,month,category_id,amount) values ('11111111-1111-4111-8111-111111111111','2026-10-01','11111111-1111-4111-8111-111111111101',800)$$, 'editor can write shared-ledger category budgets');
select throws_ok($$select * from public.list_ledger_members('11111111-1111-4111-8111-111111111111')$$, '42501', null, 'editor cannot read owner-only member contact details');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select lives_ok($$select public.set_ledger_member_role('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','viewer')$$, 'owner changes a member role');
select is((select role::text from public.list_ledger_members('11111111-1111-4111-8111-111111111111') where user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 'viewer', 'owner roster reflects the updated role');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
select throws_ok($$insert into public.categories(ledger_id,name,type) values ('11111111-1111-4111-8111-111111111111','Demoted viewer write','expense')$$, '42501', null, 'demoted viewer immediately loses write access');
select is((select count(*) from public.transactions where ledger_id='11111111-1111-4111-8111-111111111111'), 2::bigint, 'demoted viewer retains shared-ledger transaction read access');
select is((select count(*) from public.categories where ledger_id='11111111-1111-4111-8111-111111111111'), 2::bigint, 'demoted viewer retains shared-ledger category read access');
select is((select count(*) from public.monthly_budgets where ledger_id='11111111-1111-4111-8111-111111111111'), 2::bigint, 'demoted viewer retains shared-ledger monthly budget read access');
select is((select count(*) from public.category_monthly_budgets where ledger_id='11111111-1111-4111-8111-111111111111'), 2::bigint, 'demoted viewer retains shared-ledger category budget read access');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select throws_ok($$select public.set_ledger_member_role('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','viewer')$$, '22023', null, 'owner role cannot be changed');
select lives_ok($$select public.revoke_ledger_invitation((select invitation_id from test_invites where purpose='d'))$$, 'owner revokes a pending invitation');
select lives_ok($$select public.remove_ledger_member('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc')$$, 'owner removes a non-owner member');
select throws_ok($$select public.remove_ledger_member('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, '22023', null, 'owner cannot remove the ledger owner');
select is((select count(*) from public.list_ledger_members('11111111-1111-4111-8111-111111111111')), 2::bigint, 'owner roster reflects membership change');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
select is((select count(*) from public.ledgers where id='11111111-1111-4111-8111-111111111111'), 0::bigint, 'removed member immediately loses shared-ledger access');
select is((select count(*) from public.transactions where ledger_id='11111111-1111-4111-8111-111111111111'), 0::bigint, 'removed member immediately loses shared-ledger transaction access');
select is((select count(*) from public.categories where ledger_id='11111111-1111-4111-8111-111111111111'), 0::bigint, 'removed member immediately loses shared-ledger category access');
select is((select count(*) from public.monthly_budgets where ledger_id='11111111-1111-4111-8111-111111111111'), 0::bigint, 'removed member immediately loses shared-ledger monthly budget access');
select is((select count(*) from public.category_monthly_budgets where ledger_id='11111111-1111-4111-8111-111111111111'), 0::bigint, 'removed member immediately loses shared-ledger category budget access');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
select throws_ok($$select public.accept_ledger_invitation((select invite_token from test_invites where purpose='d'))$$, '42501', null, 'revoked invitation cannot be accepted');
select is((select count(*) from public.ledgers), 0::bigint, 'non-member cannot read any ledger');
select is((select count(*) from public.transactions), 0::bigint, 'non-member cannot read transactions');
select is((select count(*) from public.categories), 0::bigint, 'non-member cannot read categories');
select is((select count(*) from public.monthly_budgets), 0::bigint, 'non-member cannot read monthly budgets');
select is((select count(*) from public.category_monthly_budgets), 0::bigint, 'non-member cannot read category budgets');
reset role;

select * from finish();
rollback;
