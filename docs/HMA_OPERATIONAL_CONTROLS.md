# HMA Ticketing Deal — Operational Controls

Document owner: YoVibe Operations
Technical owner: YoVibe Engineering
Approval owner: Authorized YoVibe and HMA representatives
Review cycle: Before each covered event, after every material incident, and at least quarterly
Evidence location: The approved operational evidence repository for the deal

## 1. Scope and commercial baseline

These controls govern YoVibe's operation of ticket sales for events covered by the HMA agreement. They supplement the agreement and do not replace signed amendments.

- Platform commission is 15% of ticket revenue, as approved in the amended commercial terms.
- Settlement is organizer-initiated after eligible tickets have been scanned; it is not an automatic or weekly remittance.
- Organizer payout initiation requires the existing re-authentication OTP sent to the organizer's verified email.
- Eligible Mobile Money funds may be paid directly through PawaPay. Card funds require an administrator to execute the PesaPal payout workflow.
- Refund requests are accepted only for cancelled or postponed events and require administrator review and execution.

Any conflict between this document and a signed agreement must be escalated to the agreement owners before sales continue.

## 2. Control roles

| Role | Responsibilities | May not |
| --- | --- | --- |
| HMA authorized representative | Approve event scope, ticket inventory, prices, approved brand assets, public copy, cancellation/postponement notices, and settlement request | Change production configuration or execute a payout |
| YoVibe operations lead | Record approvals, run event-readiness checks, coordinate support, open incidents, and assemble settlement evidence | Approve their own exception or bypass financial controls |
| YoVibe administrator | Review refunds, execute card payouts, manage exceptional Mobile Money cases, and preserve financial evidence | Initiate organizer OTP on the organizer's behalf or alter scan evidence |
| Organizer | Configure event data, issue/revoke staff scan links, monitor entry, and initiate payout after scanning | Execute card payout or bypass email OTP |
| Event staff | Scan tickets through scoped staff links | View payout data, issue refunds, or create additional staff links unless separately authorized |
| Engineering | Deploy approved changes, maintain monitoring, investigate incidents, and preserve technical logs | Approve commercial, refund, branding, or settlement exceptions |

Named people and deputies must be recorded in the event runbook before ticket sales open.

## 3. Branding controls

### Before publication

1. Obtain approved HMA/Nile Water logos, usage guidance, event copy, and any campaign-specific artwork through a recorded channel.
2. Record asset filename or immutable link, approver, approval date, permitted event(s), territory/channel, and expiry date.
3. Operations checks that event pages, tickets, email, and promotional surfaces use only approved assets and do not claim exclusivity, sponsorship rights, or official status beyond the written approval.
4. A second reviewer checks desktop and mobile previews before publication. Evidence is a dated screenshot set and approval record.
5. Material copy or artwork changes repeat the approval and preview process. Emergency corrections are logged and reviewed on the next business day.

### During and after the relationship

- Access to source brand assets is limited to assigned staff and reviewed quarterly.
- A takedown request creates a tracked action with owner, affected surfaces, deadline, and completion screenshots.
- On expiry or termination, new use stops immediately. Public campaign assets are removed within the contractual period or sooner when directed, while transaction records and tickets already required for customer service are retained without implying an ongoing partnership.

Required evidence: written approval, asset register entry, release/change identifier, pre-release screenshots, takedown evidence, and exception approvals.

## 4. Event configuration and change governance

Every covered event has one change record containing the event identifier, owner, ticket types, inventory, prices, date/time/timezone, venue, sale window, refund status, payment routes, and approved brand version.

- Two-person review is required before opening sales or changing price, inventory, date, venue, settlement configuration, commission, payment routing, or refund eligibility.
- Production access uses named accounts with least privilege and MFA where supported. Shared administrator credentials are prohibited.
- Emergency changes must state the incident or customer harm being addressed, be reversible, and receive retrospective approval within one business day.
- Feature toggles are used for event-specific or high-risk behavior. Toggle owner, default state, affected events, expiry/removal date, and rollback condition are recorded.
- Engineering retains the code review, automated test result, deployment identifier, and rollback version for each production release affecting the deal.

## 5. Refund, cancellation, postponement, and chargeback controls

- The refund function verifies ticket ownership for authenticated buyers.
- Guest buyers enter ticket reference plus purchase email. The public response does not disclose whether the order exists. A signed, single-order link is sent only to the stored order email, expires after 15 minutes, and remains safe to retry because ticket-level idempotency blocks duplicate active requests.
- A refund can be created only if the ticket is paid, unused, not already refunded, and the event is currently marked `cancelled` or `postponed`.
- A cancellation or postponement status change requires a recorded instruction from an authorized representative and a second-person check before publication.
- Administrators review the request, amount, original processor, payment reference, scan state, payout state, and prior refund/chargeback records before approval.
- Refund execution uses the original payment method where technically possible. Provider responses, retries, failures, customer notices, and any payout clawback are retained with the refund history.
- Chargebacks are never treated as ordinary buyer refund requests. Administrators handle them through the provider dispute workflow and preserve delivery, QR, scan, communications, and refund evidence.

Daily during an active cancellation/postponement: operations reviews pending and failed refunds, assigns an owner, and escalates items approaching the stated processing deadline.

## 6. Scanning and settlement controls

- Staff links are scoped to one event, expire, can be revoked, and must not be posted in public channels.
- Organizers review the issued-link list and revoke lost, forwarded, or unused links. The final event-day check confirms scanner access, connectivity fallback, and staff assignments.
- Scan mutations occur server-side and record the ticket, event, time, and staff-token identity. Duplicate, wrong-event, unpaid, refunded, and invalid tickets must be rejected.
- Payout eligibility is calculated from paid, scanned, non-refunded tickets and excludes already paid or processing tickets.
- The organizer initiates settlement and completes verified-email OTP re-authentication. No scan automatically causes a payout.
- Mobile Money/PawaPay may proceed through the authorized direct payout route. Card/PesaPal settlement remains pending until an administrator checks reconciliation and executes it.
- Every settlement has a reconciliation pack: covered ticket IDs, scan count, gross sales, gateway fees, 15% commission, refund/clawback adjustments, payable amount, processor references, requester, OTP verification timestamp, administrator action where applicable, and provider outcome.
- The requester and administrator must not alter the underlying scan or ticket records. Exceptions require documented finance-owner approval.

## 7. Reliability, monitoring, and customer support

UptimeRobot is the external availability monitor for the deployed app. It must check the quick health endpoint and at least one public customer journey URL. A second full-health check should run on a less frequent interval to include database reachability.

- Monitor owner and backup verify alert delivery before each event. UptimeRobot configuration screenshots/export and alert-test evidence are retained quarterly.
- Severity 1: purchasing, ticket delivery, scanning, or payout authorization unavailable during an active event. Acknowledgement target: 15 minutes; continuous ownership until restored or a documented workaround is active.
- Severity 2: degraded non-critical function or delayed customer operation. Acknowledgement target: 1 hour.
- Email, WhatsApp, and telephone support are always available through the published app contacts. Event runbooks name the primary responder and backup; unattended shared channels are not considered coverage.
- Support records must include received time, channel, event/order reference where appropriate, classification, owner, action, customer update, and closure. Payment credentials, OTPs, and full magic-link tokens must never be copied into support records.
- Status updates for a Severity 1 incident are issued at least every 30 minutes to affected operational stakeholders. A post-incident review is completed within three business days.

## 8. Termination and transition controls

On notice of termination, the operations lead opens a termination checklist and records the effective date, contractual notice period, affected events, sold-ticket obligations, customer communications, and accountable owners.

1. Freeze creation of new covered events and new use of partner branding while preserving existing customer access required by the agreement.
2. Decide, with written approval, whether each on-sale event continues, is transferred, is cancelled, or is postponed. Never silently invalidate sold tickets.
3. Preserve ticket delivery and scanning for continuing events; revoke unnecessary staff links and production access.
4. Reconcile all paid transactions, scans, refunds, chargebacks, PawaPay payouts, PesaPal card payouts, commissions, and outstanding/clawback amounts.
5. Complete or formally hand over open customer-support and refund cases.
6. Remove partner branding and campaign claims from active public surfaces, recording before/after evidence.
7. Export and retain records according to legal, tax, payment-provider, privacy, and contractual requirements; securely delete data only when retention obligations permit.
8. Obtain sign-off from operations, finance, engineering, and the authorized agreement owners. Record unresolved exceptions and their owner.

## 9. Evidence register and control testing

The evidence register contains: control ID, event, execution date, operator, reviewer, evidence link, result, exception, remediation owner, due date, and closure approval.

Before each covered event, test in a non-production environment:

- guest and authenticated purchase and ticket delivery;
- buyer security-photo access;
- valid, expired, revoked, duplicate, wrong-event, refunded, and unpaid ticket scans;
- authenticated refund ownership denial and guest magic-link expiry/tamper/replay behavior;
- cancelled/postponed eligibility and ineligible normal-event denial;
- organizer payout request, OTP expiry/reuse/attempt limits, and no automatic payout after scan;
- PawaPay direct Mobile Money path and administrator-controlled PesaPal card path using provider sandboxes/mocks;
- refund and payout idempotency, callbacks, failed-provider retry, and reconciliation reports;
- UptimeRobot alert routing and support escalation contacts.

Production validation is limited to read-only health checks and synthetic journeys designed not to create live charges, tickets, scans, refunds, or payouts. Any live transaction test requires written finance approval, a dedicated test event/payment instrument, named cleanup owner, and reconciliation evidence.

## 10. Go-live sign-off

Sales may open only when all boxes are evidenced:

- [ ] Signed commercial amendment records 15% commission and organizer-initiated after-scan settlement.
- [ ] Event configuration and brand approvals passed two-person review.
- [ ] Staging acceptance suite passed against the release candidate.
- [ ] Refund, scan, and payout negative-security tests passed.
- [ ] PawaPay and PesaPal configurations and callback signatures were verified without live customer funds.
- [ ] UptimeRobot checks and alert recipients were tested.
- [ ] Email, WhatsApp, and telephone responders plus backups were assigned.
- [ ] Event-day incident, scanning, refund, settlement, and rollback runbooks were distributed.
- [ ] Operations, engineering, finance, and authorized agreement owners signed the release record.
