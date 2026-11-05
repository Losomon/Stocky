create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create type public.business_role as enum ('owner', 'admin', 'manager', 'cashier');
create type public.membership_status as enum ('active', 'suspended');
create type public.stock_movement_type as enum ('sale', 'purchase', 'adjustment', 'damage', 'count', 'return', 'opening');

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  phone text,
  location text,
  timezone text not null default 'Africa/Nairobi',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_members (
  business_id uuid not null references public.businesses(id),
  user_id uuid not null references auth.users(id),
  role public.business_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create table public.business_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  email text not null check (email = lower(btrim(email))),
  role public.business_role not null check (role <> 'owner'),
  token_hash bytea not null unique,
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index business_invitations_pending_email_unique
  on public.business_invitations (business_id, email)
  where accepted_at is null;

create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  member_user_id uuid references auth.users(id),
  name text not null check (length(btrim(name)) between 1 and 120),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, member_user_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  name text not null check (length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (business_id, id),
  unique (business_id, name)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  name text not null check (length(btrim(name)) between 1 and 120),
  phone text,
  email text,
  location text,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  name text not null check (length(btrim(name)) between 1 and 120),
  contact text,
  phone text,
  email text,
  location text,
  notes text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  name text not null check (length(btrim(name)) between 1 and 160),
  sku text not null check (length(btrim(sku)) between 1 and 80),
  category_id uuid,
  unit text not null check (unit in ('piece', 'pack', 'bottle', 'carton', 'bag', 'box', 'dozen')),
  cost numeric(14, 2) not null check (cost >= 0),
  price numeric(14, 2) not null check (price >= 0),
  min_stock integer not null default 0 check (min_stock >= 0),
  barcode text,
  description text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, id),
  foreign key (business_id, category_id) references public.categories(business_id, id)
);
create unique index products_business_sku_unique
  on public.products (business_id, lower(sku));
create unique index products_business_barcode_unique
  on public.products (business_id, lower(barcode))
  where barcode is not null and btrim(barcode) <> '';

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  receipt_no text not null,
  created_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id),
  staff_member_id uuid,
  legacy_staff_name text,
  payment text not null check (payment in ('cash', 'mpesa')),
  total numeric(14, 2) not null check (total >= 0),
  status text not null check (status in ('completed', 'cancelled')),
  customer_id uuid,
  unique (business_id, id),
  unique (business_id, receipt_no),
  foreign key (business_id, customer_id) references public.customers(business_id, id),
  foreign key (business_id, staff_member_id) references public.staff_members(business_id, id)
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  sale_id uuid not null,
  product_id uuid not null,
  qty integer not null check (qty > 0),
  unit_price numeric(14, 2) not null check (unit_price >= 0),
  unit_cost numeric(14, 2) not null check (unit_cost >= 0),
  unique (business_id, id),
  foreign key (business_id, sale_id) references public.sales(business_id, id),
  foreign key (business_id, product_id) references public.products(business_id, id)
);

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  ref text not null,
  supplier_id uuid not null,
  created_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id),
  staff_member_id uuid,
  legacy_staff_name text,
  status text not null check (status in ('draft', 'ordered', 'cancelled')),
  note text,
  unique (business_id, id),
  unique (business_id, ref),
  foreign key (business_id, supplier_id) references public.suppliers(business_id, id),
  foreign key (business_id, staff_member_id) references public.staff_members(business_id, id)
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  purchase_id uuid not null,
  product_id uuid not null,
  qty integer not null check (qty > 0),
  unit_cost numeric(14, 2) not null check (unit_cost >= 0),
  unique (business_id, id),
  foreign key (business_id, purchase_id) references public.purchases(business_id, id),
  foreign key (business_id, product_id) references public.products(business_id, id)
);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  purchase_id uuid not null,
  created_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id),
  staff_member_id uuid,
  legacy_staff_name text,
  note text,
  unique (business_id, id),
  foreign key (business_id, purchase_id) references public.purchases(business_id, id),
  foreign key (business_id, staff_member_id) references public.staff_members(business_id, id)
);

create table public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  receipt_id uuid not null,
  product_id uuid not null,
  qty integer not null check (qty > 0),
  unique (business_id, id),
  foreign key (business_id, receipt_id) references public.receipts(business_id, id),
  foreign key (business_id, product_id) references public.products(business_id, id)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  product_id uuid not null,
  type public.stock_movement_type not null,
  qty integer not null check (qty <> 0),
  created_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id),
  staff_member_id uuid,
  legacy_staff_name text,
  reference_id uuid,
  reason text,
  unique (business_id, id),
  foreign key (business_id, product_id) references public.products(business_id, id),
  foreign key (business_id, staff_member_id) references public.staff_members(business_id, id)
);

create table public.stock_counts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  product_id uuid not null,
  expected integer not null check (expected >= 0),
  counted integer not null check (counted >= 0),
  diff integer generated always as (counted - expected) stored,
  reason text not null,
  created_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id),
  staff_member_id uuid,
  legacy_staff_name text,
  unique (business_id, id),
  foreign key (business_id, product_id) references public.products(business_id, id),
  foreign key (business_id, staff_member_id) references public.staff_members(business_id, id)
);

create table public.audit_entries (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  created_at timestamptz not null default now(),
  actor_user_id uuid references auth.users(id),
  staff_member_id uuid,
  legacy_staff_name text,
  action text not null,
  entity text not null,
  entity_id uuid not null,
  old_value jsonb,
  new_value jsonb,
  unique (business_id, id),
  foreign key (business_id, staff_member_id) references public.staff_members(business_id, id)
);

create index business_members_user_idx on public.business_members (user_id, status);
create index business_invitations_business_idx on public.business_invitations (business_id, expires_at);
create index staff_members_business_idx on public.staff_members (business_id);
create index customers_business_idx on public.customers (business_id);
create index suppliers_business_idx on public.suppliers (business_id);
create index products_business_category_idx on public.products (business_id, category_id);
create index sales_business_created_idx on public.sales (business_id, created_at desc);
create index sale_items_business_sale_idx on public.sale_items (business_id, sale_id);
create index sale_items_business_product_idx on public.sale_items (business_id, product_id);
create index purchases_business_created_idx on public.purchases (business_id, created_at desc);
create index purchase_items_business_purchase_idx on public.purchase_items (business_id, purchase_id);
create index receipts_business_purchase_idx on public.receipts (business_id, purchase_id, created_at desc);
create index receipt_items_business_receipt_idx on public.receipt_items (business_id, receipt_id);
create index stock_movements_business_product_idx on public.stock_movements (business_id, product_id, created_at desc);
create index stock_counts_business_product_idx on public.stock_counts (business_id, product_id, created_at desc);
create index audit_entries_business_created_idx on public.audit_entries (business_id, created_at desc);

create function public.has_business_role(
  p_business_id uuid,
  p_roles public.business_role[] default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.business_members as member
    where member.business_id = p_business_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and (p_roles is null or member.role = any (p_roles))
  );
$$;

create function public.create_business(p_name text, p_timezone text default 'Africa/Nairobi')
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_name is null or length(btrim(p_name)) not between 1 and 120 then
    raise exception 'Business name must be between 1 and 120 characters' using errcode = '22023';
  end if;
  if p_timezone is null or not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Unknown time zone' using errcode = '22023';
  end if;

  insert into public.businesses (name, timezone, created_by)
  values (btrim(p_name), p_timezone, v_user_id)
  returning id into v_business_id;

  insert into public.business_members (business_id, user_id, role)
  values (v_business_id, v_user_id, 'owner');

  return v_business_id;
end;
$$;

create function public.create_member_invitation(
  p_business_id uuid,
  p_email text,
  p_role public.business_role
)
returns table (invitation_id uuid, invitation_token text)
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(btrim(p_email));
  v_token text;
  v_invitation_id uuid;
begin
  if v_user_id is null
    or not public.has_business_role(p_business_id, array['owner', 'admin']::public.business_role[]) then
    raise exception 'Not authorized to invite members' using errcode = '42501';
  end if;
  if v_email is null or v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid email address is required' using errcode = '22023';
  end if;
  if p_role is null or p_role = 'owner' then
    raise exception 'Owner role cannot be assigned by invitation' using errcode = '22023';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.business_invitations (business_id, email, role, token_hash, invited_by, expires_at)
  values (p_business_id, v_email, p_role, extensions.digest(v_token, 'sha256'), v_user_id, now() + interval '7 days')
  returning id into v_invitation_id;

  return query select v_invitation_id, v_token;
end;
$$;

create function public.claim_member_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_invitation public.business_invitations%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_token is null or length(p_token) <> 64 then
    raise exception 'Invitation is invalid or expired' using errcode = '22023';
  end if;

  select *
    into v_invitation
    from public.business_invitations
   where token_hash = extensions.digest(p_token, 'sha256')
     and accepted_at is null
     and expires_at > now()
   for update;

  if not found or v_invitation.email <> v_email then
    raise exception 'Invitation is invalid or expired for this account' using errcode = '42501';
  end if;

  insert into public.business_members (business_id, user_id, role)
  values (v_invitation.business_id, v_user_id, v_invitation.role)
  on conflict (business_id, user_id) do nothing;
  if not found then
    raise exception 'This account is already a member of the business' using errcode = '23505';
  end if;

  update public.business_invitations
     set accepted_by = v_user_id, accepted_at = now()
   where id = v_invitation.id;

  return v_invitation.business_id;
end;
$$;

create function public.set_business_member_role(
  p_business_id uuid,
  p_user_id uuid,
  p_role public.business_role
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_actor_role public.business_role;
  v_target_role public.business_role;
begin
  select role into v_actor_role
    from public.business_members
   where business_id = p_business_id and user_id = auth.uid() and status = 'active';
  if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
    raise exception 'Not authorized to manage members' using errcode = '42501';
  end if;
  if p_role is null or p_role = 'owner' then
    raise exception 'Owner role cannot be assigned here' using errcode = '22023';
  end if;

  select role into v_target_role
    from public.business_members
   where business_id = p_business_id and user_id = p_user_id and status = 'active'
   for update;
  if not found then
    raise exception 'Active member not found' using errcode = 'P0002';
  end if;
  if v_target_role = 'owner' then
    raise exception 'Owner membership cannot be changed here' using errcode = '42501';
  end if;

  update public.business_members
     set role = p_role
   where business_id = p_business_id and user_id = p_user_id;
end;
$$;

create function public.remove_business_member(p_business_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
set row_security = off
as $$
declare
  v_actor_role public.business_role;
  v_target_role public.business_role;
begin
  select role into v_actor_role
    from public.business_members
   where business_id = p_business_id and user_id = auth.uid() and status = 'active';
  if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
    raise exception 'Not authorized to manage members' using errcode = '42501';
  end if;

  select role into v_target_role
    from public.business_members
   where business_id = p_business_id and user_id = p_user_id and status = 'active'
   for update;
  if not found then
    raise exception 'Active member not found' using errcode = 'P0002';
  end if;
  if v_target_role = 'owner' then
    raise exception 'Owner membership cannot be removed here' using errcode = '42501';
  end if;

  delete from public.business_members
   where business_id = p_business_id and user_id = p_user_id;
end;
$$;

create function public.get_business_costs(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
begin
  if not public.has_business_role(p_business_id, array['owner', 'admin', 'manager']::public.business_role[]) then
    raise exception 'Not authorized to view costs' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'products', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'cost', cost))
        from public.products where business_id = p_business_id
    ), '[]'::jsonb),
    'sale_items', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'unit_cost', unit_cost))
        from public.sale_items where business_id = p_business_id
    ), '[]'::jsonb),
    'purchase_items', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'unit_cost', unit_cost))
        from public.purchase_items where business_id = p_business_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.has_business_role(uuid, public.business_role[]) from public, anon;
revoke all on function public.create_business(text, text) from public, anon;
revoke all on function public.create_member_invitation(uuid, text, public.business_role) from public, anon;
revoke all on function public.claim_member_invitation(text) from public, anon;
revoke all on function public.set_business_member_role(uuid, uuid, public.business_role) from public, anon;
revoke all on function public.remove_business_member(uuid, uuid) from public, anon;
revoke all on function public.get_business_costs(uuid) from public, anon;
grant execute on function public.has_business_role(uuid, public.business_role[]) to authenticated;
grant execute on function public.create_business(text, text) to authenticated;
grant execute on function public.create_member_invitation(uuid, text, public.business_role) to authenticated;
grant execute on function public.claim_member_invitation(text) to authenticated;
grant execute on function public.set_business_member_role(uuid, uuid, public.business_role) to authenticated;
grant execute on function public.remove_business_member(uuid, uuid) to authenticated;
grant execute on function public.get_business_costs(uuid) to authenticated;
grant usage on type public.business_role, public.membership_status, public.stock_movement_type to authenticated;
grant usage on schema public to authenticated;

alter table public.businesses enable row level security;
alter table public.businesses force row level security;
create policy businesses_member_select on public.businesses
  for select to authenticated using (public.has_business_role(id));

alter table public.business_members enable row level security;
alter table public.business_members force row level security;
create policy business_members_scoped_select on public.business_members
  for select to authenticated
  using (user_id = auth.uid() or public.has_business_role(business_id, array['owner', 'admin']::public.business_role[]));

alter table public.business_invitations enable row level security;
alter table public.business_invitations force row level security;
create policy business_invitations_manager_select on public.business_invitations
  for select to authenticated
  using (public.has_business_role(business_id, array['owner', 'admin']::public.business_role[]));

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'staff_members', 'categories', 'customers', 'suppliers', 'products', 'sales',
    'sale_items', 'purchases', 'purchase_items', 'receipts', 'receipt_items',
    'stock_movements', 'stock_counts', 'audit_entries'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.has_business_role(business_id))',
      v_table || '_member_select', v_table
    );
  end loop;
end;
$$;

revoke all on table
  public.businesses, public.business_members, public.business_invitations,
  public.staff_members, public.categories, public.customers, public.suppliers,
  public.products, public.sales, public.sale_items, public.purchases,
  public.purchase_items, public.receipts, public.receipt_items,
  public.stock_movements, public.stock_counts, public.audit_entries
from public, anon, authenticated;

grant select on public.businesses to authenticated;
grant select (business_id, user_id, role, status, created_at) on public.business_members to authenticated;
grant select (id, business_id, email, role, invited_by, expires_at, accepted_by, accepted_at, created_at)
  on public.business_invitations to authenticated;
grant select on public.staff_members, public.categories, public.customers, public.suppliers,
  public.sales, public.purchases, public.receipts, public.stock_movements, public.stock_counts
  to authenticated;
grant select (
  id, business_id, name, sku, category_id, unit, price, min_stock, barcode,
  description, archived, created_at, updated_at
) on public.products to authenticated;
grant select (id, business_id, sale_id, product_id, qty, unit_price)
  on public.sale_items to authenticated;
grant select (id, business_id, purchase_id, product_id, qty)
  on public.purchase_items to authenticated;
grant select (id, business_id, receipt_id, product_id, qty)
  on public.receipt_items to authenticated;
grant select (
  id, business_id, created_at, actor_user_id, staff_member_id, legacy_staff_name,
  action, entity, entity_id
) on public.audit_entries to authenticated;

comment on table public.businesses is
  'Business data is tenant-scoped by business_id. Direct data writes are intentionally not granted; add validated atomic RPCs before enabling cloud workflows.';
comment on function public.create_member_invitation(uuid, text, public.business_role) is
  'Returns a one-time 256-bit invitation token. Store only its SHA-256 hash; deliver the token through a trusted channel.';
