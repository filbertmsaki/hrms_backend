# Payroll And Staff Loan Phase 9 Upgrade

Date: 2026-09-22

## Phase 9A Audit Baseline

The current HRMS already has payroll and staff-loan foundations in place:

- Configurable payroll components, salary structures, calendars, statutory schemes, statutory rule versions, tax bands, and accounting mappings.
- Effective-dated payroll profiles, statutory rules, salary structures, and finance products.
- Payroll runs with calculation hashes, approval stages, lock state, payslips, bank batches, journals, variance reports, final settlements, audit logs, and deduction shortfall storage.
- Staff loan and salary advance products, applications, approvals, accounts, installment schedules, ledgers, disbursements, repayments, payroll instructions, deferments, reschedules, settlement quotes, exit recoveries, and audit logs.
- Frontend operator and self-service surfaces for payroll and employee finance workflows.

## Required Upgrade Controls

Phase 9 focuses on financial-control hardening rather than a rewrite.

- Payroll must remain the system of record for gross-to-net results and payslip output.
- Staff Loan Management must remain the system of record for loan applications, balances, schedules, ledgers, and settlements.
- Integration between the modules must happen through controlled payroll instructions.
- Payroll must deduct only the amount that can be safely applied in the run.
- Any unpaid loan or salary-advance deduction amount must be recorded as a shortfall and reconciled back to employee finance.
- Locked payroll must post confirmed repayments to the employee-finance ledger exactly once.
- Approval actions must be hash-bound and maker-checker controlled.
- Bank files, journals, payslips, loan ledgers, and final settlements must reconcile to locked payroll results.

## Implementation Phases

### Phase 9B: Payroll Controls

- Enforce minimum-net-pay capacity for staff-loan and salary-advance deductions.
- Preserve requested deduction amount separately from applied payroll amount.
- Store payroll shortfalls per employee payroll result.
- Keep calculation snapshots and warnings explicit enough for review before approval.

### Phase 9C: Staff Loan Payroll Contract

- Generate employee-finance payroll instructions from due installments.
- Reserve instructions for a single payroll run.
- Apply only reserved payroll amounts to payroll line items.
- Post reserved amounts to the employee-finance ledger only when payroll locks.

### Phase 9D: Shortfall And Recovery

- Treat shortfalls as recoverable balances rather than silent calculation loss.
- Keep zero-applied instructions in shortfall status.
- Keep partial deductions posted for the applied amount and visible in payroll warnings.

### Phase 9E: Reconciliation And Outputs

- Reconcile payroll run totals to employee results and line items.
- Reconcile employee-finance account balances to ledgers.
- Reconcile payroll instructions to payroll line items and posted employee-finance ledger entries.
- Generate bank batches and journals only from locked payroll.

### Phase 9F: Frontend Workflow

- Existing payroll and finance screens can consume the hardened API.
- Next UI polish should prioritize deduction-preview, shortfall-drilldown, loan statement, approval checklist, and reconciliation issue screens.

## Acceptance Checks

- Payroll calculation does not create negative net pay unless explicitly configured.
- Employee-finance deductions respect `PAYROLL_MINIMUM_NET_PAY_AMOUNT` and `PAYROLL_MINIMUM_NET_PAY_PERCENTAGE`.
- Payroll line items contain only the applied employee-finance amount.
- `payroll_deduction_shortfalls` stores requested, applied, and deferred amounts.
- Payroll lock posts only reserved employee-finance deductions.
- Zero-reserved employee-finance instructions become shortfall records and are not posted.
- Re-running a failed payroll run replaces prior run-local shortfalls.
- Backend typecheck and targeted payroll/employee-finance tests pass.
