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
