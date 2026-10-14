begin;

-- Authenticated read/open state used by the notification feed client.
create table if not exists public.notification_user_states (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_read boolean not null default false,
  read_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

alter table public.notification_user_states enable row level security;
revoke all on table public.notification_user_states from public, anon;
grant select, insert, update on table public.notification_user_states to authenticated;
grant select, insert, update, delete on table public.notification_user_states to service_role;

drop policy if exists "notification_user_states_select_own" on public.notification_user_states;
create policy "notification_user_states_select_own"
  on public.notification_user_states
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "notification_user_states_insert_own" on public.notification_user_states;
create policy "notification_user_states_insert_own"
  on public.notification_user_states
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "notification_user_states_update_own" on public.notification_user_states;
create policy "notification_user_states_update_own"
  on public.notification_user_states
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.notification_installations (
  id uuid primary key,
  secret_hash text not null check (char_length(secret_hash) = 64),
  broadcasts_from timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_tokens
  add column if not exists installation_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'notification_tokens_installation_id_fkey'
      and conrelid = 'public.notification_tokens'::regclass
  ) then
    alter table public.notification_tokens
      add constraint notification_tokens_installation_id_fkey
      foreign key (installation_id)
      references public.notification_installations(id)
      on delete set null;
  end if;
end $$;

create index if not exists notification_tokens_installation_id_idx
  on public.notification_tokens (installation_id);

alter table public.notification_installations enable row level security;
revoke all on table public.notification_installations from public, anon, authenticated;
grant select, insert, update, delete on table public.notification_installations to service_role;

commit;
