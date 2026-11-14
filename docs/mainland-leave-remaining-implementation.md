# Mainland Tanzania leave management: remaining implementation plan

**Status:** In progress; not production ready.  
**Proposed effective date:** 1 January 2027.  
**Scope:** Mainland Tanzania. Employees in Zanzibar remain on their existing policy until a Zanzibar policy is configured.  
**Business approval:** HR must sign off the cutover reconciliation; HR/legal must confirm policy interpretation; Finance must approve payroll and settlement treatment before production activation.

This is a handover and acceptance checklist for the remaining work. It builds on [the rollout review](mainland-leave-rollout.md) and the existing module. Do not replace or discard existing uncommitted work. Avoid database changes where the existing model can safely represent the requirement; use additive migrations when historical accuracy, provenance or concurrency cannot otherwise be guaranteed.

## Current state

- The existing module has policies, requests, approval workflows, documents, attendance schedules and holidays, mutable calendar-year balances, a transaction history, reports, imports and settlement code. Some existing files have uncommitted changes that must be reviewed and preserved.
- Anniversary-cycle, sick-tier and oldest-credit calculation helpers exist with focused tests, but are **not connected to live request or balance processing**.
- Ledger decimal columns have a widening migration, but existing writers and cached balances still round to two decimals. The migration has not been verified against a database.
- Inactive, effective-date-labelled policy drafts and a structural validator exist. Drafts are not active policy versions and are not used by the leave engine. The 2027 draft JSON file is a template, not a database seed.
- A legacy opening-balance preview and preliminary, audited preview reviews exist. They are explicitly not historical cutover balances, cutover sign-off or authorization to post opening entries.
- Effective-dated employee leave profiles can record jurisdiction, FTE, a cycle anchor and prior company employment periods. They are not yet consumed by the leave engine. The associated migration has not been verified against a database.
- No end-to-end production readiness, payroll reconciliation, database migration execution or HR/legal sign-off has been established.

## Confirmed policy decisions to preserve

| Area | Confirmed decision |
| --- | --- |
| Scope and cutover | Proposed 2027-01-01 start; preserve history and existing requests; do not rewrite payroll. Mainland rules do not apply to Zanzibar employees. |
| Annual | 28 calendar days per hire-anniversary year by default; holidays count; daily accrual, with monthly option. Carry unused days for six months, extend to 12 months with HR approval; oldest credit first. Flag at expiry by default; flagged days stay usable and payable until HR forfeits or extends them. Expiry date is inclusive. No employed cash-out; occasional leave uses annual balance. |
| Sick | 126 working days per 36-month hire-anchored cycle, excluding rest days, public holidays and workers' compensation days. First 63 full pay, next 63 half pay; later days unpaid and flagged. Certificate required, with reasoned HR override. |
| Maternity | 84 continuous calendar days per single birth; 100 for multiple births. Additional 84 days for child death within one year, within the same term. Maximum four paid terms across all employment spells; fifth paid term blocked, with unpaid or certified sick leave possible and HR notified. Three-month notice warns; start up to four weeks before expected birth, earlier with certificate. Return within six weeks after birth requires a fitness certificate; HR override also needs certificate and reason. Record NSSF benefit reference. |
| Paternity | Three working days; start within seven calendar days after birth, where birth is day zero. It may continue beyond that window. Optional company benefit disabled initially; draft option is five days starting within 30 days. |
| Compassionate | Four working days per annual cycle for the specified child sickness/death or spouse, parent, grandparent, grandchild or sibling death events; retrospective application within five working days after return. |
| Unpaid | Approval required; maximum 30 working days per 12 months. A block longer than 30 consecutive calendar days pauses annual accrual for the entire block; shorter blocks do not. |
| First six months | Accrue company annual benefit at 1.5 days per completed month; prorate by FTE. At six months replace it with normal first-cycle accrual from hire through one true-up adjustment, preserving deductions for days already taken. Sick benefit cap is seven paid days per employment spell, prorated by FTE. Prior-employment exception changes eligibility only, not the current hire-date cycle anchor; no accrual during gaps. |
| Part-time | Prorate entitlements by FTE. |
| Annual booking | Approve up to accrual projected through the request's last day, less pending and approved future requests; do not borrow from later cycles. Optional advance leave is off by default and requires HR approval when enabled. |
| Termination | Annual accrued untaken days and eligible carry-over paid at monthly basic wage / 26. Excess leave creates a draft recovery for Finance review, never a direct posting; legal confirmation of deduction is required. Other leave types are not paid out. |
| Holiday work | Double basic hourly wage for hours worked; hourly wage is monthly basic wage divided by scheduled monthly hours, with 195 hours/month fallback. Avoid double counting existing payroll sources. |
| Unauthorized absence | Unapproved absence is unpaid; flag HR after more than five consecutive working days. |
| Holidays | Seed the rest of 2026 and all of 2027 for Mainland. Lunar holiday dates are estimated and explicitly provisional until HR updates them after government announcement. |

Every policy number and selectable behavior must ultimately be represented in effective-dated configuration. The draft template is a starting point; audit its coverage against the complete requirements before activation.

## 1. Employee data, policy versions and activation

- [ ] Complete profile administration for jurisdiction, FTE, prior spells and migration anchors, with permissions, audit history, corrections and effective-date behavior. Resolve the profile as of the relevant date; do not silently assume Mainland or full-time for missing data.
- [ ] Validate employment spells against the employee's current hire date and retain employer identity across rehires for the cumulative maternity count. Ensure gaps never accrue leave.
- [ ] Resolve monthly basic wage and currency from the effective payroll/contract source; account for non-monthly pay frequencies explicitly rather than assuming they are monthly.
- [ ] Define and implement effective-dated policy assignments and immutable, approved revisions. Historical calculations must select the revision effective on the relevant date; future rule changes must not rewrite past decisions or transactions.
- [ ] Complete schema and cross-field validation, authorization, approval/audit and administrative UI for all rule keys. A structurally valid draft must not automatically become active.
- [ ] Make activation conditional on a successful cutover and explicit operational approval. Existing and Zanzibar policies must remain unchanged until deliberately assigned.

**Acceptance:** HR can configure and review a complete policy and employee profile; missing jurisdiction/FTE is surfaced; historical dates resolve the correct profile and policy; tenant and employee-scope checks pass; no existing employee switches policy by default.

## 2. Opening balances and cutover

- [ ] Specify the source-of-truth and as-of semantics for the 2027-01-01 opening position. Reconstruct from reliable historical records where possible; identify missing or conflicting records for HR resolution. Do not label the current legacy cache as a historical balance.
- [ ] Produce an exportable reconciliation with employee, type, source records, cycle anchor, prior carry-over, accrued and taken units, outstanding reservations, exceptions and proposed opening amount. Avoid counting future reservations as leave already taken.
- [ ] Persist an immutable or otherwise tamper-evident cutover snapshot and record explicit HR approval, actor, timestamp, evidence and reasons for overrides. Preliminary preview reviews are not this approval.
- [ ] Post approved `OPENING_BALANCE` transactions at cutover in a transaction-safe, idempotent process. Preserve legacy transactions and requests, provide rerun/reconciliation controls, and prevent posting stale or changed snapshots.
- [ ] Define rollback and recovery procedures that do not erase the audit trail or alter previously processed payroll.

**Acceptance:** HR can trace each posted opening entry to a signed snapshot and its source; reruns do not duplicate entries; unapproved, stale and unresolved rows cannot be posted; totals reconcile without rewriting history.

## 3. Ledger, cycles and balances

- [ ] Complete four-decimal precision in all ledger amounts, accrual calculations, DTOs, persistence and rebuildable caches. Preserve existing two-decimal values on migration; display two decimals without using display rounding as the source of truth.
- [ ] Design append-only ledger transaction types, reference/idempotency keys, reversals, bucket provenance, access controls and database safeguards. Every balance must be derivable from ledger entries; caches must be rebuildable and independently reconcilable.
- [ ] Connect `detect_cycle(employee_id, leave_type, as_of_date)` to the effective employee profile and policy. Implement hire-anniversary cycles, 36-month sick cycles, shared annual compassionate cycles, event-based types, leap-day clamping and migrated anchors. Define behavior for dates before hire and gaps between spells.
- [ ] Implement daily and completed-month annual accrual, including leap years, FTE, six-month benefit and one idempotent true-up, and whole-block unpaid accrual pauses. Agree inclusive day boundaries with the supplied 184-day test and ensure a complete cycle earns its configured entitlement.
- [ ] Track carry-over by source cycle and expiry, consume oldest eligible credits first, and support flag, extension and explicit forfeiture with an audit trail. Flag-only expired credits remain usable and payable until HR acts; the expiry date is the last usable day.
- [ ] Implement `get_balance(employee_id, leave_type, as_of_date)` for past, present and future, returning cycle dates, entitlement, accrued, carried, expiry, taken, pending, scheduled, expired, paid out, available and projected balances; include sick tier usage and remaining amounts. Separate actual ledger postings from hypothetical future projections.
- [ ] Address concurrent submissions and approvals with transactional locking and idempotency. Define corrections and reversals so history and future reservations remain consistent.

**Acceptance:** Independent ledger sums match rebuilt caches and all as-of results; concurrency cannot overspend; reruns and reversals are correct; projection does not create actual transactions.

## 4. Request rules and lifecycle

- [ ] Extend the existing request preview to show counted dates, exclusions, cycle splits, pay tiers, balance/reservation impact, warnings and evidence requirements before submission.
- [ ] Apply the effective policy and employee schedule/holiday calendar; support half days, overlaps, notice, pending reservations and cross-cycle requests. Prevent annual borrowing from future cycles; implement the optional HR-approved advance rule.
- [ ] Implement sick tier splitting, medical evidence with reasoned HR override, and workers' compensation exclusion.
- [ ] Add life-event records and protected documents for birth, multiple birth, child death and eligible compassionate events. Enforce maternity term counting across spells, notice warnings, certified early start, child-loss entitlement and NSSF reference. Enforce paternity start window and compassionate retroactive deadline.
- [ ] Apply under-six-month eligibility and the rehire exception; apply FTE and the per-spell sick benefit; deduct occasional leave from annual. Implement unpaid leave approval and rolling limit.
- [ ] Preserve approval chains and employee/manager/HR access checks. Cancellation, early return and retrospective correction must use ledger reversals and downstream attendance/payroll corrections rather than editing history.

**Acceptance:** Preview, submission, approval, ledger, attendance and payroll agree for each counted date and half day; required documents and overrides are auditable; invalid requests are rejected or warned as specified.

## 5. Scheduled cycles, expiry and notifications

- [ ] Add a daily, timezone-explicit cycle job to open and close cycles, post accrual and carry-over, and process configured expiry actions. Do not route new anniversary balances through the existing calendar-year lapse job.
- [ ] Send deduplicated HR and manager warnings at 60, 30 and 7 days before expiry; include the correct employee, bucket and expiry date. Support flag, extension and reasoned forfeiture.
- [ ] Provide idempotent retries, locking, downtime catch-up, failure visibility and reconciliation. Avoid double posting when jobs run concurrently or more than once.

**Acceptance:** Job reruns and recovery produce one correct set of entries and notifications; default expiry never silently forfeits days; late or failed jobs are visible to operators.

## 6. Attendance, payroll and termination

- [ ] Block present/clock-in within six weeks after birth unless a fitness certificate is present; record HR override, certificate and reason. Cover all relevant attendance ingestion paths and corrections.
- [ ] Identify unauthorized absence after considering approved leave, schedules, holidays and attendance exemptions. Feed unpaid days once and flag HR after the configured consecutive working-day threshold.
- [ ] Allocate paid, half-paid and unpaid leave by payroll period, including sick tier and cycle splits. Reconcile to attendance and prevent duplicate unpaid absence deductions.
- [ ] Produce holiday-work pay from verified worked hours and effective monthly wage/scheduled hours, using the configured 195-hour fallback. Coordinate with existing overtime/holiday payroll sources to avoid duplicate payment.
- [ ] Calculate annual-only termination payout from accrued untaken and eligible carry-over days at the effective monthly wage divided by the configured divisor. Record payout entries and idempotent payroll references.
- [ ] Create excess-leave recovery as a draft subject to Finance approval and payroll lock/correction rules; do not directly post a deduction. Obtain legal confirmation before use.

**Acceptance:** Synthetic leave, attendance and payroll records reconcile by employee and period, including locked-period corrections, no double payment/deduction, and payout/recovery approval states.

## 7. Holidays, reports, APIs and screens

- [ ] Seed the remaining 2026 and all 2027 Mainland holidays from verified dates. Mark lunar estimates provisional in structured data and let HR amend them after government announcement. Keep Zanzibar-specific holidays out of the Mainland calendar; preserve HR changes on reseed.
- [ ] Add daily, weekly, monthly and per-cycle as-of balances; department and company summaries; annual leave liability using effective wage; carry-over expiring in 30/60/90 days; sick tier usage; and maternity terms used.
- [ ] Provide scoped API access and CSV/Excel exports with stable filters, totals, date semantics and appropriate privacy controls. Ensure report totals independently reconcile to the ledger and payroll.
- [ ] Complete HR web screens for employee leave profiles, rules, holidays, draft validation/approval, cutover reconciliation/sign-off, carry-over decisions, notifications and reports. Extend employee and approver flows for previews and required evidence.
- [ ] Verify the REST endpoints for apply, approve, cancel, as-of balance and reports, including tenant isolation, employee scope, concurrent changes and error handling. Reuse existing endpoints where appropriate.

**Acceptance:** HR can complete each workflow without manual database edits; exports match API totals; calendars and reports respect jurisdiction and permissions; provisional holidays are visible and editable.

## 8. Automated tests, documentation and release

- [ ] Implement the ten requested automated scenarios:
  1. 2025-03-15 hire: 2025-09-15 annual accrual = 184 × 28/365 ≈ 14.12.
  2. Cycle one ends 2026-03-14 and cycle two begins 2026-03-15.
  3. Ten unused days carry to cycle two, expire 2026-09-14, and April consumption uses carry-over first.
  4. Seventy sick days split into 63 full-pay and seven half-pay days.
  5. Annual leave from 1–28 December deducts 28 calendar days despite holidays on 9, 25 and 26 December.
  6. Twins yield 100 maternity days; a fifth paid term is blocked.
  7. Paternity starting eight days after birth is blocked.
  8. At four months' service the company annual benefit applies, with statutory eligibility handled as specified.
  9. Mid-cycle termination pays accrued untaken annual days at monthly basic / 26.
  10. A 2024-02-29 hire has correctly clamped anniversaries and returns to 29 February in leap years.
- [ ] Add meaningful tests for FTE, rehires and gaps, six-month true-up and prior usage, unpaid blocks of 30 versus 31 days, expiry-date inclusivity and flag/extension/forfeit, overlapping requests, event and document authorization, and cross-cycle/tier splits.
- [ ] Add database/API integration tests for migrations, data preservation, ledger idempotency, concurrent approval, reversals, security, reconciliation approval and cutover posting. Test migration rollback protections with existing data.
- [ ] Test scheduler retry/catch-up and notification deduplication; reconcile attendance and payroll across periods and locked runs. Exercise HR and employee web journeys and exports with a synthetic tenant.
- [ ] Run appropriate backend and frontend typechecks, lint, unit and integration suites. Record actual results and any environment limitations; do not treat source inspection as runtime verification.
- [ ] Complete a README mapping **every implemented rule** to its configuration key, default, effective-date behavior, evidence, payroll impact and legal reference. Document operational runbooks, data migration, monitoring, rollback and known limitations.
- [ ] Obtain HR cutover reconciliation sign-off, Finance payroll/settlement sign-off, and HR/legal confirmation of counting, legal interpretation and deductions. Enable only after all gates pass.

## Legal reference convention

Use the official [ELRA Cap. 366, 2023 revised edition](https://oagmis.oag.go.tz/portal/acts/revised/570/download) as primary and show 2019 numbering alongside: annual s.32 (2019 s.31), sick s.33 (2019 s.32), maternity s.34 (2019 s.33), paternity/other leave s.35 (2019 s.34), public holidays s.26 (2019 s.24), and leave application s.30 (2019 s.29). These references are not a substitute for the requested HR/legal review.
