-- STAGING ONLY. Add discovery fields without changing payment calculations.
-- The existing staging data was reported to contain Uganda records only.
-- Run after reviewing country-expansion-preflight.sql results.
-- Do not enable non-UG payment flows with this migration alone.
begin;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and ((table_name = 'venues' and column_name = 'country_code')
        or (table_name = 'events' and column_name in ('country_code', 'currency')))
  ) then
    raise exception 'Country/currency columns already exist; inspect them before applying this migration';
  end if;
  if exists (
    select 1 from public.events e
    left join public.venues v on v.slug = e.venue_slug
    where v.slug is null
  ) then
    raise exception 'Events with missing or unmatched venues require review before backfill';
  end if;
end $$;

alter table public.venues add column country_code text not null default 'UG';
alter table public.events add column country_code text not null default 'UG';
alter table public.events add column currency text not null default 'UGX';

alter table public.venues add constraint venues_country_code_check
  check (country_code in ('BJ','CM','CI','CD','GA','KE','CG','RW','SN','SL','UG','ZM'));
alter table public.events add constraint events_country_currency_check
  check ((country_code, currency) in (
    ('BJ','XOF'), ('CM','XAF'), ('CI','XOF'), ('CD','CDF'), ('CD','USD'),
    ('GA','XAF'), ('KE','KES'), ('CG','XAF'), ('RW','RWF'), ('SN','XOF'),
    ('SL','SLE'), ('UG','UGX'), ('ZM','ZMW')
  ));

-- Current fulfillment, instalment, payout and refund paths are UGX-specific.
-- Keep events Uganda-only until server-side multi-currency protection is ready;
-- this prevents a foreign event being charged or settled as UGX in the interim.
alter table public.events add constraint events_country_rollout_guard
  check (country_code = 'UG' and currency = 'UGX');

create index events_country_date_idx on public.events (country_code, date);
create index venues_country_name_idx on public.venues (country_code, name);

commit;
