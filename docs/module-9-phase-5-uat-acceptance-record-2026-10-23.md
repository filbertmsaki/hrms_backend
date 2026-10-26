# Module 9 Phase 5: Isolated UAT and Acceptance Record

**Run date:** 2026-10-23 (Africa/Dar_es_Salaam)  
**Status:** Automated isolated PostgreSQL/API evidence passed for the scenarios below. Phase 5 acceptance remains **OPEN**; signed-in browser UAT, SMTP sink delivery, the complete role matrix, and owner sign-offs are pending.

## Follow-up implementation update

- The interactive `PENDING_ACTIVITY` analytics report and export now use `WorkActivityReportingService`, the shared Module 8 eligibility source. Eligible employee-days without a saved report are included, while actor/company/department/employee/branch scoping is applied through the work-activity access path. Pending rows also report tenant-scoped activity-entry, assigned-task, completed-task, and open-task counts. The analytics UI now displays these columns and summary cards.
- Quarterly and annual performance aggregate snapshots now record a formula-version label, calculation hash, expected/source/missing period IDs, and employee-level before/after audit history when aggregates are calculated or recalculated. The current formula behavior is preserved; this is traceability, not approval of the unresolved formulas, missing-period/part-year policy, or rating source.
- Focused unit evidence after this update: analytics-core and work-activity-reporting **2 suites / 19 tests passed**, including interactive adapter routing, CSV export, and the scheduled tenant-scoped export path. The earlier isolated API E2E evidence above predates this follow-up and must be rerun for database-backed verification of the new `PENDING_ACTIVITY` adapter/export.
- Backend `npm run build` and frontend `npm run build` completed successfully after the production changes. Frontend `npx eslint src/components/dashboard/reports-analytics-view.tsx` and backend changed-file ESLint completed cleanly. The repository-wide backend `tsc --noEmit` command still reports unrelated typing failures across other spec/e2e files; the production build uses `tsconfig.build.json` and succeeds.
- The performance aggregate PostgreSQL integration suite now asserts formula-version/source-period/hash metadata and prior-snapshot audit on recalculation, but it is skipped in this workspace because `HRMS_PERFORMANCE_TEST_DATABASE_URL` and `HRMS_WORKFLOW_TEST_DATABASE_URL` are not configured.

## Isolated environment

- Created a separate local PostgreSQL database: `hrms_module9_uat_test_db`. No production or company UAT database was used.
- Applied the complete current migration chain to this empty database. This included the global pending Module 8 activity-category migration because TypeORM runs migrations in timestamp order; it was applied only to the new isolated database.
- Ran the repeatable seed chain. The scheduled-report/workforce templates were provisioned inactive; provisional insurance KPI candidates remained draft. No recipient or schedule activation was configured.
- Used synthetic E2E fixtures, cleaned by the test suites. The test profile's SMTP endpoint is loopback, but the scheduled worker test had no recipient and therefore skipped email delivery; SMTP sink receipt/retry is not verified.
- The existing `hrms_test_db` was not used for final worker evidence because it already contained 788 pending report executions and one stale `GENERATING` row. A worker test there first failed under the backlog. This finding is isolated to that dirty test database; the same dispatcher/worker suite passed on the clean database.

## Automated results

| Scenario | Result | Evidence |
|---|---|---|
| Database migration state | PASS on the new isolated DB | `npm run migration:run` applied all 90 source migrations; `npm run migration:show` verified 90 applied, 0 pending. |
| API operational report catalog and report execution | PASS, 7/7 | `npx jest --config ./test/jest-e2e.json --runInBand --runTestsByPath test/analytics-operational-reports.e2e-spec.ts --silent` |
| Quarterly/annual report sample and synthetic productivity exports | PASS | E2E checked expected quarterly/annual score rows and reconciled populated report rows through CSV, XLSX, and PDF outputs. |
| Attendance-without-activity reconciliation | PASS | Controlled synthetic population matched the expected report output. |
| API access boundaries | PASS for tested cases | E2E denied an unauthorized account, returned no cross-tenant rows, and enforced employee/manager scopes. HR, Finance, department-head, dual-role, unrelated-manager, and full denial matrix is not complete. |
| Reminder/escalation retry and idempotency | PASS to internal tenant action-item sink | E2E exercised scheduled reminder/escalation jobs and verified duplicate-safe action items. This is not external email delivery. |
| Scheduled report dispatch and private file worker | PASS, 2/2 on clean DB | `npx jest --config ./test/jest-e2e.json --runInBand --runTestsByPath test/scheduled-reporting-execution.e2e-spec.ts --silent`; due schedule created one execution; worker generated and stored a private file. Email status was `SKIPPED` because there was no recipient. |
| API server start for browser UAT | BLOCKED | `npm run start:dev` did not complete compilation before it was stopped; the checked-in `dist` has no runnable `main.js`, so `npm run start:prod` could not start. |

The exact E2E results from the clean database were: analytics operational reports **1 suite / 7 tests passed**; scheduled report dispatcher/worker **1 suite / 2 tests passed**. The earlier combined run on the reused, dirty `hrms_test_db` had two scheduled-worker failures and passed the 7 analytics tests; the clean isolated rerun passed both scheduled-worker tests.

## Acceptance checklist

### Decisions required to finish the remaining requirements

| Owner | Decision needed before policy implementation | Safe behavior currently retained |
|---|---|---|
| KPI/business owner + HR | Approve quarterly score formula and weighting, what counts as a missing month, whether partial-year employees use all FY months or employment-eligible months, and which rating scale/version assigns the aggregate rating. | Existing quarterly simple average and annual method/configuration remain unchanged; new snapshots label formulas and expose expected/source/missing periods. |
| HR + KPI owner | Define weekly report population and week boundaries, separate templates versus a consolidated report, planned/completed denominators, incomplete/rescheduled/cancelled treatment, trend metric/comparison and partial-week handling, and weekly comment visibility/history. | Daily and pending employee-day reports use the approved Module 8 eligibility service. No weekly comment or trend scoring policy is inferred. |
| Business + Finance | Name authoritative closed-business, renewal-due/renewed, and posted-collection sources; approve recognition dates, currencies, employee attribution, refunds/reversals, and validation. | Reported activity values remain labeled as reported/potential; no new recognized business values are derived. |
| HR + Security/Privacy | Identify authoritative discipline and completed-training systems, qualifying statuses/dates/evidence, and which role may see/export summaries. | No disciplinary or completion data is inferred from attendance or review free text. |
| HR + Finance + KPI owner | Approve distinct increment, bonus, and promotion eligibility rules, thresholds, score/rating version, periods, exceptions, and effective dates. | No eligibility recommendation is generated and no payroll or movement action is automated. |

These decisions are in addition to the UAT and sign-off evidence listed below; implementation readiness does not substitute for business acceptance.

### Technical checks recorded

- [x] Separate test database created; no production/UAT DB writes.
- [x] Full migrations and repeatable seed chain applied in the isolated database.
- [x] Quarterly and annual report/API rows reconciled to expected synthetic score fixtures.
- [x] CSV/XLSX/PDF synthetic productivity outputs exercised.
- [x] Attendance-without-activity output reconciled to synthetic population.
- [x] Unauthorized and cross-tenant API checks passed for test cases.
- [x] Employee/manager API scope checks passed for test cases.
- [x] Reminder/escalation idempotency passed into the internal action-item sink.
- [x] Due schedule idempotency and private report-file generation passed.

### Pending technical and manual acceptance

- [x] Frontend lint and production build passed.
- [ ] Complete signed-in browser workflows for report selection, filters, score visibility, and export. No authorized Module 9 HR test credentials were configured; browser workflow was not reached.
- [ ] Complete API denial/scope matrix for employee, direct/unrelated manager, HR, Finance, department head, dual-role, unauthorized, and cross-company actors, including every report/export endpoint.
- [ ] Configure a synthetic recipient and company-scoped SMTP configuration pointing to the loopback mail sink; verify actual receipt, retry idempotency, private link access, and delivery audit.
- [ ] Exercise score-history missing/draft/corrected periods, period boundary, recalculation and correction lineage against approved business formulas. Formula/missing-period policy is not signed.
- [ ] Reconcile full filtered totals for every in-scope report/export against an independent worksheet, not only the operational E2E sample reports.
- [ ] Run report schedule date-boundary, misfire, timezone, duplicate dispatch, worker retry, and failed-email retry scenarios.
- [ ] Resolve business data-source gates for weekly activity/task population, renewal/collection authoritative metrics, discipline, completed training, eligibility recommendations, and report composition before declaring those requirements accepted.

### Business and IT sign-off

| Owner | Decision | Name/date | Evidence or exception |
|---|---|---|---|
| HR process owner | PENDING |  | Rules, population, privacy, and report composition |
| KPI/business owner | PENDING |  | Score formulas, missing periods, rating source, KPI mappings |
| Finance/reporting owner | PENDING |  | Commercial measures, report totals, delivery and payroll-related interpretation |
| Security/access owner | PENDING |  | Full role matrix, sensitive fields, export scope |
| IT/UAT owner | PENDING |  | Target environment, SMTP sink, scheduler, backup/restore, browser availability |

## Limitations and release decision

This record proves selected backend behavior against synthetic rows in a dedicated local PostgreSQL database. It does not establish company UAT readiness, business correctness of unsigned formulas, external mail delivery, browser/mobile acceptance, or production readiness. No reports, schedules, recipients, production data, or business sign-off were activated or changed. Do not mark Phase 5 complete or release this module until the pending checklist and actual owner signatures are complete.
