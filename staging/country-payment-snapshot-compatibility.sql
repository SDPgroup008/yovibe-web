-- The event primary key in this database is slug.
begin;
create or replace function public.snapshot_event_money() returns trigger
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

revoke execute on function public.record_installment_payment(uuid, integer, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.record_installment_payment(uuid, integer, jsonb, uuid) to service_role;
commit;

-- Exercise the trigger with a synthetic attempt. The transaction is rolled back.
begin;
insert into public.country_payment_attempts
  (id, event_slug, country_code, currency, provider, amount, purpose, subject_id)
select gen_random_uuid(), slug, country_code, currency, 'staging-schema-check', 1, 'ticket', gen_random_uuid()
from public.events order by slug limit 1 returning event_slug, country_code, currency;
rollback;
