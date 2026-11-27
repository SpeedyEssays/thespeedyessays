alter table public.chat_messages add column support_user_id text;
alter table public.order_messages add column support_user_id text;

create table public.staff_avatars (
  user_id text primary key,
  id uuid not null unique,
  jpeg bytea not null,
  constraint staff_avatars_size_valid check (octet_length(jpeg) between 5 and 262144)
);

alter table public.staff_avatars enable row level security;
revoke all on public.staff_avatars from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.staff_avatars from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.staff_avatars from authenticated;
  end if;
end;
$$;
