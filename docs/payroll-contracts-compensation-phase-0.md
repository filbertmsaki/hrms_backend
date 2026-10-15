# Contracts, compensation, and payroll — Phase 0 decision record

**Status:** Phases 0–6 implemented in the working tree; external Finance inputs and Phase 7 end-to-end/UAT evidence remain before sign-off.

**Purpose:** Freeze the business rules and cross-module acceptance criteria before implementing the remaining contracts, salary, and payroll gaps.

## Confirmed business decisions

| Topic | Decision |
| --- | --- |
| Jurisdiction | Tanzania mainland |
| Pay frequency | Monthly |
| Payroll dates | HR/accounting can change calendar defaults and dates on an individual payroll period. A period's cutoff and payment dates are fixed once the payroll is locked. Date changes must be audited. |
| Payroll approvals | HR, Finance, and Management stages are all required. Approvers must be distinct. The payroll maker cannot approve their own run. |
| Payroll generation authentication | Support both a verified 2FA-protected login and a fresh authenticator check at generation. Company policy must enable at least one method. A payroll operator may use either enabled method; the operator cannot change the company policy. |
| Contract output | Attach and retain the executed/signed contract PDF, with the existing typed-name signature record and audit history. |
| Employee payslip | Generate and publish a readable PDF payslip. |
| Payment | Generate an encrypted bank payment batch and accept payment confirmation imports for reconciliation. |
| Accounting | Generate and export a CSV accounting journal. |

The repository defaults to TZS and `Africa/Dar_es_Salaam`; use these as the initial calendar values unless Finance specifies otherwise. Statutory rates and effective dates must be supplied or confirmed by the company's authorized payroll/accounting owner against applicable Tanzania mainland requirements. This record does not treat seed data as legal or financial approval.

## Cross-module workflow in scope

1. Onboarding creates the employee and provides contract data.
2. HR issues a contract; the employee signs; the executed PDF and signature evidence are retained.
3. Approved compensation is linked to the employee, contract terms, and an effective salary-structure version. Salary changes continue through employee movements.
4. Approved attendance, leave, overtime, employee-finance deductions, bonuses, and offboarding settlement items enter payroll with stable source references and duplicate protection.
5. Payroll calculates against the effective compensation, payroll calendar, and approved statutory rules, retaining a reproducible calculation snapshot.
6. The payroll run passes validation and distinct HR, Finance, and Management approvals, then is locked.
7. The locked run produces employee PDF payslips, an encrypted bank batch, payment reconciliation, and an accounting CSV journal.

## Acceptance criteria for the implementation phases

### Calendar and period dates

- Payroll configuration users with the HR/accounting payroll permission can edit calendar frequency, cutoff day, payment day, timezone, and currency.
- An authorized user can override cutoff and payment dates for an individual period before it is locked.
- The UI shows the effective dates used by each period.
- Changes record actor, timestamp, previous values, new values, and reason.
- Existing generated periods retain their stored dates when calendar defaults change; locked periods cannot be edited.
- Calendar and period date calculations handle short months and configured timezone consistently.

### 2FA and approvals

- Payroll generation is denied unless at least one company-configured 2FA method is enabled and satisfied.
- The two supported methods are a verified 2FA-protected login and a fresh authenticator challenge at generation. Fresh challenges are single-use, time-limited, and bound to the authenticated payroll operator and action.
- The generator receives a clear prompt when a fresh challenge is required; failure or replay prevents generation and is audited.
- HR, Finance, and Management approvals occur in order and use distinct approvers. The creator cannot approve the run.
- Each approval is bound to the current calculation hash; any recalculation invalidates prior approvals.

### Contracts and compensation

- The executed contract PDF is retained as a private contract document. Its employee, version, signature, and audit history are linked.
- An employee's effective compensation and salary structure agree with the approved compensation terms; amendments create history rather than rewriting prior records.
- Payroll uses the effective approved compensation for the period and retains the precise structure version and component calculation snapshot.

### Payroll outputs and integrations

- Payslip PDF contents reconcile exactly to the employee result and component lines for the locked run; employees can access only their own payslips.
- The bank batch follows the bank-provided file specification and is encrypted using the bank-approved key/transfer method. Sensitive plaintext is not exposed through a normal download route.
- Payment confirmation imports are idempotent and report matched, unmatched, duplicate, and amount-mismatch rows.
- Accounting CSV totals balance to the locked payroll and carry configured account codes and dimensions.
- Outputs and sensitive actions are access-controlled and audited; retention follows approved company policy.

### End-to-end proof

- A database-backed integration test covers onboarding/employee, contract signing, compensation approval, attendance/leave/finance inputs, payroll calculation, three-stage approval, lock, payslip, bank batch/reconciliation, and journal export.
- Tests cover retries, duplicate inputs, corrected inputs, effective-date boundaries, missing bank/statutory data, failed 2FA, approval separation, tenant isolation, and locked-period immutability.
- HR and Finance compare a UAT parallel run with an independently reviewed expected result before production rollout.

## Existing implementation gaps verified during Phase 0

- Payroll calendars have create/list routes but no update route; generated periods store cutoff and payment dates.
- The payroll run process route has no generation-time 2FA enforcement. `PAYROLL_REQUIRE_2FA_FOR_APPROVAL` exists in the sample environment, but the payroll implementation does not currently use it for generation.
- Payslip downloads now render a private PDF from the locked result and component snapshot.
- Internal payment lists can be generated/downloaded without bank data or credentials; they contain no bank account numbers. Separate bank-ready batches use AES-256-GCM with a per-batch key wrapped by an RSA public key (minimum 2048 bits) and require bank format/key configuration.
- Payment confirmation imports reject repeat import references, validate selected batches, retain employee-level match results, accumulate partial payments, and mark employees/the run paid only when the expected net amount is confirmed.
- Accounting CSV exports use debit/credit rows with a control total. Journals can post into the internal payroll journal ledger without an ERP endpoint; company component mappings take priority, with marked internal account defaults for unmapped components.
- Contracts accept PDF attachments and capture a typed-name signature; the signed PDF itself is not currently captured as the executed document.
- Payroll readiness reports statutory setup as company data that must be supplied.

## Inputs needed before production/UAT sign-off

- Bank name(s), payment-file specification, encryption method/public key exchange, and payment confirmation format.
- Finance-approved statutory schemes, rule/band values, effective dates, and evidence/source for the approved values.
- Finance confirmation that TZS and `Africa/Dar_es_Salaam` are the company's payroll calendar defaults.
- Retention and access policy for contract PDFs, payslips, bank files, and payroll exports.

## Delivery sequence after Phase 0

1. Dynamic payroll calendar and period-date override with audit history.
2. Payroll generation 2FA enforcement and approval-stage safeguards.
3. Contract executed-PDF capture and compensation linkage.
4. PDF payslip rendering, access, and publication.
5. Bank-specific encrypted batch and confirmation import.
6. Accounting CSV export and reconciliation proof.
7. Cross-module database-backed e2e coverage and UAT parallel run.
