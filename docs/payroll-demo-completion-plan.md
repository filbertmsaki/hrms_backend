# Payroll demo and completion runbook

This workflow creates an isolated synthetic tenant with slug `hrms-payroll-demo`. It never uses the Alliance seed tenant. The tenant marker (`demo=true`, `demo_module=payroll`, `resettable=true`) is mandatory for both reconciliation and reset.

## Provision demo data

Run after migrations and base permission seeds are applied:

```powershell
$env:PAYROLL_DEMO_SEED_CONFIRM = 'YES'
npm run seed:payroll-demo
```

The seed creates six role accounts (employee, manager, HR, Finance, payroll admin, auditor), six synthetic employee scenarios, a payroll calendar and October 2026 period, payroll profiles, compensation versions, five payroll components, and approved bonus, deduction, and reimbursement inputs. It creates least-privilege company roles and fails if any configured permission is missing. Newly created users receive generated one-time passwords, printed once by the command, and must change them at first login. Existing demo passwords are not rotated by rerunning the seed.

Verify that the fresh database is migrated and the seed is complete:

```powershell
npm run migration:show
npm run verify:payroll-demo
```

The verifier is read-only and reports the six role accounts, their permissions, six employee/profile/compensation records, salary structure, components, scenario inputs, and reserved-user tenant isolation. Only run seed/reset with the database connection explicitly pointed at the isolated demo database. The verifier does not certify statutory settings or live payroll results.

To create one randomized, fully synthetic training cycle after demo provisioning:

```powershell
$env:PAYROLL_DEMO_CYCLE_CONFIRM = 'YES'
npm run seed:payroll-demo:cycle
```

This creates six synthetic results and payslips plus a balanced demo journal, generated bank file, and simulated payment import. Random training deductions are explicitly marked as not legally approved; no external payment or journal post occurs. The command refuses to create the same run twice. The sample verifier output and demo-only evidence are in `artifacts/payroll-demo-reconciliation.json` and `artifacts/payroll-demo-acceptance-evidence.json`.

The baseline statutory seed remains a separately reviewed draft. A demo Finance user can exercise approval screens, but that is training data and never constitutes statutory or company Finance approval. Verify any statutory fixture by running `npm run seed:payroll-baseline` only in the isolated demo environment; that legacy command targets the Alliance tenant and must not be used for this demo workflow.

## Run automated checks and reconciliation

```powershell
npm test -- --runInBand src/modules/hr/payroll/services/payroll-core.services.spec.ts
npm run test:e2e -- --runInBand test/payroll-run.e2e-spec.ts
$env:PAYROLL_DEMO_COMPANY_ID = '<demo company id>'
$env:PAYROLL_DEMO_PERIOD_CODE = 'PAYDEMO-2026-10'
$env:PAYROLL_RECONCILE_OUTPUT = '.\\artifacts\\payroll-reconciliation.json'
npm run reconcile:payroll-demo
```

The reconciliation command is read-only. By default, it accepts only the payroll demo tenant. For a company reconciliation authorized by that company, also set `PAYROLL_RECONCILE_ALLOW_NONDEMO=YES`; pass that company's ID and period explicitly. It compares run totals to employee result totals, journal debits to credits, internal bank batch totals to net pay, payment import outcomes and variance, period-scoped settlement arithmetic/payment snapshots, and settlement source references/amounts against paid or closed regular payroll lines. Any repeated paid source is flagged as a duplicate-payment risk, even when the amounts match. Exit code 2 means a reconciliation mismatch; exit code 1 means invalid setup or database error. The optional output path writes a reviewable JSON artifact and must point to a controlled location.

## Safe reset

```powershell
$env:PAYROLL_DEMO_RESET_CONFIRM = 'YES'
npm run reset:payroll-demo
```

Reset only targets the exact demo slug and refuses to delete a company without the explicit marker. It deletes the demo company and its six synthetic accounts and company-scoped roles; it cannot target another company by ID.

## Completion checks

- Automated backend payroll tests and the isolated Postgres payroll E2E cover the calculation, approval, simulated payment, YTD payslip, journal balance and period closure paths.
- Settlement calculation rejects duplicate settlement item assignment, rejects final settlement if a regular run is paid/closed for the last-working-date period, and checks completed settlement source type/reference pairs against paid/closed regular payroll line items. The reconciliation report also shows source and settlement amounts side by side.
- The simulated transfer provider remains guarded by `PAYROLL_DEMO_MODE=true`; it does not contact a bank.
- Employee, manager, HR, Finance, payroll admin and auditor accounts must still be used in a browser and mobile build for permission and journey acceptance. Record role, device, scenario, result and evidence outside synthetic pass claims. Seeded accounts alone are not acceptance evidence.
- Finance must independently confirm current Tanzania statutory rates, scope, effective dates and exemption rules in the target company. Demo approval is not production approval.
- Company UAT, comparison to company source payroll, production backup/restore/monitoring, deployment/rollback and first live-cycle sign-off require the target company's systems and authorized people. These must remain pending until recorded there.
