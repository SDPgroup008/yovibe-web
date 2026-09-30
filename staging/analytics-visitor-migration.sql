-- Server-authoritative visitor analytics. Apply to staging only after the preflight succeeds.
begin;

create table if not exists public.analytics_visitor_profiles (
  canonical_visitor_key text primary key,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analytics_visitor_profiles_key_format check (canonical_visitor_key ~ '^(account|guest):')
);

alter table public.analytics_sessions
  add column if not exists canonical_visitor_key text,
  add column if not exists last_activity_at timestamptz;

update public.analytics_sessions
set canonical_visitor_key = case
      when user_id is not null then 'account:' || user_id::text
      when unique_visitor_id is not null and btrim(unique_visitor_id) <> '' then 'guest:' || unique_visitor_id
      else null
    end,
    last_activity_at = coalesce(last_activity_at, end_time, start_time, now())
where canonical_visitor_key is null or last_activity_at is null;

insert into public.analytics_visitor_profiles (canonical_visitor_key, first_seen_at, last_seen_at)
select canonical_visitor_key, min(start_time), max(coalesce(last_activity_at, start_time))
from public.analytics_sessions
where canonical_visitor_key is not null
group by canonical_visitor_key
on conflict (canonical_visitor_key) do update
set first_seen_at = least(public.analytics_visitor_profiles.first_seen_at, excluded.first_seen_at),
    last_seen_at = greatest(public.analytics_visitor_profiles.last_seen_at, excluded.last_seen_at),
    updated_at = now();

create index if not exists idx_analytics_sessions_canonical_activity
  on public.analytics_sessions (canonical_visitor_key, last_activity_at desc);
create index if not exists idx_analytics_visitor_profiles_first_seen
  on public.analytics_visitor_profiles (first_seen_at);

create or replace function public.record_analytics_session(
  p_canonical_visitor_key text,
  p_guest_visitor_id text,
  p_account_user_id uuid,
  p_platform text,
  p_user_agent text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_now timestamptz := now();
begin
  if p_canonical_visitor_key !~ '^(account|guest):' then raise exception 'invalid canonical visitor key'; end if;
  if p_platform not in ('web', 'mobile') then raise exception 'invalid platform'; end if;
  perform pg_advisory_xact_lock(hashtext(p_canonical_visitor_key));

  insert into public.analytics_visitor_profiles (canonical_visitor_key, first_seen_at, last_seen_at)
  values (p_canonical_visitor_key, v_now, v_now)
  on conflict (canonical_visitor_key) do update
  set last_seen_at = excluded.last_seen_at, updated_at = v_now;

  select id into v_session_id
  from public.analytics_sessions
  where canonical_visitor_key = p_canonical_visitor_key
    and end_time is null
    and last_activity_at >= v_now - interval '30 minutes'
  order by last_activity_at desc
  limit 1
  for update;

  if v_session_id is not null then
    update public.analytics_sessions
    set last_activity_at = v_now
    where id = v_session_id;
    return v_session_id;
  end if;

  insert into public.analytics_sessions (
    user_id, unique_visitor_id, canonical_visitor_key, is_authenticated,
    start_time, last_activity_at, platform, user_agent, visit_number
  ) values (
    p_account_user_id, p_guest_visitor_id, p_canonical_visitor_key, p_account_user_id is not null,
    v_now, v_now, p_platform, nullif(p_user_agent, ''), 1
  ) returning id into v_session_id;
  return v_session_id;
end;
$$;

create or replace function public.end_analytics_session(
  p_session_id uuid,
  p_canonical_visitor_key text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_now timestamptz := now();
begin
  update public.analytics_sessions
  set end_time = v_now,
      last_activity_at = v_now,
      duration = greatest(0, extract(epoch from v_now - start_time)::integer)
  where id = p_session_id
    and canonical_visitor_key = p_canonical_visitor_key
    and end_time is null;
end;
$$;

create or replace function public.promote_analytics_session(
  p_session_id uuid,
  p_guest_visitor_id text,
  p_account_user_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := 'account:' || p_account_user_id::text;
  v_start timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext(v_key));
  select start_time into v_start
  from public.analytics_sessions
  where id = p_session_id
    and canonical_visitor_key = 'guest:' || p_guest_visitor_id
    and end_time is null
  for update;

  if v_start is null then return null; end if;
  insert into public.analytics_visitor_profiles (canonical_visitor_key, first_seen_at, last_seen_at)
  values (v_key, v_start, now())
  on conflict (canonical_visitor_key) do update
  set first_seen_at = least(public.analytics_visitor_profiles.first_seen_at, excluded.first_seen_at),
      last_seen_at = greatest(public.analytics_visitor_profiles.last_seen_at, excluded.last_seen_at),
      updated_at = now();

  update public.analytics_sessions
  set canonical_visitor_key = v_key, user_id = p_account_user_id, is_authenticated = true, last_activity_at = now()
  where id = p_session_id;
  return p_session_id;
end;
$$;

alter table public.analytics_sessions enable row level security;
alter table public.analytics_visitor_profiles enable row level security;

revoke all on table public.analytics_sessions from anon, authenticated;
revoke all on table public.analytics_visitor_profiles from anon, authenticated;
revoke all on function public.record_analytics_session(text, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.end_analytics_session(uuid, text) from public, anon, authenticated;
revoke all on function public.promote_analytics_session(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.record_analytics_session(text, text, uuid, text, text) to service_role;
grant execute on function public.end_analytics_session(uuid, text) to service_role;
grant execute on function public.promote_analytics_session(uuid, text, uuid) to service_role;
grant select, insert, update, delete on public.analytics_sessions, public.analytics_visitor_profiles to service_role;

drop policy if exists analytics_sessions_insert_all on public.analytics_sessions;
drop policy if exists analytics_sessions_select_all on public.analytics_sessions;
drop policy if exists analytics_sessions_update_all on public.analytics_sessions;

commit;
