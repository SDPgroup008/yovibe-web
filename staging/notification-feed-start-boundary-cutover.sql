begin;

-- Browser clients now receive broadcasts only through notification-feed.
drop policy if exists "Allow public read broadcast notifications" on public.notifications;
revoke select on table public.notifications from anon;
grant select on table public.notifications to authenticated;

commit;
