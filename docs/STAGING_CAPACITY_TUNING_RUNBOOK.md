# Staging capacity tuning runbook

This runbook is restricted to `https://yovibe-stagging.netlify.app`. It is
designed to improve the staging capacity signal without touching `main`, the
production Netlify site, production Supabase, or live payment providers.

## 1. Establish the knee

Run the read-only ladder with a short duration first, then repeat the failing
step for 60 seconds:

```powershell
$env:STAGING_RATE_DURATION_SECONDS = '10'
$env:STAGING_RATE_LADDER = '5,10,20,30,40'
npm run test:staging-rate-ladder
```

The knee is the highest rate whose failure rate is at most 1%, p95 is at most
3 seconds, and p99 is at most 5 seconds. The runner stops at the first breach
so a higher rate cannot hide the limiting stage.

## 2. Attribute the bottleneck

For the failing step, capture Netlify function duration/concurrency and error
logs, Supabase query latency/connection usage, and provider latency/error codes.
Classify each request as a cold start, database wait, provider wait, or client
timeout. Do not include secrets or customer data in the evidence pack.

## 3. Apply staging-only changes

Use the smallest change that addresses the measured class:

- cache public event/catalog reads with a short, purgeable TTL;
- add or validate indexes for event, ticket, fulfillment, refund, and payout
  lookup keys;
- move email/photo processing to the existing queues and keep request paths
  bounded;
- reuse clients and reduce cold-start imports in functions;
- use bounded exponential backoff for provider 5xx/timeouts and return 429
  with `Retry-After` when the service is saturated;
- if the knee remains below the HMA forecast, reduce burst size or provision
  the required Netlify/Supabase capacity before launch.

Never solve a capacity failure by disabling authorization, idempotency,
callback signatures, R2 privacy, or the staging gate.

## 4. Re-certify

After each staging-only change, run the full safe suite:

```powershell
npm test -- --runInBand
npm run typecheck
npm run staging:scan
npm run test:staging-security
npm run test:staging-post-contract
npm run test:staging-mocked-post
$env:STAGING_RATE_DURATION_SECONDS = '60'
npm run test:staging-rate-ladder
```

Record the rate, request count, failure rate, p95/p99, deploy ID, and change
set. Capacity is release-ready only when the agreed HMA traffic model passes
the ≤1% error budget and latency thresholds on two consecutive runs.
