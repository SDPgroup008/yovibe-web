# YoVibe HMA staging certification report

Date: 2026-09-09  
Environment: `https://yovibe-stagging.netlify.app`  
Branch: `stagging`  
Assessment basis: HMA Ticket Sales Partnership Agreement (12 pages), scored against the requested amendments: 15% YoVibe commission, settlement after scan, organiser-initiated payout with organiser email OTP, direct pawaPay mobile-money payout, and admin-assisted PesaPal card payout.

## Executive decision

Current readiness is **90%**. This is a staging certification result, not a production go-live approval. Items 1–4 from the previous release-blocker list are now operator-confirmed as working. The remaining release conditions are the intentionally retained staging password, final HMA governance/amendment work, and a dedicated production-scale capacity run.

The single approved UGX 500 MTN sandbox guest purchase completed payment verification, server-side ticket fulfillment, and guest navigation. The selected security photo did not attach in that run because the deployed client used a post-ticket upload token before a ticket existed. That path is now fixed in `c808e9617` (server-side data-URL upload to private R2, 4 MB/type validation, and regression coverage). No second payment was attempted by this assessment; subsequent staging certification of the flow was operator-confirmed.

## Section scores

| Agreement area | Score | Evidence and remaining gap |
|---|---:|---|
| Scope, appointment, event listing (Clauses 2-5) | 90% | Public event and ticket checkout work; organiser controls support price/inventory changes. HMA-specific listing, approved artwork, and inventory sign-off remain operational tasks. |
| Commission (Clause 6, amended to 15%) | 100% | Checkout displays 15%; server revenue split and tests calculate 15% commission. |
| Settlement and remittance (Clause 7, amended to after-scan) | 95% | Operator confirmed organiser OTP payout, pawaPay mobile-money payout, and admin-assisted PesaPal card payout. Scan-gated eligibility and idempotent callback protections remain covered by tests; retain processor reconciliation evidence for the HMA file. |
| Refunds, cancellations, chargebacks (Clause 8) | 95% | Operator confirmed the cancellation/postponement refund flow, guest authorization, and incomplete-installment behavior. Terms restrict refunds to cancellation/postponement and the endpoint uses anti-enumeration responses; retain one processor callback/reconciliation record. |
| Fraud prevention, QR, security photos, scanning (Clause 9) | 94% | Operator confirmed staff-link scanning and the guest security-photo flow. Signed QR/staff-token controls, private-R2 denial, generic-upload denial, and duplicate-scan protections pass automated tests. |
| Platform condition and reliability (Clause 10) | 90% | Web export succeeds with the required Node heap, typecheck, 34 regression tests, staging guard, and read-only load/stress/spike probes pass. The dependency hardening resolves the cached production audit to 0 advisories. Browser-render stress still hit the 180-second harness ceiling during the 10-client stage, so dedicated capacity testing remains required. |
| Customer support (Clause 11) | 98% | UptimeRobot is connected; email, WhatsApp, and always-available telephone support were confirmed by the operator. Add an HMA escalation rota and response-time evidence. |
| Branding, marketing, termination and governance (Clauses 12, 18, 22-23) | 82% | Operational controls and runbooks exist; HMA logo/artwork approval, termination checklist, notice register, and signed amendment are still governance deliverables. |
| Confidentiality and data protection (Clauses 13-14) | 78% | Private R2 separation, expiring references, access controls, and staging isolation are implemented. Complete the HMA data-sharing/retention record, breach contacts, and Uganda Data Protection Act processor/controller documentation. |
| Reporting, audit, warranties and risk allocation (Clauses 7.5-7.6, 10, 15-17, 19-21) | 75% | Sales/reconciliation structures and operational documentation exist. Produce a signed HMA settlement report template, audit export, incident evidence pack, and final commercial amendment. |

Overall readiness: **90%** (unweighted mean of the ten section scores; rounded from 89.7%).

## Test results

### Functional and security

- 9 Jest suites, 34 tests: all passed.
- TypeScript typecheck: passed.
- Staging safety scan: passed across 287 repository files; no production identifiers or committed secrets found.
- Security probe: 11/11 passed. Expected results included staging edge redirect 302, protected functions 401, unsigned pawaPay callbacks 401, and private R2 anonymous access denied (400 from the unsigned S3 request).
- Guest checkout: one approved UGX 500 MTN sandbox purchase; payment and ticket fulfillment completed. The guest's authenticated ticket list remained empty, which is expected for an unauthenticated buyer; email delivery is the delivery channel and must be confirmed by the buyer or provider logs.
- Guest security photo: failed on the pre-fix deployment; fixed and covered by PNG/JPEG/WebP and oversize regression tests. A live post-fix photo purchase was intentionally not repeated because only one payment was authorized.
- Refunds: scheduled-event guest request returned the generic anti-enumeration response; policy and incomplete-installment tests passed. The assessment run initiated no live refund; the operator subsequently confirmed the cancelled/postponed and incomplete-installment flows.
- Operator confirmation: release-blocker items 1–4 (staff scan/payout, both payout rails, refunds/incomplete-installment refunds, and email delivery) were subsequently tested successfully in staging.

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

### Isolation

- Staging Netlify project is Git-backed from `stagging` only and published at the staging domain.
- Latest staging deploy is ready from commit `248693dc4` (`Harden staging dependencies and update readiness`).
- Production deploy remained unchanged during testing: deploy `6a9918e0e981470008699ca5`, commit `94d3c6686171a44cfd4035a2a7a8226820abc47a`.
- No production database, R2 object, payment, payout, email, domain, or deployment mutation was performed.

## Release blockers and actions

1. **Closed by operator confirmation:** organiser staff-link generation/scan, duplicate-scan handling, payout eligibility, and organiser OTP payout.
2. **Closed by operator confirmation:** pawaPay mobile-money payout and admin-assisted PesaPal card payout, including callback/idempotency checks.
3. **Closed by operator confirmation:** cancelled/postponed guest refunds and incomplete-installment refunds; retain processor reconciliation evidence.
4. **Closed by operator confirmation:** ticket email delivery.
5. **Completed on `stagging`:** direct UUID upgraded to 11.1.1; patched overrides pin `undici` 6.28.0, `tar` 7.5.22, and `@xmldom/xmldom` 0.8.14. `npm audit --offline --omit=dev` now reports 0 advisories. Keep a scheduled online audit and plan the Expo/React Native major upgrade separately.
6. Replace the intentionally short staging password with a unique 16+ byte value before any external staging access. The current value was preserved at the operator's request and is why health reports 503.
7. Finalize and sign the written HMA amendment covering 15% commission, after-scan settlement, refund eligibility/time window, data sharing, support escalation, and termination/notice controls.

## Reproducible commands

```text
npm test -- --runInBand
npm run typecheck
npm run staging:scan
npm run test:staging-security
npm run test:staging-performance
```

The performance and security scripts refuse non-staging hosts and do not call payment, payout, refund, or scan mutation endpoints.
