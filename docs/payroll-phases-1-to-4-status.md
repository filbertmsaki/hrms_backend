# Payroll and payslips: phases 1–4 implementation status

This record tracks the first four delivery phases. It separates software controls from values that must be supplied or confirmed by the company's authorized Finance/payroll owner.

## Phase 1 — Rules and acceptance criteria

Implemented in the application:

- Payroll calendar defaults are configurable through environment settings and individual calendars.
- Calendar dates, timezone, and currency are validated. Calendar and period-date changes are audited with the actor, previous values, new values, and a reason.
- Period dates cannot be changed after a run has progressed beyond draft/validation failure, or after the period is locked, paid, closed, or cancelled.
- Payroll security policy requires at least one generation 2FA method. Fresh authenticator codes are fingerprinted, expire, and cannot be replayed for the same actor and company.
- HR, Finance, and Management approvals are sequential, bound to the current calculation hash, and require distinct approvers who are not the run maker.

Still requires authorized company input before production sign-off:

- Finance approval of statutory schemes, rates, bands, effective dates, and supporting sources for Tanzania mainland.
- Confirmation of currency, timezone, pay frequency, cutoff/payment dates, and company-specific overtime, leave, bonus, and proration rules.
- Approval of policy for negative/insufficient net pay and any exceptions to the standard controls.

Seeded statutory values are examples and must not be treated as legal or Finance approval.

## Phase 2 — Configuration and employee data

- Readiness reporting identifies statutory setup and bank encryption configuration that still require company-specific data.
- Payroll calculation now fails with a clear blocker when any active statutory scheme lacks an effective approved rule for the period, when progressive tax bands are missing, or when no PAYE scheme is configured.
- Payroll calculation now fails with employee IDs when payroll-enabled employees in the run group lack effective compensation. Empty runs also fail instead of being approved with zero employees.
- Employee TIN, pension membership, verified bank account, finalized attendance, cost center, and negative net pay are represented as payroll blockers in result validation.

## Phase 3 — Calculation and inputs

- Payroll calculation uses effective compensation, salary structures, proration, approved statutory rules, approved inputs, attendance, leave, overtime, bonus schemes, and employee-finance instructions.
- Run results and line items keep calculation snapshots and hashes; deduction shortfalls and warnings are retained for review.
- Missing statutory configuration can no longer silently produce a zero statutory deduction for an otherwise processable run.

## Phase 4 — Approvals and controls

- Run generation requires verified 2FA login or a fresh authenticator challenge according to company security policy.
- Approval order, maker exclusion, distinct approvers, and calculation-hash matching are enforced before lock.
- Tenant scoping, action permissions, audit logging, and processing concurrency claims are wired through the API.

## Remaining sign-off

The company must provide and approve the statutory and calendar values listed above. After those inputs are configured, run the database-backed payroll scenarios and a parallel UAT payroll against an independently reviewed expected result before production rollout.
