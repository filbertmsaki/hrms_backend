# Payroll lifecycle — implementation and operations

Status: implemented and verified in UAT schema (2026-11-20). Not deployed to
production. Read with the code in `src/modules/hr/payroll/`.

## 1. Run types and what they pay

| Run type                                    | Pays                                                                                                                                                                  | Never pays automatically                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `REGULAR`                                   | Prorated salary per salary segment, structure components, approved untargeted inputs, overtime, statutory, loans, approved recoveries, (active) attendance deductions | —                                                |
| `SUPPLEMENTARY`                             | Approved inputs with `target_run_type = SUPPLEMENTARY`, bonus schemes                                                                                                 | Basic salary, structure, leave/attendance, loans |
| `BONUS`                                     | Approved inputs with `target_run_type = BONUS`, active bonus schemes                                                                                                  | Basic salary, recurring allowances               |
| `OFF_CYCLE`                                 | Approved inputs with `target_run_type = OFF_CYCLE` (e.g. an unpaid-salary settlement marked `settles_recurring_salary`)                                               | Full monthly salary                              |
| `ADJUSTMENT` + `parent_run_id` (correction) | Approved inputs tagged `correction_of_run_id` = paid run                                                                                                              | Anything else; the paid run is never modified    |
| `FINAL_SETTLEMENT`                          | Unchanged (separate service)                                                                                                                                          | —                                                |

PAYE is assessed on the period's total taxable income: the run deducts
`PAYE(prior committed taxable + this run's taxable) − prior committed PAYE`.
"Committed" = locked/paid/closed runs of the same period. A run alone in its
period is computed exactly as before. A warning
`PAYE_OTHER_RUN_PENDING_IN_PERIOD` flags another run still in approval.

### Duplicate-payment protection (`payroll_payment_obligations`)

Every earning a run pays is claimed when the run is calculated:

- recurring salary (BASIC from compensation, salary-structure components, or an
  input flagged `settles_recurring_salary`) — the sum claimed by all runs for
  employee + period + component may not exceed the period entitlement;
- one-off items (inputs `INPUT:<id>`, bonus schemes `BONUS_SCHEME:<id>`,
  corrections) — one live claim per source (partial unique index).

Claims are made in one transaction under `pg_advisory_xact_lock(company+period,
employee)`, so concurrent runs serialize. Conflicts fail the calculation with
`PAYROLL_DUPLICATE_PAYMENT` listing each conflict. Claims are released on
recalculation, cancel, reverse or failed calculation, and become `SETTLED`
when the employee's net pay is confirmed paid (settled claims are never
released; paid salary is corrected through correction runs/recoveries).

## 2. Status lifecycle

`DRAFT → PROCESSING → (VALIDATION_FAILED | PENDING_<first workflow stage>) →
… → APPROVED → LOCKED → PAYMENT_FILE_GENERATED → PAID → CLOSED`

| Action                | Endpoint                                                                                 | Permission                 | Allowed from                                                           |
| --------------------- | ---------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| Calculate             | `POST payroll/runs/:id/process` (2FA)                                                    | `payroll:runs-process`     | DRAFT, VALIDATION_FAILED                                               |
| Approve               | `POST payroll/runs/:id/approve`                                                          | `payroll:runs-approve`     | PENDING\_\* (stage per run workflow)                                   |
| Reject                | `POST payroll/runs/:id/reject` `{stage, calculation_hash, reason}`                       | `payroll:runs-approve`     | PENDING\_\* → DRAFT                                                    |
| Lock                  | `POST payroll/runs/:id/lock`                                                             | `payroll:runs-lock`        | APPROVED                                                               |
| Cancel                | `POST payroll/runs/:id/cancel` `{reason}`                                                | `payroll:runs-cancel`      | DRAFT … APPROVED                                                       |
| Reverse               | `POST payroll/runs/:id/reverse` `{reason, bank_file_withdrawn}`                          | `payroll:runs-reverse`     | LOCKED/FILE/PAID with **no confirmed payment**, journal reversed first |
| Confirm paid (manual) | `POST payroll/runs/:id/mark-paid` `{payment_reference, payment_date, confirmation_note}` | `payroll:payments-confirm` | LOCKED, PAYMENT_FILE_GENERATED; not the preparer                       |
| Close                 | `POST payroll/runs/:id/close`                                                            | `payroll:runs-close`       | PAID                                                                   |
| Eligibility           | `GET payroll/runs/:id/eligibility`                                                       | `payroll:runs-read`        | any                                                                    |
| Payment progress      | `GET payroll/banking/runs/:id/payment-progress`                                          | banking/confirm/read       | any                                                                    |
| Retry file            | `POST payroll/banking/runs/:id/batches/retry` `{reason}`                                 | `payroll:banking`          | PAYMENT_FILE_GENERATED, after a statement import                       |

Approvals are bound to the calculation hash **and** calculation round
(`payroll_run_approvals.calculation_started_at`); a recalculation always needs
fresh approval from every stage. Maker ≠ checker and one person per stage.

## 3. Money that moves only on confirmed payment

When an employee's full net pay is confirmed (statement import or manual
confirmation with evidence), exactly once per employee and run:

- loan/advance instructions `LOCKED → POSTED` (ledger idempotency keys);
- overpayment-recovery deductions recorded (`payroll-deduction:<recovery>:<result>`);
- payment obligations `RESERVED → SETTLED`.

Partial or failed payments post nothing; retries only pay the outstanding
amount under new references.

## 4. Other endpoints

- Recoveries: `GET/POST payroll/recoveries`, `POST :id/approve|reject|cancel|refunds|accounting-adjustments`
  (`payroll:recoveries-manage|approve`, `payroll:accounting`). Salary deductions need a legal basis and consent/order reference.
- Approval workflows: `GET/POST payroll/approval-workflows` (`payroll:config`). Versioned; group > branch > company; copied onto each run when calculated.
- Attendance deduction policies: `GET/POST payroll/attendance-deduction-policies`, `POST :id/activate` (`payroll:statutory-approve`, needs a different user and a legal review reference), `POST :id/retire`. **No policy is active; attendance never reduces pay until one is.**
- Inputs: `target_run_type`, `late_adjustment_reason` (required after cutoff), adjustments `correction_of_run_id`.
- Reports: `sdl`, `health-insurance` added (by statutory scheme type and rule version).

## 5. Migrations

| Migration     | Change                               | Rollback                             |
| ------------- | ------------------------------------ | ------------------------------------ |
| 1797900041000 | lifecycle permissions                | deletes the permissions              |
| 1797900041500 | approval calculation round           | dedupes then restores old unique     |
| 1797900042000 | overpayment recoveries + permissions | drops tables/permissions             |
| 1797900043000 | approval workflows                   | drops table                          |
| 1797900044000 | attendance deduction policies        | drops table                          |
| 1797900045000 | widen account-number columns to 512  | refuses while any value is encrypted |
| 1797900046000 | payment obligations                  | drops table                          |

All are additive. Applied to UAT on 2026-11-20 (041000/041500 earlier;
042000–046000 after backup `hrms_uat_db-20261120-163318.dump`, verified by an
isolated restore). Roll back in reverse order with each migration's `down`.

## 6. Bank account encryption runbook

AES-256-GCM, versioned keys, value format `fenc:<version>:<iv>:<tag>:<data>`,
AAD = `table.column`. Code reads plaintext through a TypeORM transformer;
JSON responses always mask (`•••…1234`); masked values sent back by the UI
never overwrite the stored number.

Configuration (never committed; from the secret store):
`FIELD_ENCRYPTION_ENABLED=true`, `FIELD_ENCRYPTION_KEYS=v1:<base64 32B>[,v2:…]`,
`FIELD_ENCRYPTION_ACTIVE_KEY=v2`. A KMS integration installs keys at bootstrap
via `installFieldEncryptionKeys()`; no cloud provider is wired yet. Startup
fails on invalid keys, and in production unless
`FIELD_ENCRYPTION_PRODUCTION_APPROVED=true`.

Activation per environment:

1. Deploy this backend with the keys configured (encryption on write starts).
2. Backup; restore it to an isolated database and run the script there first.
3. `npm run payroll:bank-accounts:encrypt -- --dry-run` (deployed build; `:source` variant runs from source)
4. `… --apply`, then `… --verify` (counts only; aborts and rolls back on any failure).
5. Rotation: add `v2`, set active, `--apply` re-encrypts; keep old keys until `--verify` passes.
6. Recovery / rollback: `--decrypt --apply` (needs every key version used).

Losing a key version makes values under it unreadable: keys must be backed up
in the enterprise key store before step 4.
