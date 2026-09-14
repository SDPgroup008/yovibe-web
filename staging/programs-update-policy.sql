-- Run once in the production Supabase SQL Editor (and in staging if needed).
-- This allows only the venue owner or an admin to update weekly programs.
-- Public SELECT access remains unchanged.

drop policy if exists venues_update_authorized on public.venues;

create policy venues_update_authorized
on public.venues
for update
to authenticated
using (
  owner_id = auth.uid()
  or owner_id = public.current_profile_id()
  or public.current_user_is_admin()
)
with check (
  owner_id = auth.uid()
  or owner_id = public.current_profile_id()
  or public.current_user_is_admin()
);
