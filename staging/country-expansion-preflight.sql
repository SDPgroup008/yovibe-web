-- Read-only preflight. Run against staging first; review results before any backfill.
-- Do not paste customer-level rows into public discussions.
select table_name, column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('events', 'venues', 'tickets', 'payouts', 'refund_requests',
    'pending_ticket_fulfillments', 'ticket_installment_plans', 'ticket_installments',
    'sponsorship_orders')
order by table_name, ordinal_position;

select c.conrelid::regclass as table_name, c.conname, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_namespace n on n.oid = c.connamespace
where n.nspname = 'public'
  and c.conrelid::regclass::text in ('events', 'venues', 'tickets', 'payouts',
    'refund_requests', 'pending_ticket_fulfillments', 'ticket_installment_plans',
    'ticket_installments', 'sponsorship_orders')
order by c.conrelid::regclass::text, c.conname;

select count(*) as total_events,
       count(*) filter (where e.venue_slug is null or btrim(e.venue_slug) = '') as missing_venue_slug,
       count(*) filter (where e.venue_slug is not null and v.slug is null) as unmatched_venue_slug
from public.events e
left join public.venues v on v.slug = e.venue_slug;

select count(*) as total_venues,
       count(*) filter (where latitude is null or longitude is null) as missing_coordinates
from public.venues;
