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
