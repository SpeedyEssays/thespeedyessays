-- Keep wallet balances, referral attribution, and order request history private.
alter table public.orders
  add column refunded_cents integer not null default 0,
  add constraint orders_refund_valid check (refunded_cents between 0 and price_cents);

alter table public.customer_notifications
  drop constraint customer_notifications_kind_valid,
  add constraint customer_notifications_kind_valid
    check (kind in ('notice', 'offer', 'payment-reminder', 'price-offer', 'wallet-credit'));

create table public.wallet_accounts (
  user_id text primary key,
  referral_code uuid not null unique default gen_random_uuid(),
  referred_by text references public.wallet_accounts(user_id) on delete set null,
  balance_cents integer not null default 0 constraint wallet_balance_nonnegative check (balance_cents >= 0),
  created_at timestamptz not null default now(),
  constraint wallet_no_self_referral check (user_id <> referred_by)
);
create index wallet_accounts_referred_by_idx on public.wallet_accounts (referred_by);

create table public.wallet_entries (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  user_id text not null references public.wallet_accounts(user_id),
  kind text not null,
  amount_cents integer not null,
  description text not null,
  created_by text,
  created_at timestamptz not null default now(),
  constraint wallet_entries_sign_valid check (
    (kind = 'order-payment' and amount_cents < 0) or
    (kind in ('referral-reward', 'staff-reward', 'top-up', 'order-refund') and amount_cents > 0)
  )
);
create index wallet_entries_user_created_idx on public.wallet_entries (user_id, created_at desc, id);

create table public.wallet_top_ups (
  reference text primary key,
  user_id text not null references public.wallet_accounts(user_id),
  amount_cents integer not null constraint wallet_top_ups_positive check (amount_cents > 0),
  payment_url text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index wallet_top_ups_user_pending_idx on public.wallet_top_ups (user_id, created_at desc)
  where paid_at is null;

create table public.order_requests (
  id uuid primary key,
  order_id integer not null references public.orders(id) on delete cascade,
  kind text not null constraint order_requests_kind_valid check (kind in ('cancellation', 'refund')),
  status text not null default 'pending'
    constraint order_requests_status_valid check (status in ('pending', 'approved', 'declined')),
  reason text not null,
  staff_note text,
  reviewed_by text,
  amount_cents integer,
  provider_refund_id text unique,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint order_requests_amount_valid check (
    case when kind = 'refund' and status = 'approved'
      then amount_cents is not null and amount_cents > 0 else amount_cents is null end
  )
);
create index order_requests_order_created_idx on public.order_requests (order_id, created_at desc);
create index order_requests_status_created_idx on public.order_requests (status, created_at desc);
create unique index order_requests_one_pending on public.order_requests (order_id, kind) where status = 'pending';

alter table public.wallet_accounts enable row level security;
alter table public.wallet_entries enable row level security;
alter table public.wallet_top_ups enable row level security;
alter table public.order_requests enable row level security;

revoke all on public.wallet_accounts, public.wallet_entries, public.wallet_top_ups, public.order_requests from public;
do $$
declare
  api_role text;
begin
  for api_role in select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role')
  loop
    execute format(
      'revoke all on public.wallet_accounts, public.wallet_entries, public.wallet_top_ups, public.order_requests from %I',
      api_role
    );
  end loop;
end;
$$;
