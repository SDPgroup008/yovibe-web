begin;

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
