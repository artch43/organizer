-- Organizer: full database setup in one go (same as running migrations 001 to 012 in order).
-- Safe to run more than once.

-- Re-running: lets migration 002 recreate this function (006, 007 and 009 redefine it after).
drop function if exists public.due_reminders(int);


-- ===== 001_init.sql =====
-- Organizer: one table holds every piece of a person's workspace.
-- Each row is one entity (a page, a database, an item, a note, ...), stored as JSON.
-- Row Level Security makes sure each person only ever sees their own rows.

create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('page', 'db', 'item', 'doc', 'note', 'habit', 'habitlog', 'settings')),
  id         text        not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, kind, id)
);

create index if not exists records_user_updated_idx on public.records (user_id, updated_at);
create index if not exists records_user_deleted_idx on public.records (user_id, deleted_at) where deleted_at is not null;

-- The server clock decides "updated_at", so devices with wrong clocks can't break syncing.
create or replace function public.records_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists records_touch on public.records;
create trigger records_touch before insert or update on public.records
  for each row execute function public.records_touch();

alter table public.records enable row level security;

drop policy if exists "records: read own" on public.records;
drop policy if exists "records: insert own" on public.records;
drop policy if exists "records: update own" on public.records;
drop policy if exists "records: delete own" on public.records;

create policy "records: read own"   on public.records for select using (auth.uid() = user_id);
create policy "records: insert own" on public.records for insert with check (auth.uid() = user_id);
create policy "records: update own" on public.records for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "records: delete own" on public.records for delete using (auth.uid() = user_id);

-- ===== 002_events_reminders.sql =====
-- Organizer, version 2: calendar events, to-dos and e-mail reminders.

-- 1. Allow the new kinds of rows.
alter table public.records drop constraint if exists records_kind_check;
alter table public.records add constraint records_kind_check
  check (kind in ('page', 'db', 'item', 'doc', 'event', 'todo', 'note', 'habit', 'habitlog', 'settings'));

-- 2. One row per e-mail that still has to go out. The app writes them when an event is saved.
create table if not exists public.reminders (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  event_id   text        not null,
  send_at    timestamptz not null,
  title      text        not null,
  when_label text        not null,
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists reminders_due_idx on public.reminders (send_at) where sent_at is null;
create index if not exists reminders_event_idx on public.reminders (user_id, event_id);

alter table public.reminders enable row level security;
drop policy if exists "reminders: read own" on public.reminders;
drop policy if exists "reminders: insert own" on public.reminders;
drop policy if exists "reminders: delete own" on public.reminders;
create policy "reminders: read own"   on public.reminders for select using (auth.uid() = user_id);
create policy "reminders: insert own" on public.reminders for insert with check (auth.uid() = user_id);
create policy "reminders: delete own" on public.reminders for delete using (auth.uid() = user_id);

-- 3. Used only by the send-reminders function (service role): due reminders with the person's e-mail.
create or replace function public.due_reminders(max_rows int default 100)
returns table (id uuid, email text, title text, when_label text, send_at timestamptz)
language sql security definer set search_path = public, auth as $$
  select r.id, u.email::text, r.title, r.when_label, r.send_at
  from public.reminders r
  join auth.users u on u.id = r.user_id
  where r.sent_at is null and r.send_at <= now() and r.send_at > now() - interval '6 hours'
  order by r.send_at
  limit max_rows
$$;
revoke all on function public.due_reminders(int) from public, anon, authenticated;
grant execute on function public.due_reminders(int) to service_role;

-- ===== 003_grants.sql =====
-- Organizer, version 3: explicit access for signed-in people.
-- Newer Supabase projects no longer grant table access to the API roles automatically,
-- which shows up in the app as "permission denied for table records".
-- Row Level Security (001 and 002) still limits everyone to their own rows.

grant usage on schema public to anon, authenticated;

revoke all on table public.records from anon;
grant select, insert, update, delete on table public.records to authenticated;

revoke all on table public.reminders from anon;
grant select, insert, delete on table public.reminders to authenticated;

grant select, insert, update, delete on table public.records, public.reminders to service_role;

-- ===== 004_reminder_errors.sql =====
-- Organizer, version 4: remember why a reminder could not be sent,
-- so a permanent refusal (e.g. an address the e-mail service rejects) is not retried every minute.
alter table public.reminders add column if not exists last_error text;

-- ===== 005_attachments.sql =====
-- Images and PDFs attached to notes. Each person's files live under a folder named after their user id,
-- in a private bucket: nobody else can list, read or delete them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anexos', 'anexos', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "anexos: read own" on storage.objects;
drop policy if exists "anexos: insert own" on storage.objects;
drop policy if exists "anexos: delete own" on storage.objects;

create policy "anexos: read own" on storage.objects for select to authenticated
  using (bucket_id = 'anexos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "anexos: insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "anexos: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'anexos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ===== 006_whatsapp.sql =====
-- Organizer, version 6: each reminder goes out by e-mail or by WhatsApp, as chosen on the event or task.
alter table public.reminders add column if not exists channel text not null default 'email';
alter table public.reminders drop constraint if exists reminders_channel_check;
alter table public.reminders add constraint reminders_channel_check check (channel in ('email', 'whatsapp'));
-- The number to send to (only for WhatsApp), in international format, e.g. +5511987654321.
alter table public.reminders add column if not exists phone text;

-- The send-reminders function now also needs the channel and the number.
drop function if exists public.due_reminders(int);
create function public.due_reminders(max_rows int default 100)
returns table (id uuid, email text, title text, when_label text, send_at timestamptz, channel text, phone text)
language sql security definer set search_path = public, auth as $$
  select r.id, u.email::text, r.title, r.when_label, r.send_at, r.channel, r.phone
  from public.reminders r
  join auth.users u on u.id = r.user_id
  where r.sent_at is null and r.send_at <= now() and r.send_at > now() - interval '6 hours'
  order by r.send_at
  limit max_rows
$$;
revoke all on function public.due_reminders(int) from public, anon, authenticated;
grant execute on function public.due_reminders(int) to service_role;

-- ===== 007_limits.sql =====
-- Organizer, version 7: limits that keep one account from abusing the reminder service.

-- 1. Sane values only. The app never writes anything outside these limits.
alter table public.reminders drop constraint if exists reminders_title_len;
alter table public.reminders add constraint reminders_title_len check (char_length(title) <= 300 and char_length(when_label) <= 200) not valid;
alter table public.reminders drop constraint if exists reminders_phone_format;
alter table public.reminders add constraint reminders_phone_format check (phone is null or phone ~ '^\+[0-9]{10,15}$') not valid;

-- 2. At most 1000 pending reminders per person (a busy calendar uses a few dozen).
create or replace function public.reminders_cap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.reminders where user_id = new.user_id and sent_at is null) >= 1000 then
    raise exception 'Too many pending reminders' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists reminders_cap on public.reminders;
create trigger reminders_cap before insert on public.reminders for each row execute function public.reminders_cap();

-- 3. The send function also gets the user id, to apply its daily limits per person.
drop function if exists public.due_reminders(int);
create function public.due_reminders(max_rows int default 100)
returns table (id uuid, user_id uuid, email text, title text, when_label text, send_at timestamptz, channel text, phone text)
language sql security definer set search_path = public, auth as $$
  select r.id, r.user_id, u.email::text, r.title, r.when_label, r.send_at, r.channel, r.phone
  from public.reminders r
  join auth.users u on u.id = r.user_id
  where r.sent_at is null and r.send_at <= now() and r.send_at > now() - interval '6 hours'
  order by r.send_at
  limit max_rows
$$;
revoke all on function public.due_reminders(int) from public, anon, authenticated;
grant execute on function public.due_reminders(int) to service_role;

-- What each person was sent in the last 24 hours (successful sends only), per channel and number.
create or replace function public.reminders_sent_today(ids uuid[])
returns table (user_id uuid, channel text, phone text, sent bigint)
language sql security definer set search_path = public as $$
  select r.user_id, r.channel, r.phone, count(*)
  from public.reminders r
  where r.user_id = any(ids) and r.sent_at > now() - interval '24 hours' and r.last_error is null
  group by r.user_id, r.channel, r.phone
$$;
revoke all on function public.reminders_sent_today(uuid[]) from public, anon, authenticated;
grant execute on function public.reminders_sent_today(uuid[]) to service_role;

-- 4. Attachments: pictures and PDF only (SVG can carry scripts).
update storage.buckets
  set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif', 'application/pdf']
  where id = 'anexos';

-- ===== 008_privacy.sql =====
-- Organizer, version 8: data kept only as long as needed, and limits on what one account can store.

-- 1. One row can't be huge, and one person can't fill the database (a busy account has a few thousand rows).
alter table public.records drop constraint if exists records_data_size;
alter table public.records add constraint records_data_size check (octet_length(data::text) <= 1048576) not valid;

-- Checked once per statement (an app upload sends up to 500 rows at a time), counting each person
-- in that batch once, instead of counting all their rows again for every single row.
create or replace function public.records_cap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from (select distinct user_id from added) a
    where (select count(*) from public.records r where r.user_id = a.user_id) > 50000
  ) then
    raise exception 'Too many records' using errcode = 'check_violation';
  end if;
  return null;
end $$;
drop trigger if exists records_cap on public.records;
create trigger records_cap after insert on public.records
  referencing new table as added for each statement execute function public.records_cap();

-- 2. A WhatsApp reminder only goes to the number saved in the person's own settings, never to a
--    number written straight into a reminder.
create or replace function public.reminders_phone_own() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.channel = 'whatsapp' and new.phone is distinct from (
    select r.data ->> 'whatsapp' from public.records r
    where r.user_id = new.user_id and r.kind = 'settings' and r.id = 'main' and r.deleted_at is null
  ) then
    raise exception 'WhatsApp number does not match the account settings' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists reminders_phone_own on public.reminders;
create trigger reminders_phone_own before insert on public.reminders for each row execute function public.reminders_phone_own();

-- 3. Every day: what was deleted more than 30 days ago leaves the trash for good, and reminders
--    already sent (or given up on) more than 30 days ago are erased. Until now this only happened
--    when the person opened the app, so the deleted data of someone who never came back stayed forever.
create extension if not exists pg_cron;

create or replace function public.purge_old_data() returns void
language sql security definer set search_path = public as $$
  delete from public.records where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from public.reminders where sent_at is not null and sent_at < now() - interval '30 days';
$$;
revoke all on function public.purge_old_data() from public, anon, authenticated;

select cron.unschedule('purge-old-data') where exists (select 1 from cron.job where jobname = 'purge-old-data');
select cron.schedule('purge-old-data', '17 3 * * *', $$ select public.purge_old_data() $$);

-- ===== 009_hardening.sql =====
-- Organizer, version 9: closing small gaps found in a security review.
-- All or nothing: if any step fails, none of this version is applied.
begin;

-- 1. Every function gets a fixed search_path (the Security Advisor flags records_touch without one):
--    otherwise a function could pick up a same-named object from another schema.
alter function public.records_touch() set search_path = '';

-- 2. Trigger functions only ever run as triggers; nobody needs to call them directly.
revoke all on function public.records_touch() from public, anon, authenticated;
revoke all on function public.reminders_cap() from public, anon, authenticated;
revoke all on function public.reminders_phone_own() from public, anon, authenticated;

-- 3. New functions start closed. Supabase lets the API roles run every new function in `public`
--    by default, so forgetting a "revoke" after a "create function" would expose it as an RPC.
--    (Postgres also lets PUBLIC run new functions; that default is only removable globally.)
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;

-- 4. Reminders only go to confirmed e-mail addresses. Without this, someone could sign up with
--    another person's address and use reminders to send them messages in the Organizer's name.
create or replace function public.due_reminders(max_rows int default 100)
returns table (id uuid, user_id uuid, email text, title text, when_label text, send_at timestamptz, channel text, phone text)
language sql security definer set search_path = public, auth as $$
  select r.id, r.user_id, u.email::text, r.title, r.when_label, r.send_at, r.channel, r.phone
  from public.reminders r
  join auth.users u on u.id = r.user_id
  where r.sent_at is null and r.send_at <= now() and r.send_at > now() - interval '6 hours'
    and u.email_confirmed_at is not null
  order by r.send_at
  limit max_rows
$$;
revoke all on function public.due_reminders(int) from public, anon, authenticated;
grant execute on function public.due_reminders(int) to service_role;

-- 5. How many e-mails went out in the last 24 hours, counting everyone: the send function stops
--    below the e-mail provider's daily limit and leaves the rest pending instead of failing them.
create index if not exists reminders_sent_idx on public.reminders (sent_at) where sent_at is not null;

create or replace function public.reminders_sent_total_today()
returns bigint
language sql stable security definer set search_path = public as $$
  select count(*) from public.reminders
  where sent_at > now() - interval '24 hours' and last_error is null
$$;
revoke all on function public.reminders_sent_total_today() from public, anon, authenticated;
grant execute on function public.reminders_sent_total_today() to service_role;

-- 6. The daily clean-up also removes reminders that were never sent and are now too late to send
--    (the send function skips anything more than 6 hours overdue). They used to stay forever and
--    count towards the limit of 1000 pending reminders per person.
create or replace function public.purge_old_data() returns void
language sql security definer set search_path = public as $$
  delete from public.records where deleted_at is not null and deleted_at < now() - interval '30 days';
  delete from public.reminders where sent_at is not null and sent_at < now() - interval '30 days';
  delete from public.reminders where sent_at is null and send_at < now() - interval '1 day';
$$;
revoke all on function public.purge_old_data() from public, anon, authenticated;

commit;

-- ===== 010_usage_quota.sql =====
-- Organizer, version 10: a storage quota per account, in bytes.
-- Before this, one account could store 50,000 rows of up to 1 MB each (about 50 GB), far more than
-- the whole database. Now each person has up to 10 MB and 20,000 rows, and one row up to 512 KB.
-- All or nothing: if any step fails, none of this version is applied.
begin;

-- 1. Smaller rows. A 512 KB note is around 80,000 words; pictures live in Storage, not here.
--    "not valid": rows that are already bigger stay as they are until they are edited.
alter table public.records drop constraint if exists records_data_size;
alter table public.records add constraint records_data_size check (octet_length(data::text) <= 524288) not valid;

-- 2. How much each person stores, kept up to date by triggers instead of summing the whole table on
--    every write. Only the triggers write here: no policy and no grants for the API roles.
create table if not exists public.user_usage (
  user_id   uuid   primary key references auth.users (id) on delete cascade,
  bytes     bigint not null default 0,
  row_count int    not null default 0
);
alter table public.user_usage enable row level security;
revoke all on table public.user_usage from public, anon, authenticated;

-- Runs once per statement (the app sends up to 500 rows at a time), using the rows the statement
-- changed ("transition tables"). Sizes are measured as octet_length(data::text), the same measure
-- the row size limit uses, so adding and later removing a row always cancel out exactly.
-- Exceeding the quota raises ORG_QUOTA, which undoes the whole statement, counters included.
-- Only growth is refused: shrinking or deleting always works, even for an account over its quota.
create or replace function public.records_usage() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  max_bytes constant bigint := 10 * 1024 * 1024;
  max_rows  constant int    := 20000;
  v_ids   uuid[];
  v_bytes bigint[];
  v_rows  int[];
  over boolean;
begin
  if tg_op = 'DELETE' then
    -- Only an update: when a whole account is deleted, its usage row may already be gone.
    update public.user_usage u
       set bytes = greatest(0, u.bytes - d.bytes), row_count = greatest(0, u.row_count - d.n)
      from (select user_id, sum(octet_length(data::text))::bigint as bytes, count(*)::int as n
              from old_rows group by user_id) d
     where u.user_id = d.user_id;
    return null;
  end if;

  -- What changed per person in this statement: new rows add their size and count;
  -- an updated row adds its new size and subtracts its old one.
  if tg_op = 'INSERT' then
    select array_agg(user_id), array_agg(b), array_agg(n) into v_ids, v_bytes, v_rows
    from (select user_id, sum(octet_length(data::text))::bigint as b, count(*)::int as n
            from new_rows group by user_id) x;
  else
    select array_agg(user_id), array_agg(b), array_agg(0) into v_ids, v_bytes, v_rows
    from (select user_id, sum(s)::bigint as b
            from (select user_id, octet_length(data::text) as s from new_rows
                  union all
                  select user_id, -octet_length(data::text) from old_rows) y
           group by user_id) x;
  end if;
  if v_ids is null then
    return null;
  end if;

  with delta as (
    select * from unnest(v_ids, v_bytes, v_rows) as d (user_id, bytes, n)
  ), saved as (
    insert into public.user_usage as u (user_id, bytes, row_count)
    select user_id, greatest(0, bytes), n from delta
    on conflict (user_id) do update
      set bytes     = greatest(0, u.bytes + (select d.bytes from delta d where d.user_id = excluded.user_id)),
          row_count = u.row_count + excluded.row_count
    returning u.user_id, u.bytes, u.row_count
  )
  select exists (
    select 1 from saved s join delta d using (user_id)
    where (d.bytes > 0 and s.bytes > max_bytes) or (d.n > 0 and s.row_count > max_rows)
  ) into over;

  if over then
    raise exception 'ORG_QUOTA'
      using errcode = 'P0001', detail = 'This account has reached its storage limit.';
  end if;
  return null;
end $$;
revoke all on function public.records_usage() from public, anon, authenticated;

drop trigger if exists records_usage_ins on public.records;
drop trigger if exists records_usage_upd on public.records;
drop trigger if exists records_usage_del on public.records;
create trigger records_usage_ins after insert on public.records
  referencing new table as new_rows for each statement execute function public.records_usage();
create trigger records_usage_upd after update on public.records
  referencing old table as old_rows new table as new_rows for each statement execute function public.records_usage();
create trigger records_usage_del after delete on public.records
  referencing old table as old_rows for each statement execute function public.records_usage();

-- 3. The row count check from migration 008 is now part of records_usage (and no longer counts
--    all of a person's rows on every upload).
drop trigger if exists records_cap on public.records;
drop function if exists public.records_cap();

-- 4. Start from what is already stored. The lock keeps the numbers right if someone is saving
--    while this runs (it lasts only until the end of this script).
lock table public.records in share row exclusive mode;
insert into public.user_usage (user_id, bytes, row_count)
select user_id, sum(octet_length(data::text)), count(*) from public.records group by user_id
on conflict (user_id) do update set bytes = excluded.bytes, row_count = excluded.row_count;

commit;

-- ===== 011_rate_limit.sql =====
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

-- ===== 012_storage_quota.sql =====
-- Organizer, version 12: a quota for attached files (and wallpapers), checked by the server.
-- Each person can keep up to 100 files and 25 MB; and the bucket as a whole stops taking new files
-- at 900 MB, below the 1 GB of the free plan, so one person can't fill it for everyone.
--
-- The check looks at the files already stored: when Storage checks a new upload, its size isn't
-- known yet. So an account can end up one file (at most 10 MB) over the limit, never more.
-- All or nothing: if any step fails, none of this version is applied.
begin;

-- 1. A schema the API doesn't expose: functions here can be used by policies but can't be called
--    as RPCs (only the schemas listed in the API settings, normally "public", are reachable).
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- Whether the signed-in person can add another file. "security definer" lets it add up the
-- whole bucket, which the person's own policies wouldn't let them see.
create or replace function private.anexos_room() returns boolean
language sql stable security definer set search_path = '' as $$
  select
    (select count(*) < 100 and coalesce(sum((o.metadata ->> 'size')::bigint), 0) < 25 * 1024 * 1024
       from storage.objects o
      where o.bucket_id = 'anexos' and (storage.foldername(o.name))[1] = auth.uid()::text)
    and
    (select coalesce(sum((o.metadata ->> 'size')::bigint), 0) < 900 * 1024 * 1024
       from storage.objects o
      where o.bucket_id = 'anexos')
$$;
revoke all on function private.anexos_room() from public, anon;
grant execute on function private.anexos_room() to authenticated;

-- 2. Uploading needs the person's own folder (as before) and room left.
drop policy if exists "anexos: insert own" on storage.objects;
create policy "anexos: insert own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'anexos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and private.anexos_room()
  );

commit;
