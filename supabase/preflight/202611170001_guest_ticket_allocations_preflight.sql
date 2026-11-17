-- YoVibe Guest Tickets preflight — READ ONLY
-- Run this in the target Supabase SQL editor before
-- 202611170001_guest_ticket_allocations.sql.
--
-- It does not create, alter, update, delete, or invoke any mutating function.

-- 1. Confirm the expected base relations and whether RLS is enabled.
select
  n.nspname as schema_name,
  c.relname as relation_name,
  c.relkind as relation_kind,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'events', 'tickets', 'users', 'payouts', 'ticket_inventory_holds',
    'pending_ticket_fulfillments', 'ticket_allocations',
    'ticket_allocation_recipients', 'ticket_allocation_claim_tokens',
    'ticket_allocation_claims', 'ticket_redemption_codes',
    'ticket_sponsorship_orders', 'ticket_issuance_audits',
    'ticket_claim_otps', 'ticket_public_rate_limits', 'ticket_allocation_exports'
  )
order by c.relname;

-- 2. Verify the columns used by normal ticket fulfilment and identify whether
--    the new Guest Tickets columns already exist from a partial prior attempt.
select
  table_name,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('events', 'tickets', 'payouts')
  and column_name in (
    'slug', 'entry_fees', 'ticket_capacity', 'created_by', 'created_by_auth',
    'id', 'event_id', 'event_slug', 'entry_fee_type', 'status', 'buyer_id',
    'buyer_email', 'delivery_email', 'payment_status', 'payment_method',
    'payout_eligible', 'payout_status', 'allocation_id', 'claim_id',
    'sponsorship_order_id', 'funding_type', 'distribution_method',
    'original_face_value', 'beneficiary_amount_paid', 'issuance_reason',
    'issued_by', 'issued_at', 'sponsorship_order_ids'
  )
order by table_name, ordinal_position;

-- 3. Inspect current ticket constraints and indexes. In particular, confirm
--    that active/used/pending tickets are still the capacity-bearing states.
select
  c.relname as table_name,
  con.conname as constraint_name,
  con.contype as constraint_type,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('events', 'tickets', 'payouts')
order by c.relname, con.conname;

select
  tablename as table_name,
  indexname as index_name,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('events', 'tickets', 'payouts', 'ticket_inventory_holds')
order by tablename, indexname;

-- 4. Verify the existing trusted ticket-creation and inventory functions.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_function_result(p.oid) as returns,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_tickets_batch', 'acquire_inventory_hold',
    'release_inventory_holds', 'release_expired_inventory_reservations'
  )
order by p.proname, arguments;

-- 5. Show RLS policies that could interact with ticket reads and organiser
--    access. The migration adds new policy names without replacing these.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('events', 'tickets', 'users', 'payouts')
order by tablename, policyname;

-- 6. Look for any already-created Guest Tickets functions, policies, or
--    relations. Rows here indicate a prior partial migration and should be
--    reviewed before applying the new migration.
select 'relations' as object_kind, c.relname as object_name, c.relkind::text as details
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname like 'ticket_allocation%'
union all
select 'functions', p.proname, pg_get_function_identity_arguments(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'create_ticket_allocation', 'issue_ticket_allocation_batch',
  'release_ticket_allocation_reservation', 'consume_ticket_redemption_code',
  'expire_ticket_allocations', 'is_ticket_allocation_admin',
  'owns_ticket_allocation_event'
)
union all
select 'policies', policyname, tablename
from pg_policies
where schemaname = 'public'
  and (tablename like 'ticket_allocation%' or policyname like '%ticket allocation%')
order by object_kind, object_name;

-- 7. Capacity and data-health snapshot. These queries are informational only.
--    They reveal malformed maxTickets values and ticket rows that do not have
--    a matching entry-fee category before allocation reservations rely on them.
select
  e.slug as event_slug,
  fee.value ->> 'name' as entry_fee_type,
  fee.value ->> 'maxTickets' as configured_max_tickets,
  count(t.id) filter (where t.status in ('active', 'used', 'pending')) as capacity_bearing_tickets
from public.events e
cross join lateral jsonb_array_elements(coalesce(e.entry_fees, '[]'::jsonb)) fee(value)
left join public.tickets t
  on t.event_slug = e.slug
  and t.entry_fee_type = fee.value ->> 'name'
group by e.slug, fee.value
order by e.slug, entry_fee_type;

select
  t.event_slug,
  t.entry_fee_type,
  count(*) as ticket_count
from public.tickets t
left join public.events e on e.slug = t.event_slug
left join lateral jsonb_array_elements(coalesce(e.entry_fees, '[]'::jsonb)) fee(value)
  on fee.value ->> 'name' = t.entry_fee_type
where fee.value is null
group by t.event_slug, t.entry_fee_type
order by ticket_count desc, t.event_slug, t.entry_fee_type;

-- 8. Required extensions and current database version context.
select extname as installed_extension, extversion
from pg_extension
where extname in ('pgcrypto', 'uuid-ossp')
order by extname;

select current_database() as database_name, current_setting('server_version') as postgres_version;
