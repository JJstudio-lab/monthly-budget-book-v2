begin;
select plan(24);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','authenticated','authenticated','category-a@example.test','',now(),'{}','{}'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','authenticated','authenticated','category-b@example.test','',now(),'{}','{}'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','authenticated','authenticated','category-c@example.test','',now(),'{}','{}');

insert into public.ledgers(id,name,created_by) values
 ('11111111-1111-4111-8111-111111111111','Category Budget A','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('22222222-2222-4222-8222-222222222222','Category Budget B','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.ledger_members(ledger_id,user_id,role) values
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','owner'),
 ('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','viewer'),
 ('22222222-2222-4222-8222-222222222222','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','owner');
insert into public.categories(id,ledger_id,name,type) values
 ('11111111-1111-4111-8111-111111111101','11111111-1111-4111-8111-111111111111','Food A','expense'),
 ('11111111-1111-4111-8111-111111111102','11111111-1111-4111-8111-111111111111','Salary A','income'),
 ('22222222-2222-4222-8222-222222222201','22222222-2222-4222-8222-222222222222','Food B','expense');
insert into public.category_monthly_budgets(ledger_id,month,category_id,amount,updated_by)
values ('22222222-2222-4222-8222-222222222222','2026-04-01','22222222-2222-4222-8222-222222222201',2000,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

select ok(to_regclass('public.category_monthly_budgets') is not null, 'category budget table exists');
select ok((select relrowsecurity from pg_class where oid='public.category_monthly_budgets'::regclass), 'category budgets have RLS enabled');
set local role anon;
select is((select count(*) from public.category_monthly_budgets),0::bigint, 'anon cannot read category budgets through RLS');
reset role;
select ok(has_table_privilege('authenticated','public.category_monthly_budgets','select'), 'authenticated can read visible category budgets');
select ok(has_table_privilege('authenticated','public.category_monthly_budgets','insert'), 'authenticated has insert privilege guarded by RLS');
select ok(has_table_privilege('authenticated','public.category_monthly_budgets','update'), 'authenticated has update privilege guarded by RLS');
select ok(has_table_privilege('authenticated','public.category_monthly_budgets','delete'), 'authenticated has delete privilege guarded by RLS');

set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select lives_ok($$insert into public.category_monthly_budgets(ledger_id,month,category_id,amount) values ('11111111-1111-4111-8111-111111111111','2026-04-01','11111111-1111-4111-8111-111111111101',1000)$$, 'owner creates an expense-category budget');
select is((select count(*) from public.category_monthly_budgets where month='2026-04-01'),1::bigint, 'owner reads the saved monthly category budget');
select lives_ok($$update public.category_monthly_budgets set amount=1250 where ledger_id='11111111-1111-4111-8111-111111111111' and month='2026-04-01' and category_id='11111111-1111-4111-8111-111111111101'$$, 'owner updates the amount');
select is((select amount from public.category_monthly_budgets where ledger_id='11111111-1111-4111-8111-111111111111' and month='2026-04-01'),1250::bigint, 'updated amount is persisted');
select throws_ok($$insert into public.category_monthly_budgets(ledger_id,month,category_id,amount) values ('11111111-1111-4111-8111-111111111111','2026-04-01','11111111-1111-4111-8111-111111111101',1500)$$,'23505',null,'duplicate ledger-month-category budget is rejected');
select lives_ok($$insert into public.category_monthly_budgets(ledger_id,month,category_id,amount) values ('11111111-1111-4111-8111-111111111111','2026-05-01','11111111-1111-4111-8111-111111111101',800)$$, 'same category can have a budget in a different month');
select throws_ok($$insert into public.category_monthly_budgets(ledger_id,month,category_id,amount) values ('11111111-1111-4111-8111-111111111111','2026-04-02','11111111-1111-4111-8111-111111111101',800)$$,'23514',null,'budget month must be the first day of its month');
select throws_ok($$insert into public.category_monthly_budgets(ledger_id,month,category_id,amount) values ('11111111-1111-4111-8111-111111111111','2026-06-01','11111111-1111-4111-8111-111111111101',-1)$$,'23514',null,'negative category budget is rejected');
select throws_ok($$insert into public.category_monthly_budgets(ledger_id,month,category_id,amount) values ('11111111-1111-4111-8111-111111111111','2026-06-01','11111111-1111-4111-8111-111111111102',500)$$,'23503',null,'income categories cannot receive expense budgets');
select throws_ok($$insert into public.category_monthly_budgets(ledger_id,month,category_id,amount) values ('11111111-1111-4111-8111-111111111111','2026-06-01','22222222-2222-4222-8222-222222222201',500)$$,'23503',null,'budget cannot reference another ledger category');
select is((select count(*) from public.category_monthly_budgets where ledger_id='22222222-2222-4222-8222-222222222222'),0::bigint, 'owner cannot read another ledger budgets');
select lives_ok($$delete from public.category_monthly_budgets where ledger_id='11111111-1111-4111-8111-111111111111' and month='2026-04-01'$$, 'owner deletes a category budget');
select is((select count(*) from public.category_monthly_budgets where ledger_id='11111111-1111-4111-8111-111111111111' and month='2026-04-01'),0::bigint, 'deleted category budget is no longer visible');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
select is((select count(*) from public.category_monthly_budgets),1::bigint, 'user B sees only budgets in their own ledger');
select throws_ok($$insert into public.category_monthly_budgets(ledger_id,month,category_id,amount) values ('11111111-1111-4111-8111-111111111111','2026-07-01','11111111-1111-4111-8111-111111111101',900)$$,'42501',null,'non-member cannot create another ledger budget');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
select is((select count(*) from public.category_monthly_budgets where ledger_id='11111111-1111-4111-8111-111111111111'),1::bigint, 'viewer can read shared ledger category budgets');
select throws_ok($$insert into public.category_monthly_budgets(ledger_id,month,category_id,amount) values ('11111111-1111-4111-8111-111111111111','2026-07-01','11111111-1111-4111-8111-111111111101',900)$$,'42501',null,'viewer cannot create a category budget');
reset role;

select * from finish();
rollback;
