-- Venue Gallery migration. Review and run in Supabase SQL Editor after
-- confirming the investigation results. This is intentionally separate from
-- weekly_programs: poster metadata remains backwards-compatible JSONB.

create table if not exists public.venue_gallery (
  id uuid primary key default gen_random_uuid(),
  venue_slug text not null references public.venues(slug) on delete cascade,
  image_url text not null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text,
  display_order integer not null default 0,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_venue_gallery_venue_order
  on public.venue_gallery (venue_slug, display_order, created_at desc);

alter table public.venue_gallery enable row level security;

grant select on public.venue_gallery to anon, authenticated;
grant insert, update, delete on public.venue_gallery to authenticated;

drop policy if exists venue_gallery_public_read on public.venue_gallery;
create policy venue_gallery_public_read
on public.venue_gallery
for select
to public
using (true);

drop policy if exists venue_gallery_owner_insert on public.venue_gallery;
create policy venue_gallery_owner_insert
on public.venue_gallery
for insert
to authenticated
with check (
  exists (
    select 1
    from public.venues v
    join public.users u on u.id = v.owner_id
    where v.slug = venue_gallery.venue_slug
      and u.uid = auth.uid()::text
  )
  or exists (
    select 1
    from public.users u
    where u.uid = auth.uid()::text
      and lower(u.user_type) = 'admin'
  )
);

drop policy if exists venue_gallery_owner_update on public.venue_gallery;
create policy venue_gallery_owner_update
on public.venue_gallery
for update
to authenticated
using (
  exists (
    select 1
    from public.venues v
    join public.users u on u.id = v.owner_id
    where v.slug = venue_gallery.venue_slug
      and u.uid = auth.uid()::text
  )
  or exists (
    select 1
    from public.users u
    where u.uid = auth.uid()::text
      and lower(u.user_type) = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.venues v
    join public.users u on u.id = v.owner_id
    where v.slug = venue_gallery.venue_slug
      and u.uid = auth.uid()::text
  )
  or exists (
    select 1
    from public.users u
    where u.uid = auth.uid()::text
      and lower(u.user_type) = 'admin'
  )
);

drop policy if exists venue_gallery_owner_delete on public.venue_gallery;
create policy venue_gallery_owner_delete
on public.venue_gallery
for delete
to authenticated
using (
  exists (
    select 1
    from public.venues v
    join public.users u on u.id = v.owner_id
    where v.slug = venue_gallery.venue_slug
      and u.uid = auth.uid()::text
  )
  or exists (
    select 1
    from public.users u
    where u.uid = auth.uid()::text
      and lower(u.user_type) = 'admin'
  )
);
