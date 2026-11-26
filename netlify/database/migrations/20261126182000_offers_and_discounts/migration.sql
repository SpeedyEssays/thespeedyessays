alter table public.orders add column price_adjustment jsonb;

alter table public.customer_notifications
  add column broadcast_id uuid,
  drop constraint customer_notifications_kind_valid,
  add constraint customer_notifications_kind_valid
    check (kind in ('notice', 'offer', 'payment-reminder', 'price-offer'));

create index customer_notifications_broadcast_idx
  on public.customer_notifications (broadcast_id) where broadcast_id is not null;

create table public.discount_codes (
  code text primary key constraint discount_codes_format_valid check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
  percent integer not null constraint discount_codes_percent_valid check (percent between 1 and 99),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.discount_codes enable row level security;
revoke all on public.discount_codes from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.discount_codes from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.discount_codes from authenticated;
  end if;
end;
$$;
