alter table public.orders
  add column language text,
  add column software text,
  add column software_details text,
  add column software_fee_cents integer not null default 0,
  add column approved_at timestamptz,
  add constraint orders_software_fee_valid check (software_fee_cents >= 0);

-- Customers who approved an order before this migration can also leave feedback.
update public.orders set approved_at = updated_at where status = 'approved';

create table public.order_feedback (
  order_id integer primary key references public.orders(id) on delete cascade,
  rating integer not null constraint order_feedback_rating_valid check (rating between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index order_feedback_updated_idx on public.order_feedback (updated_at desc, order_id desc);
alter table public.order_feedback enable row level security;

create table public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  order_id integer references public.orders(id) on delete set null,
  kind text not null constraint customer_notifications_kind_valid check (kind in ('notice', 'offer')),
  title text not null,
  body text not null,
  sender_name text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index customer_notifications_user_sent_idx
  on public.customer_notifications (user_id, created_at desc, id desc);
create index customer_notifications_unread_idx
  on public.customer_notifications (user_id) where read_at is null;
create index customer_notifications_order_idx on public.customer_notifications (order_id);
alter table public.customer_notifications enable row level security;

revoke all on public.order_feedback, public.customer_notifications from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.order_feedback, public.customer_notifications from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.order_feedback, public.customer_notifications from authenticated;
  end if;
end;
$$;
