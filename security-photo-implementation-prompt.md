# Implementation Prompt: Per-Ticket Security Photo (Multi-Ticket & Table Support)

Copy everything below into your AI coding agent.

---

## Context

YoVibe is an Expo (SDK 52) + react-native-web app deployed to Netlify, using Supabase as the backend. We already have a working **optional security photo feature**: a buyer can take a photo during purchase, it's stored on the ticket (`tickets.buyer_photo_url`), and at the gate, scanning the QR code shows that photo to staff so they can visually confirm the person presenting the ticket is the rightful holder before marking it used. This exists to stop ticket theft/resale fraud where a stolen QR is scanned before the real owner arrives.

**The problem we're solving now:** this worked fine for single-ticket purchases, but breaks down for `quantity > 1` purchases and table bookings, where **one buyer pays, but multiple separate tickets get generated — one per attendee** (this is our existing model; each ticket is independently scannable, not one shared QR). The photo needs to belong to **the specific attendee of each individual ticket**, not the buyer, since the buyer usually isn't the one presenting every ticket at the gate.

## Current relevant schema (Supabase `tickets` table)

Key columns already in place: `id` (text, e.g. `ticket_<timestamp>_<random>`), `event_id`, `event_name`, `buyer_id`, `buyer_name`, `buyer_email`, `quantity`, `qr_code`, `qr_code_data_url` (a hosted Cloudflare R2 URL, not base64), `buyer_photo_url`, `status`, `is_scanned`, `scanned_at`, `event_start_time`.

You will need to add:
```sql
alter table tickets add column photo_upload_token text;
alter table tickets add column photo_upload_token_expires_at timestamptz;
```

Flag clearly if any other column name in this prompt doesn't match what you find in the actual schema — do not silently assume a mismatch is fine and proceed; ask or surface the discrepancy. We have been repeatedly burned by silent column-name/casing mismatches (e.g. `payout_status` vs `payoutStatus`) causing production failures, so confirm real column names against the live schema before writing queries against them.

## What I need you to implement

### 1. Per-ticket photo capture link, sent to the actual attendee (not the buyer)

When tickets are distributed by individual email (per our separate ticket-distribution feature — each ticket can be addressed to a different attendee's email), each ticket's confirmation email should include a **second, optional link** distinct from the main "view your ticket" content:

> "Optional: add a quick photo to this ticket for extra security at the gate"

This link must go to **whichever email address is actually attached to that specific ticket row** (the attendee), not the original buyer's email — even when the buyer paid for everyone. If a purchase used the "send all tickets to one email" option instead, all links naturally go to that one buyer email, which is expected and fine.

### 2. Generate a signed, single-purpose, expiring token per ticket

At ticket-creation time, generate and store on each ticket row:
- `photo_upload_token`: a random UUID (use the existing `uuid` package already in our dependencies)
- `photo_upload_token_expires_at`: set to the event's `event_start_time` — the link should stop working once the event has started, since there's no legitimate reason to add a security photo after that point

The link format should be:
```
https://yovibe.net/add-photo?ticket=<ticket_id>&token=<photo_upload_token>
```

### 3. Build a public, no-login-required page at `/add-photo`

This route must:
- Read `ticket` and `token` from the query string
- Validate the token against the ticket row server-side (via a Postgres RPC function — see below — never via a raw client-side table read/write, since that would let anyone bypass validation by calling the Supabase REST API directly)
- Show one of these states clearly to the visitor: loading → valid (show camera/upload capture UI) → invalid (bad/mismatched token) → expired (event already started) → done (photo successfully attached)
- On successful capture, upload the photo to Supabase Storage and update `tickets.buyer_photo_url` for that specific ticket **only**

### 4. Enforce the security boundary in the database, not just in app code

Create a Postgres RPC function so token validation and the resulting update happen atomically and server-side:

```sql
create or replace function add_ticket_security_photo(
  p_ticket_id text,
  p_token text,
  p_photo_url text
) returns boolean
language plpgsql
security definer
as $$
declare
  v_valid boolean;
begin
  select (photo_upload_token = p_token and photo_upload_token_expires_at > now())
  into v_valid
  from tickets
  where id = p_ticket_id;

  if not v_valid then
    return false;
  end if;

  update tickets
  set buyer_photo_url = p_photo_url
  where id = p_ticket_id;

  return true;
end;
$$;
```

The frontend must call this via `supabase.rpc('add_ticket_security_photo', { p_ticket_id, p_token, p_photo_url })` — it must never perform a direct `.update()` call on the `tickets` table from this public page. Confirm Row Level Security on `tickets` does not allow anonymous direct updates that could bypass this function; if RLS currently allows broader anonymous write access than intended, flag it — that's a security gap independent of this feature.

### 5. Lock down the Storage bucket too

Set up (or confirm) a `ticket-photos` bucket in Supabase Storage with policies that prevent anonymous users from overwriting or reading photos belonging to tickets they have no token for. At minimum, uploads from this public page should be scoped to a path that includes the ticket ID (e.g. `security-photos/${ticketId}.jpg`) and should use `upsert: true` only for that specific ticket's path — never allow a path/filename to be supplied freely by the client without validating it matches the validated `ticket_id` from the RPC call above.

### 6. Gate-scanning logic — confirm this exact state machine (do not deviate)

This is already partially built; confirm/implement it precisely as follows, since the order of operations matters for security correctness:

```
Scan QR
  │
  ▼
Is ticket valid? (exists, status active, not already scanned, not expired)
  │
  ├── NO  → Deny access. Ticket remains unscanned. Show "Invalid ticket."
  │
  └── YES → Does ticket.buyer_photo_url exist?
             │
             ├── NO  → Grant access immediately. Mark ticket as used (is_scanned = true, scanned_at = now()).
             │
             └── YES → Display buyer_photo_url to staff. Do NOT mark as used yet.
                        │
                        ├── Staff confirms MATCH    → Grant access. NOW mark ticket as used.
                        │
                        └── Staff confirms NO MATCH → Deny access. Ticket remains unscanned/unused.
                                                       Show a minimal denial message only
                                                       (e.g. "Photo mismatch — access denied") —
                                                       do NOT reveal the attendee's name or any
                                                       other ticket details on this denial screen,
                                                       to avoid helping a second impersonation attempt.
```

**Critical correctness requirement:** marking a ticket as `is_scanned = true` must happen ONLY at the final "grant access" step in each branch — never at the initial QR-read step. If the current implementation marks tickets as scanned immediately upon QR read (before the photo-confirmation step resolves), this is a bug and must be fixed: it would let a stolen ticket get marked "used" even when access was ultimately denied for a photo mismatch, permanently locking out the real attendee.

### 7. Testing checklist — confirm all of these before considering this done

- [ ] Single-ticket purchase (quantity 1), buyer adds photo at checkout → gate scan shows photo, match grants entry and marks ticket used, mismatch denies entry and leaves ticket unscanned
- [ ] Multi-ticket purchase (quantity > 1) distributed to separate attendee emails → each attendee receives their own "add a photo" link, scoped only to their own ticket
- [ ] An attendee uses their photo-upload link → only their specific ticket's `buyer_photo_url` is updated; verify no other ticket from the same order is affected
- [ ] Token reuse/tampering: manually altering the `token` query param to a wrong/random value → page shows "invalid," no update occurs
- [ ] Expired link: attempting to use the link after `event_start_time` has passed → page shows "expired," no update occurs
- [ ] Ticket with no photo attached (attendee skipped the optional step) → gate scan behaves exactly as it did before this feature existed: valid QR grants entry directly, no photo step shown
- [ ] Table booking scenario: host books a table for 5, some seats' attendees are added later (per our existing "add guest to table" flow) → confirm each newly added seat still gets its own valid, correctly scoped photo-upload link once an email is attached to it
- [ ] Direct API attempt: try calling Supabase's REST API directly to update `buyer_photo_url` without going through the RPC function → confirm this is blocked by RLS, not just by app-level logic being the only thing stopping it

Please implement this fully. Ask before assuming column names, RLS policy specifics, or Storage bucket configuration that you haven't directly verified against our actual Supabase project — flag any mismatch rather than silently working around it.
