-- Run in the staging SQL editor after country-discovery-additive.sql.
-- The existing Uganda-only rollout constraint remains in effect.
begin;

alter table public.venues add constraint venues_slug_country_unique unique (slug, country_code);
alter table public.events add constraint events_venue_country_fk
  foreign key (venue_slug, country_code) references public.venues(slug, country_code);

create table public.country_payment_attempts (
  id uuid primary key,
  event_slug text not null references public.events(slug),
  country_code text not null,
  currency text not null,
  provider text not null,
  amount numeric(18,2) not null check (amount > 0),
  purpose text not null check (purpose in ('ticket', 'installment', 'sponsorship')),
  subject_id uuid not null,
  installment_index integer not null default -1,
  checkout jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','completed','failed')),
  created_at timestamptz not null default now(),
  unique (purpose, subject_id, installment_index, id)
);
create unique index country_payment_open_subject on public.country_payment_attempts
  (purpose, subject_id, installment_index) where status <> 'failed';
alter table public.country_payment_attempts enable row level security;
revoke all on public.country_payment_attempts from public, anon, authenticated;
grant select, insert, update on public.country_payment_attempts to service_role;

alter table public.ticket_installment_plans
  alter column base_total type numeric using base_total::numeric,
  alter column late_fee type numeric using late_fee::numeric,
  alter column total_amount type numeric using total_amount::numeric,
  alter column amount_paid type numeric using amount_paid::numeric;

alter table public.tickets add column country_code text not null default 'UG',
  add column currency text not null default 'UGX';
alter table public.ticket_installment_plans add column country_code text not null default 'UG',
  add column currency text not null default 'UGX';
alter table public.pending_ticket_fulfillments add column country_code text not null default 'UG',
  add column currency text not null default 'UGX';
alter table public.payouts add column country_code text not null default 'UG',
  add column currency text not null default 'UGX';
alter table public.refund_requests add column country_code text not null default 'UG';
alter table public.ticket_sponsorship_orders add column country_code text not null default 'UG';

-- Derive snapshots at insert even for older callers and ticket-issuing RPCs.
create function public.snapshot_event_money() returns trigger
language plpgsql set search_path = '' as $$
declare
  event_key text;
  market record;
begin
  if tg_op = 'UPDATE' then
    if (new.country_code, new.currency) is distinct from (old.country_code, old.currency) then
      raise exception 'Recorded country and currency are immutable';
    end if;
    return new;
  end if;
  if tg_table_name = 'ticket_sponsorship_orders' then
    select event_slug into strict event_key from public.ticket_allocations where id = new.allocation_id;
  else
    event_key := coalesce(to_jsonb(new)->>'event_slug', to_jsonb(new)->>'event_id');
  end if;
  if event_key is null and tg_table_name = 'payouts' then
    return new; -- Historical manual Uganda payouts have no associated event.
  end if;
  select country_code, currency into strict market from public.events
    where slug = event_key;
  new.country_code := market.country_code;
  new.currency := market.currency;
  return new;
end;
$$;

do $$
declare relation_name text;
begin
  foreach relation_name in array array['tickets','pending_ticket_fulfillments','payouts',
    'ticket_installment_plans','ticket_sponsorship_orders','refund_requests','country_payment_attempts']
  loop
    execute format('create trigger snapshot_event_money before insert or update of country_code, currency on public.%I
      for each row execute function public.snapshot_event_money()', relation_name);
  end loop;
end;
$$;
-- Protect historical money and in-flight quotes against currency changes.
create trigger preserve_event_denomination before update of country_code, currency on public.events
  for each row execute function public.snapshot_event_money();

commit;
