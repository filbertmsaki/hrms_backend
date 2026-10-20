# Staff loans: phases 1–8 implementation, UAT, and go-live

Date: 2026-10-15. Covers FRS section 12 (staff loans) and the loan parts of sections 13, 17, 18, 19, 21, 26, 28, and 29.

## What was built

| Phase | Delivered | Where |
| --- | --- | --- |
| 1. Configuration | Product create, edit (until first application), versioning, retire; processing fee (none / flat / percent, collected on instalment 1); late-payment penalty rule; amount-based approval tiers; probation and confirmation eligibility checks; editable sanction letter template. | Finance → Products, Finance → Settings |
| 2. Approval workflow | Route by amount (Manager → HR → Finance → Management), reject and return for correction with resubmission cycles, approval history, delegation while absent, hourly reminders and two-level escalation, sanction letter PDF, recorded employee acceptance. | Finance → Applications, Me → Finance |
| 3. Servicing | Nightly overdue job (5-day grace) with arrears status and penalty requests; maker-checker penalties, interest and fee waivers, write-offs; deferment and reschedule as requests with a preview, approved by a second person; early settlement quote → payment → approval; interest and fees booked to the ledger at disbursement. | Finance → Accounts, Finance → Servicing |
| 4. Payroll and exit | Deduction preview per payroll period with shortfall risk; per-run reconciliation (requested / reserved / payslip / posted / ledger); shortfall resolution (carry forward, collect directly, reschedule); exit recovery that is idempotent, rebates unearned interest, and records partial and full recovery. | Finance → Payroll deductions, Finance → Servicing |
| 5. Notifications and reports | In-app and email alerts for every loan event (16 events, see `GET /employee-finance/reports/notifications/catalog`); the seven FRS loan reports; Excel/CSV export of every report; loan statements as PDF and Excel for Finance and employees; dashboard adds overdue amount, collection rate, settled and written-off counts. | Finance → Reports, Me → Finance |
| 6. Optional bank and ERP | Per-company settings; both integrations can be switched OFF. Local loan ledger, payroll deductions, statements, and reports do not require a bank or ERP. Optional file mode provides balanced journal export with GL mapping, bank transfer file in a configurable layout, and statement import; optional direct connectors include generic ERP webhook and generic bank REST, encrypted credentials, sandbox/live, connection test, transmission log, automatic retry, and duplicate protection. | Finance → Bank, ERP & migration |
| 7. Data migration | Excel template, dry-run validation of every row, all-or-nothing import that opens each loan with its remaining schedule and an opening balance, duplicate protection, sign-off by a second person. | Finance → Bank, ERP & migration |
| 8. Testing | See "Verification" below; this document holds the UAT script, setup guide, and go-live checklist. | — |

### Defects fixed in the existing module

- Contractual interest and processing fees were never booked to the ledger, so interest-bearing loans ended with negative balances. Now booked at disbursement; `POST /employee-finance/reconciliation/backfill-interest` repairs older loans (dry run by default).
- Approving a repayment twice paid the instalments twice; approving an already confirmed disbursement reset it.
- Deferred instalments were never collected again; rescheduling did not rebuild the schedule.
- Repayments were booked entirely to principal.
- Exit recovery added a duplicate settlement line every time it ran.
- Applications could not be rejected or returned.
- Bank import compared amounts as text ("1000" ≠ "1000.00").
- Only Company Admin held loan permissions: employees could not apply, managers could not recommend, HR could not approve. Migration `1793000000000` grants them (see "Permissions").

## Migrations

| Migration | Contents |
| --- | --- |
| `1793000000000-EmployeeFinanceLoanPhases1To4` | Product versions, approval route/cycle/escalation columns, MANAGEMENT stage, letter templates, delegations, adjustments, servicing request columns, shortfall resolution, exit recovery link; new permissions and role grants. |
| `1793400000000-EmployeeFinanceIntegrations` | Integration settings and transmission log tables; `employee_finance:integrations`. |
| `1793300000000-EmployeeFinanceMigrationPermission` | `employee_finance:migration`. |

All three were applied to a scratch database and checked with a TypeORM drift dry run: no differences on the loan tables. Rolling back keeps data: product versions are renamed rather than deleted, and only the latest approval per stage is kept. Postgres cannot remove enum values, so `MANAGEMENT` and `PENDING_MANAGEMENT_APPROVAL` stay defined after a rollback.

## Permissions

| Permission | Granted by default to |
| --- | --- |
| `employee_finance:applications:self` | Every self-service role (Employee, managers, HR) |
| `employee_finance:applications:manager-review` | Department Manager, Branch Manager |
| `employee_finance:applications:hr-approve`, `:read`, `products:read` | HR Manager (HR Officer gets `:read`) |
| `employee_finance:applications:management-approve` | Company Admin; assign to the management role Alliance uses |
| `employee_finance:delegations` | Company Admin, HR Manager, Department and Branch Managers |
| `employee_finance:templates` | Company Admin, HR Manager |
| `employee_finance:adjustments`, `:adjustments:approve`, `settlements:approve` | Company Admin; split between two Finance users |
| `employee_finance:integrations`, `employee_finance:migration` | Company Admin |

Finance roles are custom per company: assign maker and checker permissions to **different** people. The system refuses approval by the person who raised a request.

## Configuration environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `EMPLOYEE_FINANCE_INTEGRATION_SECRET_KEY` | — (required in production) | Encrypts bank and ERP credentials |
| `EMPLOYEE_FINANCE_OVERDUE_GRACE_DAYS` | 5 | Days after the due date before an instalment is overdue |
| `EMPLOYEE_FINANCE_APPROVAL_REMINDER_HOURS` / `_ESCALATION_HOURS` | 24 / 48 | Defaults; a product can override in its approval settings |
| `EMPLOYEE_FINANCE_MAX_DEFERMENTS_PER_YEAR` | 2 | Per loan, rolling 12 months |
| `EMPLOYEE_FINANCE_SETTLEMENT_QUOTE_VALID_DAYS` | 7 | Quote validity |
| `EMPLOYEE_FINANCE_OVERDUE_CRON`, `_APPROVAL_SWEEP_CRON`, `_INTEGRATION_RETRY_CRON` | 01:15 daily, hourly, every 5 min | Scheduled jobs |

## Admin setup (before UAT)

1. **Load demo products (optional)**: run `npm run seed:employee-finance-demo` from `backend`. This safely adds two products to the company in `EMPLOYEE_FINANCE_DEMO_COMPANY_SLUG` (defaults to `alliance-insurance`), and leaves existing demo products unchanged. The sample values are for workflow demonstrations only, not an approved lending policy.
2. **Products** (Finance → Products): review or replace the demo products with approved rates, limits, fee, penalty, required documents, guarantors, and approval tiers before real use.
3. **Sanction letter** (Finance → Settings): set letterhead, wording, and signatory; preview.
4. **Roles**: assign HR, Finance makers/checkers, managers, and Management the permissions above. Use different people for maker and checker actions.
5. **Local-only operation (default option)**: leave ERP mode and Bank mode OFF. Loan products, approvals, internal ledger, repayments, payroll deductions, reports, and employee statements remain available. No GL map, bank endpoint, bank credentials, or external account is required for these workflows.
6. **Optional external accounting**: only if Finance wants journal files or direct ERP posting, configure GL roles and select FILE or DIRECT. Direct mode also requires an endpoint, credentials where applicable, and a successful sandbox test.
7. **Optional bank operations**: only if Finance wants bank transfer files, statement imports, or direct bank submission, select FILE or DIRECT and configure the relevant bank format or connector. Bank mode OFF leaves manual disbursement and repayment recording available.
8. **Migration**: download the template, fill one row per loan still being repaid, check, import, and have a second person sign off.
9. Run **Check older loans for missing interest** (Finance → Servicing) and apply it if any loans are listed.

## UAT script

Run with real people in each role. Each step lists who acts and what must be true afterwards. Record pass/fail and evidence (screenshot or report).

| # | Scenario | Actor | Expected result |
| --- | --- | --- | --- |
| 1 | Employee checks eligibility and applies within limits; uploads documents; adds a guarantor | Employee | Eligibility shows instalment and checks; guarantor receives an alert; application submitted shows the approval route |
| 2 | Guarantor accepts | Guarantor | Status approved |
| 3 | Manager recommends, HR approves (amount in lowest tier) | Manager, HR | Moves stage by stage; each approver is alerted; employee receives the approval alert |
| 4 | Amount above the top threshold goes through Finance and Management | All approvers | Route shows four stages; the final stage cannot be approved until documents and guarantors are verified |
| 5 | HR returns an application with a reason; employee corrects and resubmits | HR, Employee | Employee sees the reason; resubmission starts a new cycle; history shows both cycles |
| 6 | Reject at a stage | Any approver | Application declined with the reason shown to the employee |
| 7 | Manager delegates for today; delegate decides | Manager, delegate | Decision recorded as made on the manager's behalf |
| 8 | Leave an application waiting past the escalation time; run "Send approval reminders" | Finance | Reminder to approvers; escalation to the next authority |
| 9 | Employee downloads and accepts the sanction letter | Employee | PDF matches approved terms; acceptance recorded |
| 10 | Finance maker records the disbursement; checker approves; maker confirms | Finance ×2 | Same person cannot approve; ledger shows principal, interest, and fee; employee alerted |
| 11 | Download the bank payment file | Finance | File matches the bank's layout and the employee's account |
| 12 | Run payroll; open Payroll deductions → preview and reconcile the run | Payroll, Finance | Deduction on the payslip equals the instalment; reconciliation shows MATCHED; employee alerted of the deduction |
| 13 | Payroll shortfall: employee whose net pay cannot cover the instalment | Payroll, Finance | Shortfall listed; resolve by carry-forward, direct collection, or reschedule |
| 14 | Instalment unpaid past grace; run "Check overdue now" | Finance | Account in arrears; penalty request raised; checker approves it; employee alerted |
| 15 | Direct repayment and approval | Finance ×2 | Instalment paid; account back to active |
| 16 | Employee requests a deferment; Finance approves | Employee, Finance | Instalment moves after the last one; next payroll does not deduct it |
| 17 | Reschedule with preview; approve | Finance ×2 | New schedule replaces the old; reconciliation clean |
| 18 | Interest waiver, fee waiver, write-off | Finance ×2 | Ledger and schedule agree; written-off loan closed |
| 19 | Early settlement: quote, record payoff, approve | Finance ×2 | Quote removes unearned interest; loan settled; employee alerted |
| 20 | Employee resigns; offboarding creates loan recovery; Finance records partial then full recovery | HR, Finance | One settlement line per loan; balance cleared; loan closed |
| 21 | Every FRS loan report, exported to Excel | Finance | Totals match the account list and statements |
| 22 | Journal export | Finance | Debits equal credits; no unmapped accounts; a second export contains only new postings |
| 23 | Statement import (check, then import) | Finance | Matching repayments posted; mismatches listed for review |
| 24 | Security: employee opens another employee's loan; maker approves own request; manager approves outside their team | Testers | All refused |
| 25 | Run reconciliation after the above | Finance | No issues |

## Go-live checklist

- [ ] Migrations `1793000000000`, `1793400000000`, `1793300000000` applied; backup taken first.
- [ ] `EMPLOYEE_FINANCE_INTEGRATION_SECRET_KEY` set in production.
- [ ] Products, letter template, approval tiers confirmed by Finance. GL mapping and bank layout are required only when Finance enables the corresponding optional file or integration workflow.
- [ ] Roles assigned; maker and checker are different people.
- [ ] Existing loans migrated and signed off; interest backfill applied if listed.
- [ ] One parallel payroll run where loan deductions match the old system.
- [ ] UAT script signed off by HR and Finance.
- [ ] Users trained: employees (apply, accept, statement, deferment), managers (recommend, delegate), Finance (servicing, payroll deductions; integrations only if enabled).
- [ ] Two weeks of hypercare: review Finance → Servicing and the transmission log daily.

## Switching a direct connection on later (optional)

1. Enter endpoint and credentials with environment SANDBOX; use **Test**.
2. Send a small batch in sandbox; check the transmission log.
3. Switch environment to LIVE and mode to DIRECT.
4. Keep exporting files in parallel for one month before relying on the connection.
A bank or ERP that needs a different message format needs one new connector class registered in `EMPLOYEE_FINANCE_CONNECTORS`; the loan module does not change.

## Verification

- Backend `npm run typecheck`: pass. ESLint on the loan module: no errors.
- Unit: `src/modules/hr/employee-finance` 7/7 pass.
- Real Postgres (scratch database, migrations applied):
  - `test/employee-finance-servicing.e2e-spec.ts` 4/4: routing by amount, return and resubmit, sanction letter PDF, disbursement accrual, overdue + penalty, repayment, deferment, waiver, reschedule, early settlement, delegation, escalation, write-off, with reconciliation clean after every step.
  - `test/employee-finance-operations.e2e-spec.ts` 4/4: migration (all-or-nothing, duplicate guard, sign-off), all FRS reports and exports, statements, journal export, bank file, direct send with failure, retry, and duplicate protection, exit recovery.
  - `test/employee-finance.e2e-spec.ts` 1/1: employee application through approval, disbursement, payroll calculation, and deduction reservation.
- Real Postgres optional-integration checks also cover both integrations defaulting to `OFF`, statement-import dry-run then posting, a sandbox ERP health check and journal post, bank connection testing, bank submission failure/retry, and duplicate protection. `test/employee-finance-operations.e2e-spec.ts` passes 4/4.
- Notification catalog/delivery unit checks: 3/3 pass, including the 16 required events, recipient deduplication/exclusion, and failure isolation.
- Backend build and targeted ESLint pass. Android `tsc --noEmit` and ESLint on changed files pass; the native flow now supports required documents and guarantors, draft correction, sanction acceptance, and downloadable statements.

### Phase 8 execution record (2026-10-20)

- Applied the two pending TypeORM migrations to the dedicated `hrms_test_db` only; all 78 source migrations are now applied there. No UAT or production database was touched.
- Backend employee-finance unit suites: 69 passed; 5 skipped. The skipped PostgreSQL concurrency tests require `HRMS_FINANCE_CONCURRENCY_DATABASE_URL`.
- Real-Postgres loan E2E: all three suites passed, 9/9 tests total, covering employee application through payroll, servicing and ledger reconciliation, migration all-or-nothing/duplicate guard/second-person sign-off, reports, integrations, and exit recovery.
- Backend TypeScript typecheck passed. Targeted backend ESLint passed. Android TypeScript check and ESLint on the changed native finance files passed.
- The real-user UAT script and production checklist are prepared, but HR/Finance acceptance, live notification delivery, real company policy approval, and a parallel payroll run were not performed in this local test run. They require Alliance reviewers, approved settings, and the agreed UAT environment.

## Not done / needs Alliance

- Replace demo policy values and sample sanction wording with approved company terms before live lending.
- Assign real users to HR, manager, Finance maker/checker, and Management roles; the seeder does not assign people to roles.
- Import and sign off real active loans if there are any.
- Real bank/ERP endpoint connection, credential, notification delivery, and sandbox/live testing require the company's UAT configuration and external test systems.
- HR/Finance UAT sign-off, device-specific employee/guarantor acceptance, and a parallel payroll run require real reviewers and an agreed UAT environment.
