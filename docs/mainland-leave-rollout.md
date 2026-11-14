# Mainland leave policy rollout: implementation status

Effective date selected for the new policy: **2027-01-01**. This document is a development record, not authorization to enable the policy. HR must sign off the reconciliation and HR/legal must confirm the policy interpretation before production use.

## Existing implementation review

- `leave_balances` is keyed by employee, leave type and calendar fiscal year. The existing balance service and daily generation use calendar years, not hire anniversaries. Its rows are mutable and are currently used by request and settlement flows.
- `leave_balance_transactions` records transaction snapshots and deltas, with an idempotency key. Not every existing entitlement is necessarily represented as a complete, independently summable ledger. Historical rows must not be rewritten as part of rollout.
- The existing carry-forward job runs against fiscal years and can post expiry and lapse transactions. The Mainland flag-only policy must not be attached to this job until anniversary-cycle processing and bucket provenance are implemented.
- Leave policies already configure accrual, holiday/rest-day handling, approval and some carry-forward settings. Policy types have quotas, encashment and carry-forward fields. They do not cover all confirmed rules or effective-dated historical policy resolution.
- Leave requests already store calculated date snapshots and have approval, document and reversal workflows. Sick pay tiers, maternity events, and the statutory eligibility rules need integration rather than a parallel request workflow.
- Holiday and schedule data already exist in attendance; the leave duration calculator uses the attendance schedule resolver. The 2026 seed contains projected dates and a national group that includes Zanzibar-specific holidays, so it cannot be used unmodified as a Mainland-only calendar.
- Employee records contain hire and exit dates but no explicit FTE or Mainland/Zanzibar jurisdiction field. Compensation is maintained separately in the payroll/contract system and can carry a pay frequency; monthly basic wage must be resolved for the effective payroll period.
- Existing offboarding settlement calculates from calendar-year balances. It must not be treated as the new termination calculation until ledger balances, effective compensation and payroll approval/locking are reconciled.

## Policy draft storage

`src/modules/hr/leave/config/mainland-policy-2027.draft.json` contains a proposed starting configuration based on the confirmed decisions. The optional company paternity benefit is disabled; its proposed setting, if enabled later, is five days within 30 days. The file is a template, not an active policy or an automatic seed.

The `leave_policy_draft_revisions` migration adds a separate append-only-by-API draft history associated with existing leave policies. HR can use `GET` and `POST /leave/policies/:policyId/draft-revisions` to inspect and create revisions; a create request takes `proposed_effective_date`, `rules` and `reason`. Writes are tenant-scoped, require policy-update permission and record an audit event. `POST /leave/policies/:policyId/draft-revisions/validate` checks the fields represented in the draft template, their types, dates and pay-tier ordering; it does not certify legal compliance or implementation completeness. Incomplete drafts may still be stored, with validation errors returned. Drafts are not consumed by the balance or request engines. A proposed effective date does not activate a draft. A production activation workflow must validate the full policy contract and preserve effective-date history before any draft can govern leave.

## Employee leave profile

The additive `leave_employee_profiles` migration stores effective-dated jurisdiction, FTE, optional cycle anchor and previous company employment periods, with the recording actor and reason. `POST /leave/employee-profiles/:employeeId` records a new version; `GET /leave/employee-profiles/:employeeId?as_of=YYYY-MM-DD` returns the latest applicable version or null. Both require leave-balance permissions and employee-scope access. Previous periods must not overlap and must end before the current hire date. Same-day corrections create a new version. No jurisdiction or FTE is inferred for employees without a profile. These profiles are not yet consumed by the leave engine and are not policy activation.

## Rollout gates

1. Design effective-dated policy assignments and capture jurisdiction, FTE, employment spells and migration anchors without assuming missing values. Existing data must remain on its current policy until explicitly classified.
2. Generate a reviewable opening-balance reconciliation at the cutover, with employee/type/source records and exception details. HR must approve the result before any opening entries are posted. Make posting idempotent and preserve existing requests and ledger history.
3. Implement four-decimal arithmetic end to end, anniversary cycles, ledger-derived balances and bucket-specific consumption. The precision migration only widens existing ledger columns; the existing writers and balance cache still round to two places.
4. Implement policy rules, event and evidence handling, cycle jobs, attendance and payroll integration, reports, administrative controls and exports. Reconcile the resulting outputs against independent calculations.
5. Obtain HR/legal and Finance sign-off and verify the migration, permissions, scheduler, API and user journeys in an isolated environment before enabling the Mainland policy.

The existing `GET /leave/balances/reconciliation` includes an `opening_balance_preview`, balance ID and fingerprint for each legacy row. It exposes current cached components, separately identifies pending and scheduled days, and flags ambiguous or missing values. It is explicitly marked `can_post: false`: the mutable cache is not an as-of-cutover calculation. `POST /leave/opening-preview-reviews` accepts `balance_id`, `fingerprint` and `reason` and lets an authorized reviewer record the exact fingerprinted preview in the existing audit log; it rejects stale previews and is explicitly not cutover sign-off or an opening ledger entry. `GET /leave/opening-preview-reviews/:balanceId` lists up to the latest 100 reviews for a permitted employee. Historical reconstruction, a durable cutover snapshot, sign-off and an idempotent posting workflow remain to be implemented.

## References

Primary: Employment and Labour Relations Act, Cap. 366, 2023 revised edition: annual leave s.32, sick leave s.33, maternity leave s.34, paternity and other leave s.35, public holidays s.26, and leave application s.30. In the 2019 revised edition the corresponding references are ss.31, 32, 33, 34, 24 and 29 respectively. The company choices and unverified interpretations must not be represented as legal conclusions.
