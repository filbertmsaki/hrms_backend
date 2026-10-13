# Phases 14–16 implementation status

Reviewed: 2026-10-13  
Scope: backend payroll, employee finance, and analytics.

## Phase 14 — Payroll

Payroll is implemented across configuration, employee profiles, compensation version inputs, statutory calculations, payroll runs, approvals, payslips, encrypted bank batches, payment imports/reconciliation, accounting exports, reporting, and final settlement.

This delivery hardens the run and amount paths:

- `PayrollMoney.toCents` now uses decimal half-up rounding, including when an input has more than two decimal places.
- A run is claimed with one conditional database update from `DRAFT` or `VALIDATION_FAILED` to `PROCESSING`. Concurrent requests cannot both begin generating the same run.
- If generation fails after claiming, partial results, line items, and deduction shortfalls are cleared and the run is returned to `VALIDATION_FAILED` with zeroed totals so it can be retried. Business validation failures preserve their calculated results for review.
- Payslip employer amounts are selected with cent-based comparison.
- `test/payroll-run.e2e-spec.ts` covers the HTTP workflow.

## Phase 15 — Employee finance

Employee finance is implemented across products and eligibility, applications and approvals, guarantors/documents, disbursement, Decimal-based repayment schedules, ledger entries and balance reconciliation, payroll deductions, payment imports, settlements, accounting, reports, and audit.

This delivery hardens remaining precision and scheduled processing:

- `EmployeeFinanceMoney.toCents` now rounds consistently to cents using decimal half-up rounding.
- Eligibility amount thresholds, collection ratios, and overdue ratios avoid floating-point conversion of monetary values or large cent totals.
- Nightly reconciliation now pages through every account in stable ID order rather than stopping at the first 100. One account failure is logged and does not prevent later accounts from being checked.
- `test/employee-finance.e2e-spec.ts` covers the HTTP workflow.

## Phase 16 — Analytics

Analytics is implemented across source registration, dimensions/facts, datasets, metrics, operational/custom/saved reports, exports, snapshots, access/privacy controls, and financial reconciliation.

This delivery completes the scheduled financial reconciliation path:

- Reconciliation runs for every active company when analytics is enabled.
- Each company run is recorded in `analytics.analytics_snapshot_runs`, including checked source count, issue count, output hash, completion status, and issue details. Failed company runs are logged and recorded while the scheduler continues to other companies.
- Payroll and employee-finance reconciliation compare exact cents.
- `test/analytics-operational-reports.e2e-spec.ts` covers report endpoints.

## Remaining sign-off

Source implementation gaps identified for these phases have been addressed. Existing e2e specs primarily validate HTTP/controller contracts; run the payroll, finance, and analytics workflows against a staging database and representative company volumes before production sign-off. No migrations are added by this delivery, and no migration or test run is implied by this document.
