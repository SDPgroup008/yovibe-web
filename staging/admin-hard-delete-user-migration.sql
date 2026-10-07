-- Private, time-limited denylist for JWTs issued before an administrator
-- permanently removes the corresponding Auth user. The table contains no
-- profile or contact data and is accessible only to server-side service-role
-- operations.

begin;

create table if not exists public.account_access_revocations (
  auth_user_id uuid primary key,
  revoked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_by uuid not null,
  constraint account_access_revocations_expiry_check check (expires_at > revoked_at)
);

create index if not exists account_access_revocations_expires_at_idx
  on public.account_access_revocations (expires_at);

alter table public.account_access_revocations enable row level security;
revoke all on table public.account_access_revocations from public, anon, authenticated;
grant select, insert, update, delete on table public.account_access_revocations to service_role;

notify pgrst, 'reload schema';

commit;
