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

revoke all on public.orders, public.order_files, public.order_messages,
  public.chat_conversations, public.chat_messages, public.customer_presence,
  public.staff_presence from public, anon, authenticated;

revoke all on sequence public.orders_id_seq, public.order_files_id_seq,
  public.order_messages_id_seq, public.chat_messages_id_seq from public, anon, authenticated;

commit;
