-- Server-authoritative ticket hardening.
-- Apply to staging only after the matching application deploy is published and
-- guest checkout/photo/resend/scanner tests have passed. This script is safe
-- to run in one transaction and contains no ticket-data mutation.

begin;

-- Keep the old view during the compatibility period, but make it obey caller
-- permissions and remove every browser role's access to it.
alter view public.tickets_api set (security_invoker = true);
revoke all on table public.tickets_api from public, anon, authenticated;

-- Ticket rows are never public. Signed-in buyers may read only their own rows
-- through the RLS policy below; all writes are server-side.
revoke all on table public.tickets from public, anon;
revoke insert, update, delete on table public.tickets from authenticated;
grant select on table public.tickets to authenticated;
grant select, insert, update, delete on table public.tickets to service_role;

drop policy if exists "Anyone can read tickets" on public.tickets;
drop policy if exists "Anyone can update tickets" on public.tickets;
drop policy if exists "Authenticated users can insert tickets" on public.tickets;
drop policy if exists "tickets_select_own_buyer" on public.tickets;

create policy "tickets_select_own_buyer"
on public.tickets
for select
to authenticated
using (
  buyer_id is not null
  and exists (
    select 1
    from public.users u
    where u.id::text = tickets.buyer_id::text
      and u.uid::text = (select auth.uid()::text)
  )
);

-- Only server-side fulfillment may create ticket rows or reserve installment
-- inventory. The guest photo capability moves to buyer-photo-access.
revoke all on function public.create_tickets_batch(text, jsonb) from public, anon, authenticated;
revoke all on function public.create_tickets_batch(text, jsonb, uuid[], text, uuid) from public, anon, authenticated;
revoke all on function public.reserve_installment_inventory(uuid, uuid) from public, anon, authenticated;
revoke all on function public.add_ticket_security_photo(text, text, text) from public, anon, authenticated;
grant execute on function public.create_tickets_batch(text, jsonb) to service_role;
grant execute on function public.create_tickets_batch(text, jsonb, uuid[], text, uuid) to service_role;
grant execute on function public.reserve_installment_inventory(uuid, uuid) to service_role;

-- Guest checkout still needs only these narrowly scoped inventory capabilities.
revoke all on function public.acquire_inventory_hold(text, text, text, integer, text, integer) from public, anon, authenticated;
revoke all on function public.acquire_seat_hold(text, text, integer, text, integer) from public, anon, authenticated;
revoke all on function public.release_inventory_hold(uuid, text) from public, anon, authenticated;
revoke all on function public.release_inventory_holds(text, text) from public, anon, authenticated;
revoke all on function public.release_seat_holds(text, text) from public, anon, authenticated;
revoke all on function public.get_held_seats(text, text, text) from public, anon, authenticated;
revoke all on function public.get_held_tables(text, text, text) from public, anon, authenticated;
grant execute on function public.acquire_inventory_hold(text, text, text, integer, text, integer) to anon, authenticated;
grant execute on function public.acquire_seat_hold(text, text, integer, text, integer) to anon, authenticated;
grant execute on function public.release_inventory_hold(uuid, text) to anon, authenticated;
grant execute on function public.release_inventory_holds(text, text) to anon, authenticated;
grant execute on function public.release_seat_holds(text, text) to anon, authenticated;
grant execute on function public.get_held_seats(text, text, text) to anon, authenticated;
grant execute on function public.get_held_tables(text, text, text) to anon, authenticated;

-- All retained security-definer functions use fully-qualified public objects.
-- An empty search path prevents caller-controlled object shadowing.
alter function public.acquire_inventory_hold(text, text, text, integer, text, integer) set search_path = '';
alter function public.acquire_seat_hold(text, text, integer, text, integer) set search_path = '';
alter function public.release_inventory_hold(uuid, text) set search_path = '';
alter function public.release_inventory_holds(text, text) set search_path = '';
alter function public.release_seat_holds(text, text) set search_path = '';
alter function public.get_held_seats(text, text, text) set search_path = '';
alter function public.get_held_tables(text, text, text) set search_path = '';
alter function public.create_tickets_batch(text, jsonb) set search_path = '';
alter function public.create_tickets_batch(text, jsonb, uuid[], text, uuid) set search_path = '';
alter function public.reserve_installment_inventory(uuid, uuid) set search_path = '';
alter function public.add_ticket_security_photo(text, text, text) set search_path = '';

commit;
