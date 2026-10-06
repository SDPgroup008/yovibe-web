-- Per-event sale-time payout eligibility.
-- Additive: every event remains scan-gated until an admin enables its setting.

begin;

create table if not exists public.event_payout_eligibility_settings (
  event_slug text primary key references public.events(slug) on delete cascade,
  sale_payout_enabled boolean not null default false,
  changed_at timestamptz not null default now(),
  changed_by uuid not null references auth.users(id)
);

create table if not exists public.event_payout_eligibility_audit (
  id uuid primary key default gen_random_uuid(),
  event_slug text not null references public.events(slug) on delete cascade,
  previous_sale_payout_enabled boolean not null,
  next_sale_payout_enabled boolean not null,
  changed_at timestamptz not null default now(),
  changed_by uuid not null references auth.users(id),
  check (previous_sale_payout_enabled is distinct from next_sale_payout_enabled)
);

create index if not exists idx_event_payout_eligibility_audit_event_changed_at
  on public.event_payout_eligibility_audit(event_slug, changed_at desc);

alter table public.event_payout_eligibility_settings enable row level security;
alter table public.event_payout_eligibility_audit enable row level security;

revoke all on table public.event_payout_eligibility_settings from public, anon, authenticated, service_role;
revoke all on table public.event_payout_eligibility_audit from public, anon, authenticated, service_role;
grant select, insert, update on table public.event_payout_eligibility_settings to service_role;
grant select, insert on table public.event_payout_eligibility_audit to service_role;

-- The endpoint verifies the caller is an admin before calling this function.
-- Restricting execution to service_role prevents direct browser invocation.
create or replace function public.set_event_sale_payout_eligibility(
  p_event_slug text,
  p_enabled boolean,
  p_changed_by uuid
)
returns public.event_payout_eligibility_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous boolean := false;
  v_result public.event_payout_eligibility_settings;
begin
  if p_event_slug is null or btrim(p_event_slug) = '' then
    raise exception 'event slug is required';
  end if;
  if p_changed_by is null then
    raise exception 'admin identity is required';
  end if;
  if not exists (select 1 from public.events where slug = p_event_slug) then
    raise exception 'event not found';
  end if;

  select sale_payout_enabled
    into v_previous
  from public.event_payout_eligibility_settings
  where event_slug = p_event_slug
  for update;

  if not found then
    v_previous := false;
  end if;

  insert into public.event_payout_eligibility_settings (
    event_slug, sale_payout_enabled, changed_at, changed_by
  ) values (
    p_event_slug, p_enabled, now(), p_changed_by
  )
  on conflict (event_slug) do update
  set sale_payout_enabled = excluded.sale_payout_enabled,
      changed_at = excluded.changed_at,
      changed_by = excluded.changed_by
  returning * into v_result;

  if v_previous is distinct from p_enabled then
    insert into public.event_payout_eligibility_audit (
      event_slug, previous_sale_payout_enabled, next_sale_payout_enabled, changed_at, changed_by
    ) values (
      p_event_slug, v_previous, p_enabled, now(), p_changed_by
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.set_event_sale_payout_eligibility(text, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.set_event_sale_payout_eligibility(text, boolean, uuid)
  to service_role;

-- Make the newly created RPC visible to the Supabase REST schema cache now,
-- rather than waiting for its automatic refresh.
notify pgrst, 'reload schema';

commit;
