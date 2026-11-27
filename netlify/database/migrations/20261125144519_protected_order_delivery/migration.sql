alter table public.orders
  add column delivery_version integer not null default 0;

alter table public.order_files
  add column preview_blob_key text,
  add column delivered_at timestamptz,
  add column released_at timestamptz,
  add constraint order_files_release_after_delivery
    check (released_at is null or delivered_at is not null);

-- Preserve the delivery and release of files customers had already approved.
update public.order_files as f
set delivered_at = o.delivered_at,
    released_at = case
      when o.status = 'approved' then coalesce(o.approved_at, o.updated_at)
      when f.created_at <= o.approved_at then o.approved_at
    end
from public.orders as o
where o.id = f.order_id
  and o.delivered_at is not null
  and f.kind in ('final', 'soft-copy');

alter table public.order_feedback
  drop constraint order_feedback_rating_valid,
  add constraint order_feedback_rating_valid check (rating between 0 and 5);
