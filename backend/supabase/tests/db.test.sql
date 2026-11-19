-- Behaviour tests for the migrations: quota, rate limits, isolation between people, function
-- privileges, reminders and the Storage quota. Each check prints PASS or FAIL (see run-db-tests.sh).
\set QUIET on
\pset tuples_only on
-- Users: A (confirmed), B (unconfirmed)
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-00000000000a', 'a@x.com', now()),
  ('00000000-0000-0000-0000-00000000000b', 'b@x.com', null);

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); end $$;
create or replace function pg_temp.ok(name text, cond boolean) returns void language plpgsql as $$
begin raise notice '% %', case when cond then 'PASS' else 'FAIL' end, name; end $$;
-- 009 makes new functions closed by default, these test helpers included.
grant execute on function pg_temp.ok(text, boolean), pg_temp.as_user(text) to public;

-- ---------- usage accounting ----------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
insert into public.records (kind, id, data) select 'note', 'n' || g, jsonb_build_object('t', repeat('x', 100)) from generate_series(1, 10) g;
reset role;
select pg_temp.ok('usage after insert = sum of sizes',
  (select bytes from public.user_usage where user_id = '00000000-0000-0000-0000-00000000000a')
  = (select sum(octet_length(data::text)) from public.records where user_id = '00000000-0000-0000-0000-00000000000a')
  and (select row_count from public.user_usage where user_id = '00000000-0000-0000-0000-00000000000a') = 10);

set role authenticated;
update public.records set data = jsonb_build_object('t', repeat('y', 1000)) where id in ('n1', 'n2');
update public.records set data = jsonb_build_object('t', 'z') where id = 'n3';
-- upsert: 2 existing (update) + 3 new (insert), like the app's sync
insert into public.records (user_id, kind, id, data)
select '00000000-0000-0000-0000-00000000000a', 'note', 'n' || g, jsonb_build_object('t', repeat('w', 50)) from generate_series(9, 13) g
on conflict (user_id, kind, id) do update set data = excluded.data;
delete from public.records where id in ('n4', 'n5');
reset role;
select pg_temp.ok('usage after update/upsert/delete = recount',
  (select (bytes, row_count) from public.user_usage where user_id = '00000000-0000-0000-0000-00000000000a')
  = (select (sum(octet_length(data::text))::bigint, count(*)::int) from public.records where user_id = '00000000-0000-0000-0000-00000000000a'));

-- ---------- row size ----------
set role authenticated;
do $$ begin
  insert into public.records (kind, id, data) values ('note', 'big', jsonb_build_object('t', repeat('x', 600000)));
  perform pg_temp.ok('600 KB row refused', false);
exception when check_violation then perform pg_temp.ok('600 KB row refused (' || sqlerrm || ')', true);
end $$;

-- ---------- quota (10 MB) ----------
do $$ declare got text; begin
  -- 25 rows x 500 KB = 12.5 MB in 500 KB rows, one statement each
  for i in 1..25 loop
    insert into public.records (kind, id, data) values ('note', 'q' || i, jsonb_build_object('t', repeat('q', 500000)));
  end loop;
  perform pg_temp.ok('quota reached', false);
exception when others then got := sqlerrm;
  perform pg_temp.ok('quota refuses growth (' || got || ')', got = 'ORG_QUOTA');
end $$;
reset role;
select pg_temp.ok('refused statement left usage unchanged',
  (select bytes from public.user_usage where user_id = '00000000-0000-0000-0000-00000000000a')
  = (select sum(octet_length(data::text)) from public.records where user_id = '00000000-0000-0000-0000-00000000000a'));

-- Fill to just under the quota, then: shrinking and soft-deleting still work when over/at quota.
set role authenticated;
do $$ begin
  for i in 1..20 loop
    insert into public.records (kind, id, data) values ('note', 'f' || i, jsonb_build_object('t', repeat('f', 500000)));
  end loop;
end $$;
do $$ begin
  insert into public.records (kind, id, data) values ('note', 'f21', jsonb_build_object('t', repeat('f', 500000)));
  perform pg_temp.ok('21st 500 KB row refused (past 10 MiB)', false);
exception when others then perform pg_temp.ok('21st 500 KB row refused (past 10 MiB)', sqlerrm = 'ORG_QUOTA'); end $$;
do $$ begin
  update public.records set data = jsonb_build_object('t', 'small') where id = 'f1';
  update public.records set deleted_at = now() where id = 'f2';
  perform pg_temp.ok('shrink and soft delete allowed near quota', true);
exception when others then perform pg_temp.ok('shrink and soft delete allowed near quota (' || sqlerrm || ')', false); end $$;
delete from public.records where id like 'f%';
reset role;

-- ---------- rate limit on records: 20,000 rows / 10 min ----------
delete from public.rate_windows;
set role authenticated;
do $$ declare i int := 0; begin
  insert into public.records (kind, id, data) select 'item', 'r' || g, '{}' from generate_series(1, 500) g;
  for i in 1..60 loop
    update public.records set data = jsonb_build_object('v', i) where kind = 'item';
  end loop;
  perform pg_temp.ok('records rate limit', false);
exception when others then perform pg_temp.ok('records rate limit after ~20k rows (' || sqlerrm || ')', sqlerrm = 'ORG_RATE'); end $$;
reset role;
update public.rate_windows set win_start = now() - interval '11 minutes';
set role authenticated;
do $$ begin
  update public.records set data = '{"v":"again"}' where kind = 'item';
  perform pg_temp.ok('writes allowed again after the window', true);
exception when others then perform pg_temp.ok('writes allowed again after the window (' || sqlerrm || ')', false); end $$;
delete from public.records where kind = 'item';

-- ---------- rate limit on reminders: 2,000 / 10 min ----------
do $$ begin
  for k in 1..3 loop
    insert into public.reminders (event_id, send_at, title, when_label)
      select 'e' || g, now() + interval '1 day', 't', 'w' from generate_series(1, 900) g;
    delete from public.reminders where event_id like 'e%';
  end loop;
  perform pg_temp.ok('reminders rate limit', false);
exception when others then perform pg_temp.ok('reminders rate limit at 2,700 (' || sqlerrm || ')', sqlerrm = 'ORG_RATE'); end $$;
reset role;
delete from public.rate_windows;

-- ---------- isolation between users ----------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select pg_temp.ok('B sees none of A''s records', (select count(*) from public.records) = 0);
do $$ begin
  insert into public.records (user_id, kind, id, data) values ('00000000-0000-0000-0000-00000000000a', 'note', 'evil', '{}');
  perform pg_temp.ok('B writing as A refused', false);
exception when others then perform pg_temp.ok('B writing as A refused (' || sqlerrm || ')', true); end $$;
select pg_temp.ok('B cannot see usage/rate tables', not has_table_privilege('authenticated', 'public.user_usage', 'select')
  and not has_table_privilege('authenticated', 'public.rate_windows', 'select'));
reset role;

-- ---------- function privileges ----------
select pg_temp.ok('no public function runnable by anon/authenticated: ' || coalesce(string_agg(p.oid::regprocedure::text, ', '), 'none'),
  count(*) = 0)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
select pg_temp.ok('every security definer function has a fixed search_path: ' || coalesce(string_agg(p.oid::regprocedure::text, ', '), 'none'),
  count(*) = 0)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'private') and (p.prosecdef or p.proname = 'records_touch') and p.proconfig is null;
create function public.brand_new() returns int language sql as $$ select 1 $$;
select pg_temp.ok('new functions start closed',
  not has_function_privilege('anon', 'public.brand_new()', 'execute')
  and not has_function_privilege('authenticated', 'public.brand_new()', 'execute'));
drop function public.brand_new();
select pg_temp.ok('anexos_room not runnable by anon', not has_function_privilege('anon', 'private.anexos_room()', 'execute'));
select pg_temp.ok('every public table has RLS: ' || coalesce(string_agg(relname, ', '), 'none'), count(*) = 0)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- ---------- reminders: only confirmed e-mails, stale ones purged, global count ----------
insert into public.reminders (user_id, event_id, send_at, title, when_label) values
  ('00000000-0000-0000-0000-00000000000a', 'ok', now() - interval '1 minute', 'a', 'w'),
  ('00000000-0000-0000-0000-00000000000b', 'unconfirmed', now() - interval '1 minute', 'b', 'w'),
  ('00000000-0000-0000-0000-00000000000a', 'stale', now() - interval '2 days', 'old', 'w');
insert into public.reminders (user_id, event_id, send_at, title, when_label, sent_at) values
  ('00000000-0000-0000-0000-00000000000a', 'sent', now() - interval '1 hour', 's', 'w', now() - interval '1 hour');
select pg_temp.ok('due_reminders skips unconfirmed e-mails',
  (select array_agg(email) from public.due_reminders(100)) = array['a@x.com']);
select pg_temp.ok('global sent count', public.reminders_sent_total_today() = 1);
select public.purge_old_data();
select pg_temp.ok('purge removes stale pending reminders', not exists (select 1 from public.reminders where event_id = 'stale')
  and exists (select 1 from public.reminders where event_id = 'ok'));

-- ---------- storage quota ----------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
set role authenticated;
do $$ begin
  for i in 1..100 loop
    insert into storage.objects (bucket_id, name, metadata) values ('anexos', '00000000-0000-0000-0000-00000000000a/f' || i, '{"size": 1000}');
  end loop;
  perform pg_temp.ok('100 files allowed', true);
exception when others then perform pg_temp.ok('100 files allowed (' || sqlerrm || ')', false); end $$;
do $$ begin
  insert into storage.objects (bucket_id, name, metadata) values ('anexos', '00000000-0000-0000-0000-00000000000a/f101', '{"size": 1000}');
  perform pg_temp.ok('101st file refused', false);
exception when others then perform pg_temp.ok('101st file refused (' || sqlerrm || ')', true); end $$;
reset role;
delete from storage.objects;
set role authenticated;
do $$ begin
  insert into storage.objects (bucket_id, name, metadata) values ('anexos', '00000000-0000-0000-0000-00000000000a/a', '{"size": 14000000}');
  insert into storage.objects (bucket_id, name, metadata) values ('anexos', '00000000-0000-0000-0000-00000000000a/b', '{"size": 14000000}');
  insert into storage.objects (bucket_id, name, metadata) values ('anexos', '00000000-0000-0000-0000-00000000000a/c', '{"size": 1}');
  perform pg_temp.ok('file past 25 MB refused', false);
exception when others then perform pg_temp.ok('file past 25 MB refused (' || sqlerrm || ')', true); end $$;
do $$ begin
  insert into storage.objects (bucket_id, name, metadata) values ('anexos', '00000000-0000-0000-0000-00000000000b/x', '{"size": 1}');
  perform pg_temp.ok('upload into another person''s folder refused', false);
exception when others then perform pg_temp.ok('upload into another person''s folder refused', true); end $$;
reset role;
insert into storage.objects (bucket_id, name, metadata)
  select 'anexos', 'someone/' || g, '{"size": 10000000}' from generate_series(1, 95) g;
set role authenticated;
do $$ begin
  insert into storage.objects (bucket_id, name, metadata) values ('anexos', '00000000-0000-0000-0000-00000000000a/z', '{"size": 1}');
  perform pg_temp.ok('bucket over 900 MB refuses new files', false);
exception when others then perform pg_temp.ok('bucket over 900 MB refuses new files', true); end $$;
reset role;

-- ---------- account deletion ----------
do $$ begin
  delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
  perform pg_temp.ok('deleting an account cascades cleanly', not exists (select 1 from public.user_usage where user_id = '00000000-0000-0000-0000-00000000000a')
    and not exists (select 1 from public.records where user_id = '00000000-0000-0000-0000-00000000000a'));
exception when others then perform pg_temp.ok('deleting an account cascades cleanly (' || sqlerrm || ')', false); end $$;
