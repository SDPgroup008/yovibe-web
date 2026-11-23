-- Apply on the staging project with the multi-country candidate published.
begin;
do $$
begin
  if to_regclass('public.country_payment_attempts_due') is null or
     not exists (select 1 from pg_constraint where conrelid = 'public.events'::regclass
       and conname = 'events_country_currency_check' and convalidated) or
     not exists (select 1 from pg_constraint where conrelid = 'public.events'::regclass
       and conname = 'events_venue_country_fk' and convalidated) then
    raise exception 'Apply the financial schema and reconciliation migrations first';
  end if;
end $$;
alter table public.events drop constraint if exists events_country_rollout_guard;
commit;
