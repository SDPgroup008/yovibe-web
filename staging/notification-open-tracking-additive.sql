-- Additive migration: run in staging only after reviewing the inspection results.
-- Records an in-app open once per notification and opted-in installation.
begin;

create table if not exists public.notification_installation_opens (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  installation_id uuid not null references public.notification_installations(id) on delete cascade,
  opened_at timestamptz not null default now(),
  primary key (notification_id, installation_id)
);

create index if not exists notification_installation_opens_opened_at_idx
  on public.notification_installation_opens (opened_at);

alter table public.notification_installation_opens enable row level security;
revoke all on table public.notification_installation_opens from public, anon, authenticated;
grant select, insert on table public.notification_installation_opens to service_role;

commit;
