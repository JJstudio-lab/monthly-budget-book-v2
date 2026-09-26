begin;
select plan(13);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','authenticated','authenticated','a@example.test','',now(),'{}','{"display_name":"Synthetic A"}'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','authenticated','authenticated','b@example.test','',now(),'{}','{"display_name":"Synthetic B"}'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','authenticated','authenticated','c@example.test','',now(),'{}','{"display_name":"Synthetic C"}');

insert into public.ledgers(id,name,created_by) values
 ('11111111-1111-4111-8111-111111111111','A private ledger','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('22222222-2222-4222-8222-222222222222','B private ledger','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
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

select ok(not has_function_privilege('anon','public.create_ledger(text)','EXECUTE'),'anon cannot execute create_ledger RPC');
select ok(has_function_privilege('authenticated','public.create_ledger(text)','EXECUTE'),'authenticated users can execute create_ledger RPC');
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select is((select count(*) from public.ledgers),1::bigint,'User A sees only their own ledger');
select is((select count(*) from public.transactions),1::bigint,'User A sees only their own transactions');
select is((select count(*) from public.transactions where id='22222222-2222-4222-8222-222222222203'),0::bigint,'User A cannot read User B transaction');
select is((select count(*) from public.ledger_members where user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),0::bigint,'User A cannot read User B membership');
select throws_ok($$insert into public.categories(ledger_id,name,type) values ('22222222-2222-4222-8222-222222222222','Cross write','expense')$$,'42501',null,'User A cannot write into User B ledger');
select throws_ok($$insert into public.transactions(ledger_id,category_id,payment_method_id,type,amount,occurred_on) values ('22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222201','22222222-2222-4222-8222-222222222202','expense',1,'2026-09-02')$$,'42501',null,'User A cannot create transaction for User B');
select lives_ok($$select public.create_ledger('RPC ledger for A')$$,'authenticated user can create a ledger via RPC');
select is((select count(*) from public.ledgers),2::bigint,'RPC-created ledger is immediately owned by caller');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
select is((select count(*) from public.ledgers),0::bigint,'non-member sees no ledgers');
select is((select count(*) from public.categories),0::bigint,'non-member sees no categories');
select throws_ok($$insert into public.monthly_budgets(ledger_id,month,amount) values ('11111111-1111-4111-8111-111111111111','2026-09-01',1000)$$,'42501',null,'non-member cannot write a budget');
reset role;
select * from finish();
rollback;
