-- Per-event sale-time payout eligibility: read-only preflight.
-- Run this in the target Supabase project's SQL editor before the migration.

select
  to_regclass('public.events') as events_table,
  to_regclass('public.event_payout_eligibility_settings') as settings_table,
  to_regclass('public.event_payout_eligibility_audit') as audit_table;

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'events'
  and column_name in ('slug', 'created_by', 'created_by_auth')
order by column_name;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('events', 'event_payout_eligibility_settings', 'event_payout_eligibility_audit')
order by c.relname;

select
  grantee,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('event_payout_eligibility_settings', 'event_payout_eligibility_audit')
order by table_name, grantee, privilege_type;

select
  count(*) filter (where payment_status = 'completed' and status = 'active' and coalesce(is_scanned, false) = false) as existing_unscanned_completed_tickets,
  count(*) filter (where payout_eligible = true and coalesce(payout_status, 'pending') = 'pending') as currently_eligible_tickets
from public.tickets;
