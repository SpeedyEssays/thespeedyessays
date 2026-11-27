-- Run after the application's migrations in a new Supabase project.
-- Database access goes through the application server, which checks ownership
-- and staff permissions. The public Supabase API must not expose these tables.
begin;

alter table public.orders enable row level security;
alter table public.order_files enable row level security;
alter table public.order_messages enable row level security;
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.customer_presence enable row level security;
alter table public.staff_presence enable row level security;
alter table public.staff_avatars enable row level security;
alter table public.order_feedback enable row level security;
alter table public.customer_notifications enable row level security;
alter table public.discount_codes enable row level security;
alter table public.wallet_accounts enable row level security;
alter table public.wallet_entries enable row level security;
alter table public.wallet_top_ups enable row level security;
alter table public.order_requests enable row level security;
alter table public.order_tips enable row level security;

revoke all on public.orders, public.order_files, public.order_messages,
  public.chat_conversations, public.chat_messages, public.customer_presence,
  public.staff_presence, public.staff_avatars, public.order_feedback, public.customer_notifications,
  public.discount_codes
  from public, anon, authenticated;

revoke all on sequence public.orders_id_seq, public.order_files_id_seq,
  public.order_messages_id_seq, public.chat_messages_id_seq from public, anon, authenticated;

revoke all on public.wallet_accounts, public.wallet_entries, public.wallet_top_ups,
  public.order_requests, public.order_tips
  from public, anon, authenticated, service_role;

commit;
