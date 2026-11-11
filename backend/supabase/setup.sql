-- Organizer: full database setup in one go (same as running migrations 001 to 008 in order).
-- Safe to run more than once.


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

create or replace function public.records_cap() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.records where user_id = new.user_id) >= 50000 then
    raise exception 'Too many records' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists records_cap on public.records;
create trigger records_cap before insert on public.records for each row execute function public.records_cap();

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
