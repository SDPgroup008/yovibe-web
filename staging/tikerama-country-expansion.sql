-- Enables the countries exposed by Tikerama's own country selector.
-- Imported events remain discovery-only and unfeatured; this does not enable
-- payment providers or payout flows for any new market.
begin;

alter table public.venues drop constraint if exists venues_country_code_check;
alter table public.events drop constraint if exists events_country_currency_check;

alter table public.venues add constraint venues_country_code_check
  check (country_code in (
    'BF','BJ','CM','CI','CD','GA','GN','KE','ML','CG','RW','SN','SL','TG','UG','ZM'
  ));

alter table public.events add constraint events_country_currency_check
  check ((country_code, currency) in (
    ('BF','XOF'), ('BJ','XOF'), ('CM','XAF'), ('CI','XOF'), ('CD','CDF'), ('CD','USD'),
    ('GA','XAF'), ('GN','GNF'), ('KE','KES'), ('ML','XOF'), ('CG','XAF'), ('RW','RWF'),
    ('SN','XOF'), ('SL','SLE'), ('TG','XOF'), ('UG','UGX'), ('ZM','ZMW')
  ));

commit;
