-- Public, immutable-at-creation organiser name used only for Event JSON-LD.
-- Apply this migration before deploying the edge code that selects organizer_name.

begin;

alter table public.events
  add column if not exists organizer_name text;

comment on column public.events.organizer_name is
  'Public display-name snapshot for structured Event organizer markup; never stores contact or financial information.';

create or replace function public.snapshot_event_organizer_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
begin
  -- An explicitly supplied non-empty snapshot wins. Otherwise take the creator
  -- display name once, so later profile edits do not change published events.
  if nullif(btrim(new.organizer_name), '') is not null then
    return new;
  end if;

  select nullif(btrim(u.display_name), '')
    into v_display_name
  from public.users u
  where u.id = new.created_by
     or u.uid = new.created_by_auth::text
  order by case when u.id = new.created_by then 0 else 1 end
  limit 1;

  new.organizer_name := v_display_name;
  return new;
end;
$$;

drop trigger if exists snapshot_event_organizer_name_before_insert on public.events;
create trigger snapshot_event_organizer_name_before_insert
  before insert on public.events
  for each row
  execute function public.snapshot_event_organizer_name();

revoke all on function public.snapshot_event_organizer_name()
  from public, anon, authenticated;

-- Backfill public, non-deleted events only when a real display name is present.
update public.events e
set organizer_name = (
  select nullif(btrim(u.display_name), '') as display_name
  from public.users u
  where u.id = e.created_by
     or u.uid = e.created_by_auth::text
  order by case when u.id = e.created_by then 0 else 1 end
  limit 1
)
where e.is_deleted is false
  and nullif(btrim(e.organizer_name), '') is null
  and exists (
    select 1
    from public.users u
    where (u.id = e.created_by or u.uid = e.created_by_auth::text)
      and nullif(btrim(u.display_name), '') is not null
  );

notify pgrst, 'reload schema';

commit;
