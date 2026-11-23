-- Read-only staging inspection. Run each statement separately so dashboard
-- row limits cannot truncate the financial and venue column listings.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('tickets', 'ticket_installment_plans', 'ticket_installments')
order by table_name, ordinal_position;

select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('refund_requests', 'payouts', 'pending_ticket_fulfillments',
    'ticket_sponsorship_orders', 'venues')
order by table_name, ordinal_position;

-- Identify relevant monetary constraints without returning customer records.
select c.conrelid::regclass as relation_name, c.conname,
       pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.connamespace = 'public'::regnamespace
  and c.conrelid in (
    select cls.oid from pg_class cls
    join pg_namespace n on n.oid = cls.relnamespace
    where n.nspname = 'public' and cls.relname in (
      'tickets', 'ticket_installment_plans', 'ticket_installments', 'refund_requests',
      'payouts', 'pending_ticket_fulfillments', 'ticket_sponsorship_orders', 'venues'
    )
  )
order by c.conrelid::regclass::text, c.conname;
