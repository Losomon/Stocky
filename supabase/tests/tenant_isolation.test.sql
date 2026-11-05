begin;

select plan(18);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'owner-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'owner-b@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'worker-a@example.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","email":"owner-a@example.test","role":"authenticated"}', true);
select set_config('test.business_a', public.create_business('Business A', 'UTC')::text, true);
select set_config(
  'test.invitation_token',
  invitation_token,
  true
)
from public.create_member_invitation(
  current_setting('test.business_a')::uuid,
  'worker-a@example.test',
  'cashier'
);

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","email":"owner-b@example.test","role":"authenticated"}', true);
select set_config('test.business_b', public.create_business('Business B', 'UTC')::text, true);

reset role;
insert into public.products (
  id, business_id, name, sku, unit, cost, price, min_stock
) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_setting('test.business_a')::uuid, 'A product', 'A-1', 'piece', 3, 5, 0),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', current_setting('test.business_b')::uuid, 'B product', 'B-1', 'piece', 7, 9, 0);
insert into public.sales (
  id, business_id, receipt_no, actor_user_id, payment, total, status
) values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  current_setting('test.business_a')::uuid,
  'A-1',
  '11111111-1111-4111-8111-111111111111',
  'cash',
  0,
  'completed'
);

select throws_ok(
  format(
    'insert into public.sale_items (business_id, sale_id, product_id, qty, unit_price, unit_cost) values (%L, %L, %L, 1, 1, 1)',
    current_setting('test.business_b'),
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ),
  '23503',
  'child rows cannot reference a parent in another business'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","email":"owner-a@example.test","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.products where business_id = current_setting('test.business_a')::uuid),
  1,
  'business A can read its product'
);
select is(
  (select count(*)::integer from public.products where business_id = current_setting('test.business_b')::uuid),
  0,
  'business A cannot read business B products'
);
select is(
  (select count(*)::integer from public.businesses where id = current_setting('test.business_b')::uuid),
  0,
  'business A cannot read business B profile'
);
select is(
  (select count(*)::integer from public.business_members where business_id = current_setting('test.business_b')::uuid),
  0,
  'business A cannot read business B memberships'
);
select ok(
  public.get_business_costs(current_setting('test.business_a')::uuid) ? 'products',
  'business owner can access their cost data through the guarded function'
);

select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","email":"worker-a@example.test","role":"authenticated"}', true);
select is(
  public.claim_member_invitation(current_setting('test.invitation_token')),
  current_setting('test.business_a')::uuid,
  'an invited worker joins only after authenticating as the invited email'
);
select is(
  (select count(*)::integer from public.products where business_id = current_setting('test.business_a')::uuid),
  1,
  'invited worker can read the invited business data'
);
select is(
  (select count(*)::integer from public.products where business_id = current_setting('test.business_b')::uuid),
  0,
  'invited worker cannot read another business data'
);
select is(
  (select role::text from public.business_members where business_id = current_setting('test.business_a')::uuid and user_id = auth.uid()),
  'cashier',
  'invited worker receives the assigned least-privilege role'
);
select throws_ok(
  format('select public.get_business_costs(%L::uuid)', current_setting('test.business_a')),
  '42501',
  'cashier cannot access cost data'
);
select throws_ok(
  format('select cost from public.products where id = %L::uuid', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  '42501',
  'cashier cannot select the product cost column directly'
);

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","email":"owner-b@example.test","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.products where business_id = current_setting('test.business_b')::uuid),
  1,
  'business B can read its product'
);
select is(
  (select count(*)::integer from public.products where business_id = current_setting('test.business_a')::uuid),
  0,
  'business B cannot read business A products'
);
select throws_ok(
  format(
    'insert into public.products (business_id, name, sku, unit, cost, price) values (%L, %L, %L, %L, 1, 2)',
    current_setting('test.business_a'),
    'Unauthorized',
    'X-1',
    'piece'
  ),
  '42501',
  'business members cannot bypass the future atomic write API'
);
select throws_ok(
  format(
    'update public.products set name = %L where id = %L::uuid',
    'Unauthorized',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ),
  '42501',
  'business members cannot update records directly'
);
select throws_ok(
  format(
    'delete from public.products where id = %L::uuid',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  ),
  '42501',
  'business members cannot delete records directly'
);

reset role;
set local role anon;
select throws_ok(
  'select id from public.businesses limit 1',
  '42501',
  'anonymous clients cannot read business records'
);
reset role;

select * from finish();
rollback;
