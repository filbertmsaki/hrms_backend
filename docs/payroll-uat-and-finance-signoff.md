# Payroll UAT and Finance sign-off record

Use this record for each company release. Keep the original evidence in the company's controlled UAT location. Do not mark synthetic demo results as company sign-off.

## Company and release

- Company and tenant:
- Environment:
- Application build / commit:
- Payroll period:
- UAT lead:
- Evidence location:
- Run date:

## Role and client acceptance

Record one row for every role/client combination. Status starts as `NOT_RUN`; the seeded demo users prove only that roles and permissions were provisioned.

| Role | Web scenarios | Native mobile scenarios | Unauthorized-action checks | Result | Evidence reference | Tester / date |
|---|---|---|---|---|---|---|
| Employee | View current and prior payslips; YTD; privacy boundary | Sign in; view/download payslip; session expiry | Cannot view another employee or payroll controls | NOT_RUN | | |
| Manager | View team payroll summary; approval only within authority | Review permitted team information | Cannot process/lock/pay or access unrelated teams | NOT_RUN | | |
| HR | Review employee payroll inputs and final settlement workflow | Review only screens exposed to HR | Cannot approve Finance-only statutory settings or pay runs | NOT_RUN | | |
| Finance | Statutory draft review, approval, payroll approval and reports | Verify supported Finance views | Cannot administer accounts or bypass approval separation | NOT_RUN | | |
| Payroll admin | Process, preview, correct, lock, payment export/import, journals | Verify supported admin view or document native workflow as unsupported | Cannot self-approve if maker/checker separation applies | NOT_RUN | | |
| Auditor | Read-only run, payment, journal and settlement evidence | Verify read-only access where native app exposes it | All write actions rejected and audited | NOT_RUN | | |

## Finance statutory approval

Finance must attach or reference the authoritative company-reviewed rule sheet and record:

- Jurisdiction and employee population (Mainland Tanzania, Zanzibar, expatriate, public/private sector, and any other relevant scope).
- Each scheme and tax rule, rate/bands, contribution split, ceilings, exemptions and employee eligibility.
- Effective-from/effective-to dates, fiscal/calendar period mapping, rounding basis, and treatment of retroactive corrections.
- Legal/official source, retrieval date, preparer, independent reviewer, approver, approval date, and approved rule version IDs in HRMS.
- Evidence that the payroll calculation preview matches Finance's independent worked examples at boundaries and exemption cases.

**Status:** NOT_APPROVED until company Finance records the above and approves the exact version in the target company. Demo rule approval is training only.

Current primary reference points to review (not a substitute for the company's legal review): [NSSF contribution rates](https://www.nssf.go.tz/pages/rate-of-contributions), [NSSF payment and split options](https://www.nssf.go.tz/index.php/pages/payment-of-contributions), and [WCF contribution](https://wcf.go.tz/pages/contribution). Confirm applicability and current rates directly with Finance; scope and employer/employee allocation may vary.

## Parallel run and reconciliation

- Source payroll extract owner, date, period, and checksum:
- Payroll engine output checksum:
- Headcount and gross/taxable/deduction/net totals:
- Employee-level variance count and amount:
- Statutory filing/payment totals:
- Bank payment batch and imported payment reconciliation:
- General ledger journal and cost-center reconciliation:
- Final settlement overlap and source-reference check:
- Variances, cause, owner, disposition, and approval:
- Finance sign-off / date:

Use `npm run reconcile:payroll-demo` for the synthetic tenant. For an authorized company run, explicitly provide the company ID and period and set `PAYROLL_RECONCILE_ALLOW_NONDEMO=YES`. Save the JSON output in the controlled evidence location; the command is read-only.

## Production readiness and first live cycle

- Company configuration and effective periods reviewed:
- Permissions and maker/checker separation reviewed:
- Backup completed and restore test evidence:
- Schedulers, notifications, and external alerts verified:
- Support owner, escalation path, response target, and access:
- Deployment and rollback release IDs and rehearsal evidence:
- First live-cycle reconciliation period, sample, and variances:
- Finance, Payroll, IT Operations approvals and dates:

**Release status:** BLOCKED until Finance approval, role acceptance, parallel reconciliation, restore/rollback evidence, and first-cycle approval are complete.
