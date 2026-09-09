# YoVibe HMA staging certification report

Date: 2026-09-09  
Environment: `https://yovibe-stagging.netlify.app`  
Branch: `stagging`  
Assessment basis: HMA Ticket Sales Partnership Agreement (12 pages), scored against the requested amendments: 15% YoVibe commission, settlement after scan, organiser-initiated payout with organiser email OTP, direct pawaPay mobile-money payout, and admin-assisted PesaPal card payout.

## Executive decision

Current readiness is **89%**. This is a staging certification result, not a production go-live approval. Items 1–4 from the previous release-blocker list are now operator-confirmed as working, and the Expo/React Native modernization is complete on `stagging`. The remaining release conditions are the intentionally retained staging password, the HMA governance/amendment work, and capacity tuning after the high-rate Artillery run recorded timeouts.

The single approved UGX 500 MTN sandbox guest purchase completed payment verification, server-side ticket fulfillment, and guest navigation. The selected security photo did not attach in that run because the deployed client used a post-ticket upload token before a ticket existed. That path is now fixed in `c808e9617` (server-side data-URL upload to private R2, 4 MB/type validation, and regression coverage). No second payment was attempted by this assessment; subsequent staging certification of the flow was operator-confirmed.

## Section scores

| Agreement area | Score | Evidence and remaining gap |
|---|---:|---|
| Scope, appointment, event listing (Clauses 2-5) | 90% | Public event and ticket checkout work; organiser controls support price/inventory changes. HMA-specific listing, approved artwork, and inventory sign-off remain operational tasks. |
| Commission (Clause 6, amended to 15%) | 100% | Checkout displays 15%; server revenue split and tests calculate 15% commission. |
| Settlement and remittance (Clause 7, amended to after-scan) | 95% | Operator confirmed organiser OTP payout, pawaPay mobile-money payout, and admin-assisted PesaPal card payout. Scan-gated eligibility and idempotent callback protections remain covered by tests; retain processor reconciliation evidence for the HMA file. |
| Refunds, cancellations, chargebacks (Clause 8) | 95% | Operator confirmed the cancellation/postponement refund flow, guest authorization, and incomplete-installment behavior. Terms restrict refunds to cancellation/postponement and the endpoint uses anti-enumeration responses; retain one processor callback/reconciliation record. |
| Fraud prevention, QR, security photos, scanning (Clause 9) | 94% | Operator confirmed staff-link scanning and the guest security-photo flow. Signed QR/staff-token controls, private-R2 denial, generic-upload denial, and duplicate-scan protections pass automated tests. |
| Platform condition and reliability (Clause 10) | 84% | Expo SDK 57/React Native 0.86.3 modernization, web export, typecheck, 34 regression tests, staging guard, and read-only probes pass. The cached production audit reports 0 advisories. Artillery completed 2,060 requests with 2,030 responses and 30 socket timeouts (1.46%), exceeding the 1% error threshold; capacity tuning and a credentialed browser run remain required. |
| Customer support (Clause 11) | 98% | UptimeRobot is connected; email, WhatsApp, and always-available telephone support were confirmed by the operator. Add an HMA escalation rota and response-time evidence. |
| Branding, marketing, termination and governance (Clauses 12, 18, 22-23) | 82% | Operational controls and runbooks exist; HMA logo/artwork approval, termination checklist, notice register, and signed amendment are still governance deliverables. |
| Confidentiality and data protection (Clauses 13-14) | 78% | Private R2 separation, expiring references, access controls, and staging isolation are implemented. Complete the HMA data-sharing/retention record, breach contacts, and Uganda Data Protection Act processor/controller documentation. |
| Reporting, audit, warranties and risk allocation (Clauses 7.5-7.6, 10, 15-17, 19-21) | 75% | Sales/reconciliation structures and operational documentation exist. Produce a signed HMA settlement report template, audit export, incident evidence pack, and final commercial amendment. |

Overall readiness: **89%** (unweighted mean of the ten section scores; rounded from 89.1%).

## Test results

### Functional and security

- 9 Jest suites, 34 tests: all passed.
- TypeScript typecheck: passed.
- Staging safety scan: passed across 294 repository files; no production identifiers or committed secrets found.
- Security probe: 11/11 passed. Expected results included staging edge redirect 302, protected functions 401, unsigned pawaPay callbacks 401, and private R2 anonymous access denied (400 from the unsigned S3 request).
- Guest checkout: one approved UGX 500 MTN sandbox purchase; payment and ticket fulfillment completed. The guest's authenticated ticket list remained empty, which is expected for an unauthenticated buyer; email delivery is the delivery channel and must be confirmed by the buyer or provider logs.
- Guest security photo: failed on the pre-fix deployment; fixed and covered by PNG/JPEG/WebP and oversize regression tests. A live post-fix photo purchase was intentionally not repeated because only one payment was authorized.
- Refunds: scheduled-event guest request returned the generic anti-enumeration response; policy and incomplete-installment tests passed. The assessment run initiated no live refund; the operator subsequently confirmed the cancelled/postponed and incomplete-installment flows.
- Operator confirmation: release-blocker items 1–4 (staff scan/payout, both payout rails, refunds/incomplete-installment refunds, and email delivery) were subsequently tested successfully in staging.
- Expo modernization: SDK 57.0.21, React Native 0.86.3, React 19.2.3, compatible Expo modules, Jest Expo 57, and TypeScript 6 are aligned; six SDK-compatibility type errors were corrected.
- Netlify install isolation: `.npmrc` enables the tested legacy peer resolver for the staging build; this only affects dependency installation on `stagging` and does not alter production.

### Performance (staging only, read-only)

The HTTP harness is hard-coded to the staging hostname and only calls `GET /events` and `GET /.netlify/functions/health`.

| Profile | Result |
|---|---|
| Sustained browser load | 50/50 pages rendered; 0 functional failures; one navigation timeout later rendered. p50 5.82 s, p95 21.06 s. |
| HTTP load | 100 requests at concurrency 5; 100/100 valid health contracts; p50 0.92 s, p95 2.42 s, max 6.64 s; 4.06 req/s. Health returned expected 503 because the deliberately short staging access password is retained. |
| HTTP stress ramp | 10, 20, 40, and 60 requests at concurrency 5, 10, 20, and 30; all valid; highest stage p95 2.09 s, max 2.56 s, 19.67 req/s. |
| HTTP spike | 50 concurrent health requests; 50/50 valid; p95 2.39 s, max 3.19 s, 15.64 req/s. |
| Edge-gate spike | 50 `/events` requests at concurrency 25; 50/50 correct 302 responses; p95 0.32 s. |

These are certification probes, not a guarantee of peak public-event capacity. Repeat with a dedicated k6/Artillery runner and agreed traffic model before the HMA sale opens.

The dedicated Artillery profile (`tests/load/staging-artillery.yml`) ran warm-up, sustained ramp, and spike phases against only `/events` and `/health`. It completed 2,030 of 2,060 requests successfully; 30 requests timed out or reset, producing a measured 1.46% failure rate. p95 was approximately 1.30 seconds and p99 approximately 1.83 seconds for completed responses. The run is a useful staging capacity signal but does not yet meet the configured 1% error budget.

### POST endpoint certification and provider doubles

POST endpoints are covered without creating financial or business records:

- `npm run test:staging-post-contract` sends invalid, empty, unsigned, or staging-gated payloads to payment initiation, fulfillment, refund, scan, photo, upload, and callback functions. All 13/13 contracts passed; no payment, payout, refund, ticket, scan, or photo mutation was attempted.
- `npm run test:staging-mocked-post` runs warmup, sustained, stress, and spike traffic against a local in-memory provider double. 1,640/1,640 requests passed (0% failures); p99 was 247 ms warmup, 38 ms sustained, 108 ms stress, and 364 ms spike. The duplicate-scan invariant returned 200 then 409 for a replayed synthetic ticket.

These tests validate request contracts, idempotency, duplicate handling, and client/provider behavior. A real sandbox payment or payout remains separately approved because it creates an external transaction and may send SMS or email.

The read-only rate-ladder runner (`npm run test:staging-rate-ladder`) stops at the first threshold breach. A 5 req/s, 5-second staging run had 0 request failures but p95 3.25 s and p99 3.27 s, so it stopped before higher rates. This indicates cold-start or platform queue latency, not a correctness failure. The staging-only tuning procedure, attribution checklist, and two-consecutive-pass release gate are documented in [`docs/STAGING_CAPACITY_TUNING_RUNBOOK.md`](STAGING_CAPACITY_TUNING_RUNBOOK.md).

### Isolation

- Staging Netlify project is Git-backed from `stagging` only and published at the staging domain.
- Dependency-hardening staging deploy was verified ready from commit `248693dc4` (`Harden staging dependencies and update readiness`).
- Production deploy remained unchanged during testing: deploy `6a9918e0e981470008699ca5`, commit `94d3c6686171a44cfd4035a2a7a8226820abc47a`.
- No production database, R2 object, payment, payout, email, domain, or deployment mutation was performed.

## Release blockers and actions

1. **Closed by operator confirmation:** organiser staff-link generation/scan, duplicate-scan handling, payout eligibility, and organiser OTP payout.
2. **Closed by operator confirmation:** pawaPay mobile-money payout and admin-assisted PesaPal card payout, including callback/idempotency checks.
3. **Closed by operator confirmation:** cancelled/postponed guest refunds and incomplete-installment refunds; retain processor reconciliation evidence.
4. **Closed by operator confirmation:** ticket email delivery.
5. **Completed on `stagging`:** Expo/React Native modernization and dependency hardening are installed and tested. Keep a scheduled online audit and review the temporary overrides during future Expo upgrades.
6. **Capacity follow-up:** Artillery’s high-rate phase exceeded the 1% timeout budget (1.46%), and the rate ladder observed p95 3.25 s at 5 req/s. Use the ladder to find the knee, then inspect Netlify function duration/concurrency, Supabase query latency/connection usage, and provider response times. Apply only staging changes first: cache public reads, add missing indexes, reduce cold-start work, queue non-critical email/photo processing, and use bounded retries with 429 back-pressure. Rerun until failure rate is ≤1% and p95/p99 meet the agreed thresholds; if the knee is below the HMA traffic forecast, lower burst size or add Netlify/Supabase capacity before launch.
7. Replace the intentionally short staging password with a unique 16+ byte value before any external staging access. The current value was preserved at the operator's request and is why health reports 503.
8. Finalize and sign the written HMA amendment covering 15% commission, after-scan settlement, refund eligibility/time window, data sharing, support escalation, and termination/notice controls.

## Reproducible commands

```text
npm test -- --runInBand
npm run typecheck
npm run staging:scan
npm run test:staging-security
npm run test:staging-performance
npm run test:staging-post-contract
npm run test:staging-mocked-post
STAGING_RATE_DURATION_SECONDS=10 npm run test:staging-rate-ladder
```

The performance, rate-ladder, and security scripts refuse non-staging hosts. POST contract checks use invalid/unsigned payloads only; the provider-double test is local and in-memory. None of these commands calls a real payment, payout, refund, or scan mutation path.
