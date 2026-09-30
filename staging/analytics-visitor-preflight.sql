-- Read-only preflight: run in the staging Supabase SQL editor before the migration.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'analytics_sessions'
order by ordinal_position;

select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'analytics_sessions'
order by policyname;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'analytics_sessions'
order by grantee, privilege_type;

select
  count(*) as total_sessions,
  count(*) filter (where user_id is null) as guest_sessions,
  count(*) filter (where user_id is not null) as signed_in_sessions,
  count(*) filter (where unique_visitor_id is null or btrim(unique_visitor_id) = '') as unidentified_sessions
from public.analytics_sessions;
