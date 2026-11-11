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
