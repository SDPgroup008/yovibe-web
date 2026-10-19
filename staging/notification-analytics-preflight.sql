-- Read-only: run in the staging Supabase SQL editor, not production.
select current_database() as database_name,
  to_regclass('public.notifications') as notifications,
  to_regclass('public.notification_tokens') as notification_tokens,
  to_regclass('public.notification_installations') as notification_installations,
  to_regclass('public.notification_user_states') as notification_user_states,
  to_regclass('public.notification_analytics') as notification_analytics,
  to_regclass('public.daily_notification_stats') as daily_notification_stats,
  to_regclass('public.notification_user_interactions') as notification_user_interactions;

select table_name, ordinal_position, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name in (
  'notifications', 'notification_tokens', 'notification_installations',
  'notification_user_states', 'notification_analytics', 'daily_notification_stats',
  'notification_user_interactions')
order by table_name, ordinal_position;

select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (
  'notifications', 'notification_tokens', 'notification_installations',
  'notification_user_states', 'notification_analytics', 'daily_notification_stats',
  'notification_user_interactions') and c.relkind in ('r', 'p')
order by c.relname;

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename in (
  'notifications', 'notification_tokens', 'notification_installations',
  'notification_user_states', 'notification_analytics', 'daily_notification_stats',
  'notification_user_interactions') order by tablename, policyname;

select table_name, grantee, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name in (
  'notifications', 'notification_tokens', 'notification_installations',
  'notification_user_states', 'notification_analytics', 'daily_notification_stats',
  'notification_user_interactions') and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;

select c.conrelid::regclass as table_name, c.conname, pg_get_constraintdef(c.oid) as definition
from pg_constraint c join pg_namespace n on n.oid = c.connamespace
where n.nspname = 'public' and c.conrelid in (
  select oid from pg_class where relnamespace = n.oid and relname in (
    'notifications', 'notification_tokens', 'notification_installations',
    'notification_user_states', 'notification_user_interactions'))
order by 1, 2;

select event_object_table, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers where trigger_schema = 'public' and event_object_table in (
  'notifications', 'notification_tokens', 'notification_user_states',
  'notification_analytics', 'daily_notification_stats', 'notification_user_interactions')
order by event_object_table, trigger_name;

-- Aggregates only: never copy token values, installation secrets, or personal details.
select count(*) as total_tokens, count(*) filter (where is_active is true) as active_tokens,
  count(*) filter (where is_active is false) as inactive_tokens,
  count(*) filter (where is_active is null) as unknown_status_tokens,
  count(*) filter (where is_authenticated is true) as authenticated_tokens,
  count(*) filter (where is_authenticated is false) as guest_tokens,
  count(*) filter (where is_authenticated is null) as unknown_auth_tokens,
  count(*) filter (where subscribed_at is null) as missing_subscription_dates
from public.notification_tokens;

select id, created_at, data->>'summaryMode' as summary_mode,
  data->>'dedupeKey' as slot_key, data->>'deliveryStatus' as delivery_status,
  data->'delivery' as delivery_counts
from public.notifications
where user_id is null and data->>'summaryMode' in ('today', 'week')
order by created_at desc limit 20;
