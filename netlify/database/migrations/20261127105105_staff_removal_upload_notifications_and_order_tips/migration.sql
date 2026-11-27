alter table public.orders add column files_revision integer not null default 0;

alter table public.order_files
  add column removed_at timestamptz,
  add column removed_by text;

alter table public.order_messages
  add column removed_at timestamptz,
  add column removed_by text,
  add column file_uploaded boolean not null default false;

alter table public.chat_messages
  add column removed_at timestamptz,
  add column removed_by text;

create table public.order_tips (
  order_id integer primary key references public.orders(id) on delete cascade,
  amount_cents integer not null,
  method text not null,
  reference text unique,
  payment_url text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  constraint order_tips_positive check (amount_cents > 0),
  constraint order_tips_payment_valid check (
    (method = 'wallet' and reference is null and paid_at is not null and payment_url is null) or
    (method = 'online' and reference is not null)
  )
);

alter table public.wallet_entries drop constraint wallet_entries_sign_valid;
alter table public.wallet_entries add constraint wallet_entries_sign_valid check (
  (kind in ('order-payment', 'order-tip') and amount_cents < 0) or
  (kind in ('referral-reward', 'staff-reward', 'top-up', 'order-refund') and amount_cents > 0)
);

alter table public.order_tips enable row level security;
revoke all on public.order_tips from public;
do $$
declare
  api_role text;
begin
  for api_role in select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role')
  loop
    execute format('revoke all on public.order_tips from %I', api_role);
  end loop;
end;
$$;
