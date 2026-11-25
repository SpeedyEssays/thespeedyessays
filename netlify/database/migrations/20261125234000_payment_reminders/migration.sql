alter table public.customer_notifications
  drop constraint customer_notifications_kind_valid,
  add constraint customer_notifications_kind_valid
    check (kind in ('notice', 'offer', 'payment-reminder'));
