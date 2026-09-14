# YoVibe — Operations Runbook & HMA Go-Live Checklist

Phase 4 (breach response) + Phase 5 (release gate) reference. Keep this with the
project; update as the platform evolves.

---

## 1. Breach-response runbook (DPPA 2019, Cl. 12.9 of the Terms)

**Triggers:** unauthorised access to personal data, exposed credentials, a
confirmed payment/refund anomaly, or any `health.js` `503` that persists.

1. **Contain (0–2 h).** Rotate the affected secret immediately (PawaPay/PesaPal
   keys, `QR_HMAC_SECRET`, R2/Supabase service keys). Disable the exposed
   function/endpoint if needed. Preserve logs (Netlify function logs, R2,
   Supabase audit).
2. **Assess (2–24 h).** Determine scope: which personal data (buyer names,
   emails, phones, security photos), how many records, and whether payment
   systems were involved. Check `health.js` missing-env output and Sentry.
3. **Notify (without undue delay).** Per Cl. 12.9: notify affected users via
   their contact details on file, and the relevant supervisory authority where
   required under DPPA 2019. Describe the nature, recommended mitigations, and
   contact point (support@yovibe.net).
4. **Remediate.** Apply the fix, redeploy, re-run the release-gate checklist
   below. If the leak involved a committed credential, treat it as
   compromised (rotation = mandatory).
5. **Post-incident.** Record the incident (date, scope, action), adjust the
   runbook, and review with the team.

**Key contacts:** platform owner, DPPA data-protection officer (if appointed),
support@yovibe.net.

---

## 2. HMA go-live checklist (Phase 5.4) — sign each line

### Database (Supabase)
- [ ] Migration `202608291200_inventory_integrity.sql` applied (create_tickets_batch RPC).
- [ ] Migration `202608291300_payout_integrity.sql` applied (payout_config, payouts.event_id, clawback_amount).
- [ ] `payout_otps` table exists (used by the OTP edge function).
- [ ] Confirm `create_tickets_batch` executes: `select public.create_tickets_batch('test-event', '[]'::jsonb);`

### Payments & webhooks
- [ ] PesaPal IPN registered: `a1f9745f-bc6b-4da8-aa83-da71152e45b1` → `https://yovibe.net/.netlify/functions/pesapal-ipn` (Active).
- [ ] PawaPay callback URLs saved: deposit / refund / payout / checkout → `…/pawapay-deposit-callback`, `…/pawapay-refund-callback`, `…/pawapay-payout-callback`, `…/pawapay-checkout-callback`.
- [ ] Signed-callback decision made; `PAWAPAY_SIGNED_CALLBACKS` matches the PawaPay dashboard toggle.

### Infrastructure
- [ ] Cloudflare WAF Skip rule for `/.netlify/functions/` active (bot fight/managed rules bypassed); SSL = Full (strict).
- [ ] `https://yovibe.net/.netlify/functions/health` returns 200 and all env vars SET.
- [ ] Netlify env vars match the inventory: PesaPal live keys + `PESAPAL_API_URL=https://pay.pesapal.com/v3/api`, `PESAPAL_NOTIFICATION_ID`, `PAWAPAY_API_KEY`, `QR_HMAC_SECRET`, `R2_*`, `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `ZEPTOMAIL_TOKEN`, `SITE_URL=https://yovibe.net`, `SENTRY_DSN`.
- [ ] Sentry DSN set; one test error visible in Sentry.

### HMA event configuration
- [ ] Event created with 15% commission default (no override needed — matches code).
- [ ] `payout_config` set for the event (recipient per the amended agreement).
- [ ] Entry fees + `maxTickets`/seat maps configured; inventory enforced by `create_tickets_batch`.
- [ ] Scanner staff accounts created; door-validation devices ready (offline QR verification tested).

### End-to-end drill (record results)
- [ ] One real purchase via mobile money → ticket email received, QR scans at validation.
- [ ] One real purchase via card → same.
- [ ] One refund (event-cancellation reason) → ticket refunded, `payout_eligible=false`, clawback logic verified.
- [ ] One payout (MM) via the server path with OTP → tickets marked paid, payout record + receipt.
- [ ] Oversell check: a sold-out fee type rejects with "sold out".
- [ ] `npm test`, `npm run typecheck`, `npm run build:web` all green.

### Legal (agreement amendments)
- [ ] Commission 10% → 15% and NWA-remittance removal reflected in the signed agreement (per the session's counsel review).
- [ ] Outstanding Cl. 8.1 refund-policy term settled and recorded.
- [ ] Notice addresses in Cl. 22 verified.

Signed: _____  Date: _____

---

## 3. Merchant-of-record & chargeback allocation (draft amendment — Cl. 9.5)

**9.5 Merchant of Record and Chargebacks.**

**(a) Merchant of Record.** The Platform (Alutrey) is the merchant of record for card transactions
processed through the Platform's PesaPal integration, and the contracting party with PawaPay for
mobile-money transactions. Neither HiPipo nor NWA is a party to, or liable under, those processor
agreements.

**(b) Allocation of Chargeback Loss.** A chargeback is the reversal of a completed card payment by the
purchaser's issuing bank. Chargeback losses are allocated as follows:

(i) **Alutrey bears** the loss (including any card-network, processor, or administrative fees) where the
chargeback arises from a defect, security failure, or processing error of the Platform, or from fraud
attributable to the Platform's systems — consistent with Cl. 9.4(a) and Cl. 16.1(b).

(ii) **HiPipo/NWA bears** the loss (including any card-network, processor, or administrative fees) where
the chargeback arises from event cancellation, postponement, material misdescription, or failure to
deliver the Event as advertised, or from any other act or omission of HiPipo/NWA or the venue —
consistent with Cl. 9.4(b).

(iii) Where the cause is disputed or mixed, the parties shall attribute the loss in proportion to their
respective fault; failing agreement, the matter proceeds under Cl. 20–21 (dispute resolution).

**(c) Recovery Mechanism.** Each party shall notify the other in writing within 5 Business Days of
becoming aware of a chargeback, supplying the purchaser's name, ticket reference, and the processor's
chargeback reference. Recoverable chargeback losses shall be set off against the next payment of proceeds
or commission otherwise payable to the party bearing the loss under this Agreement; the Platform shall not
be required to refund or re-pay a chargeback already processed as a purchaser refund where the underlying
cause is allocated to HiPipo/NWA under (b)(ii).

**(d) Effect on Commission.** Consistent with Cl. 8.3, no Sales Commission is retained on tickets that are
the subject of a successful chargeback; where commission has already been credited, it is clawed back
against subsequent proceeds.

**(e) Verification.** A chargeback is deemed valid only where evidenced by the processor's chargeback
documentation; the parties shall cooperate reasonably in contesting chargebacks and in providing
purchaser, transaction, and delivery evidence.

---

## 4. Monitored endpoints & schedules

| Endpoint / schedule | Purpose |
|---|---|
| `/.netlify/functions/health` (GET) | Uptime/env check — wire an external uptime monitor to it |
| `process-stuck-fulfillments` (every 5 min) | Stranded-purchase retry |
| `purge-expired-photos` (daily 04:00) | DPPA photo-retention purge |
| `pesapal-ipn`, `pawapay-*-callback` | Payment webhooks — watch logs for `Signature verification failed` |
| Sentry | Client-side error tracking |
