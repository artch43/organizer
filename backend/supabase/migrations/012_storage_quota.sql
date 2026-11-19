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
