-- Run in the target Supabase SQL editor before deploying permanent account
-- deletion. Compare the foreign-key list to the endpoint's blocker coverage.

select
  c.conrelid::regclass as dependent_table,
  c.conname as constraint_name,
  pg_get_constraintdef(c.oid, true) as definition
from pg_constraint c
where c.contype = 'f'
  and c.confrelid in ('public.users'::regclass, 'auth.users'::regclass)
order by c.conrelid::regclass::text, c.conname;

select
  to_regclass('public.account_access_revocations') as revocation_table,
  to_regclass('public.analytics_sessions') as analytics_sessions_table,
  to_regclass('public.analytics_visitor_profiles') as analytics_visitor_profiles_table,
  to_regclass('public.notification_user_states') as notification_user_states_table;

select
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'account_access_revocations'
order by table_name, grantee, privilege_type;
