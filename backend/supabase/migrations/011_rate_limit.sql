-- Organizer, version 11: a speed limit on writes, per person.
-- The anon key is public, so anyone can call the database API directly, without the app. The quota
-- (010) caps how much an account stores, but not how often it rewrites it: a script could rewrite
-- the same rows nonstop. These limits sit far above real use (the app sends a few rows at a time,
-- and at most 500 per request) and only refuse sustained bursts.
-- All or nothing: if any step fails, none of this version is applied.
begin;

-- 1. One counter per person and kind of write, over a 10-minute window. Only the triggers write here.
create table if not exists public.rate_windows (
  user_id   uuid        not null references auth.users (id) on delete cascade,
  scope     text        not null,
  win_start timestamptz not null,
  n         int         not null,
  bytes     bigint      not null,
  primary key (user_id, scope)
);
alter table public.rate_windows enable row level security;
revoke all on table public.rate_windows from public, anon, authenticated;

-- Adds to the current window (or starts a new one) and refuses when it goes over.
-- A refused statement is rolled back with its increment, so refused attempts don't count.
create or replace function public.rate_hit(p_user uuid, p_scope text, p_n int, p_bytes bigint, p_max_n int, p_max_bytes bigint)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  w public.rate_windows;
begin
  insert into public.rate_windows as r (user_id, scope, win_start, n, bytes)
  values (p_user, p_scope, now(), p_n, p_bytes)
  on conflict (user_id, scope) do update set
    win_start = case when r.win_start <= now() - interval '10 minutes' then now() else r.win_start end,
    n         = case when r.win_start <= now() - interval '10 minutes' then excluded.n else r.n + excluded.n end,
    bytes     = case when r.win_start <= now() - interval '10 minutes' then excluded.bytes else r.bytes + excluded.bytes end
  returning * into w;
  if w.n > p_max_n or w.bytes > p_max_bytes then
    raise exception 'ORG_RATE'
      using errcode = 'P0001', detail = 'Too many changes in a short time. Try again in a few minutes.';
  end if;
end $$;
revoke all on function public.rate_hit(uuid, text, int, bigint, int, bigint) from public, anon, authenticated;

-- 2. records: up to 20,000 rows and 20 MB written per 10 minutes (twice the account quota, so even
--    moving a full account from the browser to the cloud fits). Deletes are never limited.
create or replace function public.records_rate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in select user_id, count(*)::int as n, sum(octet_length(data::text))::bigint as b from new_rows group by user_id loop
    perform public.rate_hit(r.user_id, 'records', r.n, r.b, 20000, 20 * 1024 * 1024);
  end loop;
  return null;
end $$;
revoke all on function public.records_rate() from public, anon, authenticated;

drop trigger if exists records_rate_ins on public.records;
drop trigger if exists records_rate_upd on public.records;
create trigger records_rate_ins after insert on public.records
  referencing new table as new_rows for each statement execute function public.records_rate();
create trigger records_rate_upd after update on public.records
  referencing new table as new_rows for each statement execute function public.records_rate();

-- 3. reminders: up to 2,000 new reminders per 10 minutes (a person can't have more than 1,000
--    pending, and the app rewrites them all at most once when it starts).
create or replace function public.reminders_rate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in select user_id, count(*)::int as n from new_rows group by user_id loop
    perform public.rate_hit(r.user_id, 'reminders', r.n, 0, 2000, 0);
  end loop;
  return null;
end $$;
revoke all on function public.reminders_rate() from public, anon, authenticated;

drop trigger if exists reminders_rate_ins on public.reminders;
create trigger reminders_rate_ins after insert on public.reminders
  referencing new table as new_rows for each statement execute function public.reminders_rate();

commit;
