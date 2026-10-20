# Weekly-to-Annual Reporting and KPI: Phase 6 UAT

**Execution record date:** 2026-10-20  
**Status:** Automated test-database checks passed; company UAT and HR/Finance sign-off are pending.

## Automated evidence completed

All database writes in these checks were made against the dedicated `hrms_test_db`; acceptance fixtures are tagged as demo and removed by test cleanup.

| Check | Result | Evidence |
| --- | --- | --- |
| Annual formulas, missing scores, weighting, quarterly fallback, target cap, and adjustment handling | PASS: 6 unit tests | `performance-annual-aggregation.calculator.spec.ts` |
| Annual aggregation persisted in PostgreSQL and emitted in the performance CSV | PASS: 6 PostgreSQL tests | `performance-aggregation.postgres.spec.ts` |
| Operational report catalog and API responses | PASS: all report definitions; quarterly and annual sample rows returned with expected scores | `analytics-operational-reports.e2e-spec.ts` |
| Scheduled report dispatch and worker | PASS: 2 PostgreSQL e2e tests; idempotent dispatch and private CSV generation verified | `scheduled-reporting-execution.e2e-spec.ts` |

The annual report filter now treats `year` as the calendar year of the performance financial-year start date, matching the API validation and the report UI. The API e2e test covers both quarterly and annual score rows.

## UAT preparation

1. Apply current migrations to the isolated UAT database through the approved deployment pipeline.
2. Run the normal idempotent seed chain. Confirm the weekly/monthly/quarterly/annual templates and schedules exist, and that the insurance KPI starter set remains `DRAFT`.
3. Use only synthetic UAT employees and review data. Configure approved UAT recipients and mail sink; keep production recipients and SMTP credentials out of UAT.
4. Assign separate employee, line-manager, HR, Finance/report-owner, and unauthorized accounts. Confirm company scope and report permissions before testing.
5. Keep report templates and schedules inactive until an owner has reviewed their contents, date boundaries, filters, output format, and recipient list.

## Manual acceptance matrix

| ID | Actor and scenario | Expected result | Evidence to retain |
| --- | --- | --- | --- |
| UAT-RPT-01 | HR/report owner previews a weekly pack across a Monday/Sunday boundary | Previous complete Monday–Sunday range; rows reconcile with source activity | Request filters, generated CSV, source sample |
| UAT-RPT-02 | HR/report owner previews monthly activity and monthly KPI packs over a month boundary | Previous complete calendar month; totals and scores reconcile to approved source records | Generated files and reconciliation sheet |
| UAT-RPT-03 | HR/report owner previews quarterly KPI pack at Jan/Apr/Jul/Oct boundaries | Previous complete quarter and correct quarter sequence | Generated file and source aggregate rows |
| UAT-RPT-04 | HR/report owner previews annual KPI pack | Approved company financial-year boundaries and method are used; missing/unpublished reviews follow the signed rule | Generated file, calculation snapshot, independently calculated sample |
| UAT-RPT-05 | Unauthorized employee requests a report or another employee’s row | Server denies access; no cross-company or out-of-scope row is returned | Account role, request, denial/audit event |
| UAT-RPT-06 | Owner activates an approved UAT template with a mail-sink recipient, then dispatches it twice | One execution per due schedule; file is private; delivery status and retries are visible | Schedule/execution IDs, mail-sink evidence |
| UAT-KPI-01 | Employee views monthly score history; manager/HR reviews the same published score | Only published monthly scores appear, ordered by period; prior-month comparison uses the prior available month | Screenshots and source review IDs |
| UAT-KPI-02 | HR calculates annual output under each approved method using missing, corrected, and adjusted review cases | Scores match the approved formula and independent worksheet; adjustments apply once | Input rows, formula worksheet, output snapshots |
| UAT-KPI-03 | HR/business owners review insurance KPI names, measures, targets, weights, evidence, and role scope | Only approved definitions are published and assignable; rejected candidates remain draft or are removed | Signed KPI catalogue and approval history |

## UAT result and sign-off

| Owner | Decision | Name/date | Exceptions or evidence reference |
| --- | --- | --- | --- |
| HR process owner | PENDING |  |  |
| Finance/reporting owner | PENDING |  |  |
| KPI/business owner | PENDING |  |  |
| Security/access owner | PENDING |  |  |

No human UAT sign-off is recorded by this implementation. The local `.env.uat.local` profile has no database password and no mail host/user/password configured, so this workspace cannot connect to the UAT database or verify real UAT notifications. Do not treat the automated test-database results as company approval.

## Exit criteria

Phase 6 is complete only after the manual matrix is run using real UAT role accounts, owners approve the report definitions and KPI policy, all discrepancies are resolved or recorded as accepted exceptions, and each owner signs the table above. Production deployment and first-cycle reconciliation remain separate release stages.
