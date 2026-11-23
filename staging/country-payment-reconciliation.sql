-- Apply after country-financial-additive.sql, before deploying the staging workers.
begin;
alter table public.country_payment_attempts
  add column if not exists next_check_at timestamptz not null default now();
create index if not exists country_payment_attempts_due
  on public.country_payment_attempts (next_check_at, id) where status = 'pending';
commit;

select
  (select count(*) from public.events) as events,
  (select count(*) from public.venues) as venues,
  (select count(*) from public.events e left join public.venues v on v.slug = e.venue_slug
    where e.venue_slug is not null and v.country_code is distinct from e.country_code) as venue_market_mismatches,
  (select relrowsecurity from pg_class where oid = 'public.country_payment_attempts'::regclass) as attempts_rls,
  has_table_privilege('anon', 'public.country_payment_attempts', 'select') as guest_can_read_attempts,
  has_table_privilege('authenticated', 'public.country_payment_attempts', 'insert') as browser_can_insert_attempts,
  has_table_privilege('service_role', 'public.country_payment_attempts', 'update') as worker_can_reconcile;
