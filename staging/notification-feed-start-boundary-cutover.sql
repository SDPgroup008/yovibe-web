begin;

-- Browser clients now receive broadcasts only through notification-feed.
drop policy if exists "Allow public read broadcast notifications" on public.notifications;
drop policy if exists "Allow creation of notifications" on public.notifications;
drop policy if exists "Allow users to update own notifications" on public.notifications;

-- Keep notification creation and mutation server-only. Authenticated users
-- retain read access through the existing own-notification policy.
revoke all on table public.notifications from public, anon, authenticated;
grant select on table public.notifications to authenticated;
grant select, insert, update, delete on table public.notifications to service_role;

commit;
