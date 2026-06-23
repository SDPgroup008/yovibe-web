# Implementation Prompt: Purchase Flow Resilience (Retry + Payment Safety Net)

Copy everything below into your AI coding agent.

---

## Context

YoVibe is an Expo (SDK 52) + react-native-web app deployed to Netlify, using Supabase as the backend and PawaPay for mobile money payments. The ticket purchase flow currently runs roughly as:

1. Charge buyer via PawaPay (irreversible — money moves)
2. Calculate pricing
3. Generate QR code value
4. Upload QR code image to Cloudflare R2 (via a Netlify Function / R2Service)
5. Create the ticket row in Supabase's `tickets` table
6. Send confirmation email

**The problem:** we already had a real incident where step 1 succeeded (buyer was charged 500 UGX via PawaPay) but step 4 failed due to a transient network timeout. Steps 5 and 6 never ran. The result: a paying customer with no ticket, no record anywhere that this happened except scattered browser console logs, discovered by accident. We manually reconstructed and inserted the missing ticket row after the fact — this is not sustainable and must not be the only safety net going forward.

**Root cause:** payment confirmation (step 1, irreversible) and ticket fulfillment (steps 2–6, all of which can fail) are not decoupled or tracked independently. A failure anywhere from step 2 onward currently leaves zero trace that a successful payment is waiting to be fulfilled.

## What I need you to implement — two layers, scoped tightly. Do not refactor the rest of the purchase flow beyond what's described here.

### Layer 1: Retry logic on the QR upload step (and any other step that calls an external service after payment)

Wrap the QR-upload call (and ideally any other network call to an external service — R2 upload, the ticket-creation Supabase insert, the email send — that happens after payment confirmation) in a retry helper with a short backoff, instead of failing on the first transient error:

```js
async function withRetry(fn, { maxAttempts = 3, baseDelayMs = 1000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      console.warn(`Attempt ${attempt}/${maxAttempts} failed:`, err?.message || err);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
      }
    }
  }
  throw lastError;
}
```

Apply this specifically around:
- The R2 QR-code upload call (the one that failed in our real incident, with a 20-second client-side timeout — confirm whether that 20s timeout should be reduced now that retries exist, e.g. 3 attempts at a shorter individual timeout might recover faster than 1 attempt at 20s)
- The Supabase `tickets` insert
- The confirmation email send call (already has its own internal failure handling per our existing `send-ticket-email` function, but the *call* to it from the purchase flow should still be retried if the network request itself fails before reaching the function)

Do not silently swallow final failures after retries are exhausted — they must still surface to Layer 2 below, so the failure is recorded, not just logged to console and forgotten.

### Layer 2: A payment-confirmed safety-net table

Create a new Supabase table that records every confirmed payment **immediately upon payment confirmation, before attempting any of steps 2–6 above**. This must happen as close to the payment-confirmation step as possible, so even if everything after it fails catastrophically, this record still exists.

```sql
create table pending_ticket_fulfillments (
  id uuid primary key default gen_random_uuid(),
  payment_id text not null,
  pawapay_deposit_id text,
  buyer_email text not null,
  buyer_name text,
  buyer_id uuid references public.users(id),
  event_id text not null,
  event_name text,
  quantity integer not null default 1,
  amount double precision not null,
  status text not null default 'payment_confirmed'
    check (status in ('payment_confirmed', 'fulfilling', 'fulfilled', 'failed')),
  ticket_ids text[], -- populated once ticket(s) are successfully created
  last_error text,   -- populated if fulfillment fails, for debugging without digging through logs
  attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_pending_fulfillments_status on pending_ticket_fulfillments(status);
```

**Required behavior:**

1. **Immediately after PawaPay confirms `COMPLETED`** (and before generating QR codes, uploading anything, or inserting ticket rows), insert a row into `pending_ticket_fulfillments` with `status = 'payment_confirmed'`. Capture whatever buyer/event/amount data is already available at that point — this insert must be simple and fast, with minimal dependencies, since it's the actual safety net and must not itself be a likely point of failure.

2. **As fulfillment proceeds**, update this row's `status` to `'fulfilling'` once work starts, and increment `attempt_count` on each retry cycle.

3. **On full success** (ticket row(s) created, QR uploaded, email sent or at least attempted), update the row to `status = 'fulfilled'` and populate `ticket_ids` with the resulting ticket ID(s).

4. **On failure after retries are exhausted**, update the row to `status = 'failed'` and populate `last_error` with a concise error message (not a full stack trace — just enough to triage quickly). Do NOT throw an unhandled error that crashes the purchase flow at this point — payment already happened; the UI should inform the buyer their payment was received and their ticket is being finalized / will be followed up on, rather than showing a generic failure that implies the payment itself didn't work.

5. **User-facing messaging matters here:** if fulfillment ultimately fails after retries, the buyer should see a message like "Payment received — we're finalizing your ticket and will email it shortly. If you don't receive it within 30 minutes, contact support with this reference: [payment_id]." This must NOT say anything implying the payment failed or should be retried by the buyer, since that risks a double-charge.

### What I do NOT want in this pass

- Do not build the automatic recovery/retry sweep job yet (e.g. a scheduled function that finds `payment_confirmed` rows stuck for too long and retries them automatically) — that's a follow-up phase once this logging/safety-net layer is stable and proven.
- Do not change the PawaPay payment-charging logic itself — this is purely about what happens to tracking and retries *after* payment is already confirmed.
- Do not change pricing, commission calculation, or any other business logic untouched by this incident.

## Testing checklist — confirm before considering this done

- [ ] A normal, fully successful purchase still works end-to-end exactly as before, and a `pending_ticket_fulfillments` row ends up at `status = 'fulfilled'` with the correct `ticket_ids` populated
- [ ] Simulate a transient failure in the QR upload step (e.g. temporarily point it at a bad URL, or mock a timeout) → confirm the retry logic attempts multiple times before giving up, and check console/logs show clear attempt-by-attempt output
- [ ] Force a failure that exhausts all retries → confirm: (a) the buyer sees the non-alarming "payment received, finalizing" message, not an error implying payment failed; (b) the `pending_ticket_fulfillments` row is at `status = 'failed'` with a useful `last_error`; (c) no duplicate PawaPay charge is triggered
- [ ] Confirm the safety-net insert (step 1 of Layer 2) happens immediately after payment confirmation and does not itself depend on QR generation, R2, or any other step that has historically failed — test by intentionally breaking a later step and confirming the safety-net row still gets created first
- [ ] Query `select * from pending_ticket_fulfillments where status != 'fulfilled'` and confirm this gives a clear, actionable list of anything currently stuck — this is the manual recovery view to use until the automatic sweep (future phase) exists

Please implement this fully. If our actual purchase-flow code structure doesn't cleanly support inserting the safety-net record as early as described (e.g. payment confirmation and ticket creation are tightly coupled in a single function with no natural insertion point), flag this clearly and propose the minimal restructuring needed — don't silently work around it in a way that defeats the purpose of catching failures early.
