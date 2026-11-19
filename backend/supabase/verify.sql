-- Organizer: checks that the database matches this repository (migrations 001 to 012).
-- Read-only: paste into the SQL Editor of the project and run. Every row should say ✅.
-- A ❌ says what is missing; usually, running setup.sql again fixes it (it is safe to re-run).

with checks (area, item, ok) as (
  values
  -- Tables, and Row Level Security on every table the API can reach
  ('tabelas', 'records existe', to_regclass('public.records') is not null),
  ('tabelas', 'reminders existe', to_regclass('public.reminders') is not null),
  ('tabelas', 'user_usage existe (010)', to_regclass('public.user_usage') is not null),
  ('tabelas', 'rate_windows existe (011)', to_regclass('public.rate_windows') is not null),
  ('tabelas', 'RLS ligada em todas as tabelas de public', not exists (
     select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity)),

  -- Columns and constraints
  ('colunas', 'reminders.last_error (004)', exists (select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'reminders' and column_name = 'last_error')),
  ('colunas', 'reminders.channel e phone (006)', (select count(*) = 2 from information_schema.columns
     where table_schema = 'public' and table_name = 'reminders' and column_name in ('channel', 'phone'))),
  ('regras', 'records_kind_check com event/todo (002)', exists (select 1 from pg_constraint
     where conname = 'records_kind_check' and pg_get_constraintdef(oid) like '%event%')),
  ('regras', 'reminders_channel_check (006)', exists (select 1 from pg_constraint where conname = 'reminders_channel_check')),
  ('regras', 'reminders_title_len (007)', exists (select 1 from pg_constraint where conname = 'reminders_title_len')),
  ('regras', 'reminders_phone_format (007)', exists (select 1 from pg_constraint where conname = 'reminders_phone_format')),
  ('regras', 'records_data_size = 512 KB (010)', exists (select 1 from pg_constraint
     where conname = 'records_data_size' and pg_get_constraintdef(oid) like '%524288%')),

  -- Triggers
  ('triggers', 'records_touch (001)', exists (select 1 from pg_trigger where tgname = 'records_touch')),
  ('triggers', 'reminders_cap (007)', exists (select 1 from pg_trigger where tgname = 'reminders_cap')),
  ('triggers', 'reminders_phone_own (008)', exists (select 1 from pg_trigger where tgname = 'reminders_phone_own')),
  ('triggers', 'records_usage_ins/upd/del (010)', (select count(*) = 3 from pg_trigger where tgname like 'records_usage_%')),
  ('triggers', 'records_cap removido (010)', not exists (select 1 from pg_trigger where tgname = 'records_cap')),
  ('triggers', 'records_rate_ins/upd (011)', (select count(*) = 2 from pg_trigger where tgname like 'records_rate_%')),
  ('triggers', 'reminders_rate_ins (011)', exists (select 1 from pg_trigger where tgname = 'reminders_rate_ins')),

  -- Functions: present, closed to the API roles, with a fixed search_path
  ('funções', 'due_reminders só para e-mails confirmados (009)', exists (select 1 from pg_proc
     where proname = 'due_reminders' and prosrc like '%email_confirmed_at%')),
  ('funções', 'reminders_sent_today (007)', to_regprocedure('public.reminders_sent_today(uuid[])') is not null),
  ('funções', 'reminders_sent_total_today (009)', to_regprocedure('public.reminders_sent_total_today()') is not null),
  ('funções', 'purge_old_data apaga lembretes vencidos (009)', exists (select 1 from pg_proc
     where proname = 'purge_old_data' and prosrc like '%sent_at is null%')),
  ('funções', 'private.anexos_room (012)', to_regprocedure('private.anexos_room()') is not null),
  ('funções', 'nenhuma função de public executável por anon/authenticated', not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute')))),
  ('funções', 'search_path fixo em todas as funções de public/private', not exists (
     select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.proconfig is null)),
  ('funções', 'o dono das funções lê storage.objects (security definer)',
     has_table_privilege((select proowner::regrole::text from pg_proc where proname = 'anexos_room' limit 1), 'storage.objects', 'select')),

  -- Policies
  ('policies', 'records: 4 policies (001)', (select count(*) = 4 from pg_policies where tablename = 'records')),
  ('policies', 'reminders: 3 policies (002)', (select count(*) = 3 from pg_policies where tablename = 'reminders')),
  ('policies', 'anexos: ler, enviar e apagar (005)', (select count(*) = 3 from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname like 'anexos:%')),
  ('policies', 'anexos: envio checa a cota (012)', exists (select 1 from pg_policies
     where policyname = 'anexos: insert own' and with_check like '%anexos_room%')),

  -- Storage bucket
  ('storage', 'bucket anexos privado, 10 MB, sem SVG (005/007)', exists (select 1 from storage.buckets
     where id = 'anexos' and not public and file_size_limit = 10485760
       and not ('image/svg+xml' = any (allowed_mime_types)))),

  -- Scheduled jobs (pg_cron)
  ('cron', 'purge-old-data agendado (008)', exists (select 1 from cron.job where jobname = 'purge-old-data')),
  ('cron', 'send-reminders agendado (cron.sql)', exists (select 1 from cron.job where jobname = 'send-reminders'))
)
select case when ok then '✅' else '❌' end as status, area, item from checks order by ok, area, item;

-- Last runs of the scheduled jobs (run separately if pg_cron's history is enabled):
-- select j.jobname, d.status, d.return_message, d.start_time
-- from cron.job_run_details d join cron.job j using (jobid)
-- order by d.start_time desc limit 10;
