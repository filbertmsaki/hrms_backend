# ESS/MSS Phase 6–7 Execution and Evidence Review

**Review date:** 21 October 2026
**Purpose:** Turn the proposed FRS traceability register into an actionable validation and release plan.
**Overall status:** **Not release-ready.** The repository has broad ESS/MSS functionality and passing focused automated checks, but the UAT environment is unavailable, mobile provider/device validation has not occurred, and stakeholder approvals are blank.

## Summary

- Traceability register: 43 items across ESS, MSS and mobile (source: `generate-workbook.cjs`). The workbook remains the proposed, unapproved baseline.
- Verified in this review: 17 targeted automated suites, 39 tests. This is a count of the explicit runs below, not a whole-project test pass.
- Real PostgreSQL evidence: 6 suites, 16 tests, covering selected payroll/payslips, employee finance, notifications API, field visit persistence, permission changes, and company isolation.
- Mock-backed endpoint evidence: 5 suites, 19 tests, covering selected leave document, onboarding, offboarding, performance and work-activity routes.
- Notification destination unit tests: 1 suite, 4 tests.
- UAT config targets `127.0.0.1:1` (`hrms_uat_db`); it is unreachable. The dedicated test DB at `127.0.0.1:5432` is reachable and was used only with guarded E2E suites. No UAT migration, destructive reset, or demo seed was run.
- Real device/browser/provider delivery, production-shaped data, monitoring/backup/restore/rollback validation, and stakeholder sign-off are **not established**.

## Requirement coverage register

Legend: **Partial** = implementation exists with material verification or workflow gaps; **Not verified** = evidence is insufficient; **Missing** = no implementation evidence located for the proposed item. A passing neighboring test does not close a requirement unless it exercises that journey.

| ID | Area | Current repository evidence | Evidence from this review | Remaining acceptance work |
|---|---|---|---|---|
| ESS-DAS-001 | Employee dashboard | Employee dashboard/API and self-service route tree | No dashboard-specific run in this review | Verify scoped counts, links, empty/error states and persisted source data |
| ESS-PRO-001 | Personal profile | Self-service profile API and profile route | Self-service unit tests cover actor binding adjacent to changes | Browser and DB-backed view/edit field ownership; HR field policy |
| ESS-PRO-002 | Photo/avatar | Avatar/profile upload code and UI | Not run | File validation, private storage, ownership, cross-user denial and device/browser journey |
| ESS-PRO-003 | Controlled profile changes | Request and attachment services/routes | Service tests cover owner-only profile-change file access and forged employee ID handling | DB-backed submit/review/return/resubmit/apply/download and HTTP cross-user denial |
| ESS-ORG-001 | Organization/movement history | Organization and movement pages/APIs | No movement workflow run in this review | Effective-dated DB journey, acknowledgements and owner validation |
| ESS-ATT-001 | Own attendance/history/schedule | Attendance APIs/pages and Android screens | Not run in this review | DB/browser scope, schedule accuracy, date ranges and error states |
| ESS-ATT-002 | Attendance correction | Employee correction APIs and ownership tests | Focused service tests exist; no DB lifecycle run | Persisted submit/review/correction boundaries and reviewer authority |
| ESS-ATT-003 | Attendance capture | Web/mobile methods and configuration-specific controls | Not run | Confirm enabled methods; device permission, duplicate/replay and recovery tests |
| ESS-LEV-001 | Leave balances/eligibility | Employee leave pages/API and policy services | No DB leave acceptance run in this pass | Balance, eligibility, policy combinations and employee scope |
| ESS-LEV-002 | Leave request lifecycle | Leave request, documents and approval APIs | Mock HTTP suite: 6 tests for leave documents, validation, download and medical update | Real DB policy/workflow transitions, attachments, cancel/resubmit and balance effects |
| ESS-PAY-001 | Payslip and private PDF | Employee/company-constrained payslip services | Real PostgreSQL payroll run passed; cross-employee denial service tests exist | Real DB cross-user/cross-company denial and private file authorization evidence |
| ESS-PAY-002 | Payroll query/dispute | No dedicated route identified in baseline inventory | Not run | Decide whether to build or integrate a service desk; then implement if approved |
| ESS-FIN-001 | Employee finance | Employee finance application and payroll deduction path | Real PostgreSQL employee finance suite passed (1 test) | Broader lifecycle, repayment reconciliation and cross-actor matrix |
| ESS-ONB-001 | Employee onboarding | Onboarding routes/services/pages | Mock endpoint suite passed (4 tests) | Real DB employee task/document journey, browser UAT and scope boundaries |
| ESS-OFF-001 | Employee resignation/offboarding | Offboarding and resignation routes/services | Mock endpoint suite passed (3 tests) | Real DB employee self-service persistence, clearance visibility and access termination |
| ESS-PER-001 | Employee performance/KPIs | Self-performance and KPI services/routes | Mock endpoint suite passed (3 tests); Phase 5 unit evidence is recorded separately | Real DB actual/self-review workflow, ownership and aggregation reconciliation |
| ESS-PRO-004 | Probation self-assessment | Probation APIs/pages exist | No probation suite run in this review | Real DB self-assessment, one-time submission, manager scope and reminder acceptance |
| ESS-ACT-001 | Daily activity | Self activity APIs and Android offline outbox | Mock endpoint suite passed (3 tests); offline sync unit coverage recorded in Phase 5 | DB persistence, idempotency, partial failures, retries and account-switch tests |
| ESS-FLD-001 | Field visits | Employee/manager field visit APIs and mobile sync | Real PostgreSQL field-visit suite passed (2 tests) | Full employee journey, evidence authorization and mobile offline/device acceptance |
| ESS-REQ-001 | Personal requests/timelines | Requests, documents and action items APIs | Related profile/leave endpoint tests only | Cross-type ownership/file tests, timeline state, browser and DB acceptance |
| ESS-NOT-001 | Preferences and notification links | Notification APIs and Android routing | Real PostgreSQL notification API suite passed (5); routing unit tests passed (4) | Preference behavior, provider delivery receipts, links reauthorize and account/session recovery |
| ESS-DOC-001 | Employment letters/policy acknowledgement | Generic document APIs; dedicated catalogue/workflow unverified | Not run | Confirm requirement/catalogue and implement or record approved external handling |
| ESS-TRN-001 | Training | No training module identified | Missing in reviewed inventory | Scope decision: build or integrate; then owner, workflow and acceptance criteria |
| ESS-EXP-001 | Expenses/reimbursement | No dedicated HRMS expense module identified | Missing in reviewed inventory | Decide HRMS vs finance integration; define policy and approval owner |
| ESS-AST-001 | Assigned assets | No asset self-service module identified | Missing in reviewed inventory | Decide system of record/integration and IT/Facilities ownership |
| ESS-GRV-001 | Confidential grievance | No grievance/case module identified | Missing in reviewed inventory | Decide scope; privacy, restricted access, escalation and retention policy are prerequisites |
| MSS-DAS-001 | Manager dashboard/action inbox | Manager dashboard and action item APIs | Manager service tests recorded in Phase 3; not rerun in this review | Browser dashboard with scoped accounts, counts and source action reconciliation |
| MSS-TEAM-001 | Scoped team search/summary | Team service applies company and accessible-employee scope | Real DB tenant isolation passed (3 tests); manager service tests recorded in Phase 3 | DB manager hierarchy/branch revocation cases and browser field visibility |
| MSS-ATT-001 | Team attendance/corrections | Team attendance service filters company, employee scope and dates | Manager service tests recorded in Phase 3; no DB MSS run now | Persisted team scope, correction workflow, sensitive field rules and authority decision |
| MSS-LEV-001 | Manager leave review/calendar | Leave approval and team calendar modules exist | No manager leave suite in this review | Real DB decision, overlap/coverage rules, audit and notification acceptance |
| MSS-APR-001 | Unified approval inbox | Assignee-scoped action inbox and module approval APIs | Action item unit evidence recorded in Phase 3 | Cross-module real emitter-to-decision state/audit/notification coverage |
| MSS-SCH-001 | Team schedules/overtime | Attendance and payroll operator APIs exist | Manager ESS journey not evidenced | Confirm policy and manager UI/permission; test DB scope and approval boundaries |
| MSS-PER-001 | Manager performance/probation | Manager performance and probation APIs/pages | Mock performance endpoint suite passed (3 tests) | Persisted assigned-report scope, lifecycle transitions and browser UAT |
| MSS-ACT-001 | Manager activity/field review | Manager activity/field APIs | Mock endpoint suite passed (3 tests); field persistence suite passed (2) | Manager review authorization, audit/employee visibility, sync conflict behavior |
| MSS-ONB-001 | Manager onboarding tasks | Onboarding task/approval APIs exist | Mock onboarding endpoint suite passed (4 tests) | DB-backed assigned manager task completion and employee-visible result |
| MSS-OFF-001 | Manager clearance | Offboarding task/clearance APIs exist | Mock offboarding endpoint suite passed (3 tests) | DB-backed assigned clearance and authority-boundary acceptance |
| MSS-MOV-001 | Manager movement recommendations | Employee movement module exists | Not run | DB-backed recommendation and HR/Finance separation-of-duties checks |
| MSS-TRN-001 | Manager training nomination | No training module identified | Missing in reviewed inventory | Scope decision and implementation/integration |
| MSS-RPT-001 | Manager reports/exports | Analytics/report APIs exist; safe catalogue unverified | Not run | Define permitted report/field catalogue; scope, export audit and DB tests |
| MSS-SEN-001 | Sensitive-field restrictions | Guard/scope framework and field serializers exist | Permission matrix and tenant isolation suites passed (7 tests) | Full HR/Payroll/Privacy field matrix, all route/export denial tests and owner acceptance |
| MOB-PAR-001 | Mobile web/Android parity | Responsive web plus limited native ESS screens and additional routed modules | Android lint/typecheck and prior route tests were reported in Phase 6; not rerun here | Product owner selects required journeys; physical Android + mobile browser parity and interruption tests |
| MOB-NOT-001 | Push delivery/deep links | Registration/dispatch code and allowlisted tap destination routing | Routing unit tests passed (4); notification API real DB suite passed (5) | Live provider receipt, OS permissions, cold/warm device taps, account switching, expiry and retry |

## Verification record

Commands executed from `backend` unless noted:

| Check | Result | Limits |
|---|---|---|
| `npm run test:e2e -- --runInBand --runTestsByPath test/payroll-run.e2e-spec.ts test/employee-finance.e2e-spec.ts test/notifications.e2e-spec.ts test/field-visit-commercial.e2e-spec.ts` | Passed: 4 suites, 9 tests | Real Postgres; guarded dedicated test DB, fixture-scoped workflows |
| `npm run test:e2e -- --runInBand --runTestsByPath test/permission-matrix.e2e-spec.ts test/tenant-isolation.e2e-spec.ts` | Passed: 2 suites, 7 tests | Real Postgres; permission revocation and tenant employee isolation, not all ESS data types |
| `npm run test:e2e -- --runInBand --runTestsByPath test/employee-leave-documents.e2e-spec.ts test/onboarding-flow.e2e-spec.ts test/offboarding-flow.e2e-spec.ts test/performance-flow.e2e-spec.ts test/work-activities-flow.e2e-spec.ts` | Passed: 5 suites, 19 tests | Mock-backed route/controller tests; do not establish persistence |
| `npm test -- --run src/lib/mobile-notification-routing.test.ts` (`frontend`) | Passed: 1 suite, 4 tests | Unit destination mapping only; no actual push or device OS |
| `npx eslint` on targeted changed ESS/MSS/access/payroll/work-activity TS files (`backend`) | Passed, no reported findings | Does not substitute for a full repository lint run |
| Full backend `npm run lint:check` | Inconclusive: command ended without a final exit status returned by the shell session | Do not count as pass |
| Backend `npm run typecheck` | Inconclusive: command ended without a final exit status returned by the shell session | Do not count as pass |
| Android lint/typecheck and frontend Playwright onboarding | Earlier Phase 6/7 records report passes | Not rerun in this execution review; Playwright used mocked API fixtures |

## Phased plan to reach operational readiness

### Gate A — Establish a usable isolated UAT environment

1. Provision a dedicated UAT database and API in a controlled environment; do not repoint UAT at the test DB.
2. Correct the local UAT DB endpoint currently set to `127.0.0.1:1`; validate with an explicit connection check.
3. Apply reviewed migrations via the normal release pipeline and capture commit/build/migration versions. Use synthetic records only.
4. Configure private file storage and test notification channels or obtain an approved channel exclusion. Record provider receipts and logs.
5. Confirm backup/restore, monitoring/alerts, retention, rollback, support/on-call and owner for each service.

**Exit evidence:** UAT environment inventory, migration report, synthetic role accounts, integration configuration, and operational checks attached to the controlled evidence store.

### Gate B — Complete web and API acceptance by role

Run Employee A, Employee B, direct manager, out-of-scope manager, HR, Payroll/Finance approver, read-only and unauthorized journeys from `phase-7-uat-release-readiness.md`. Start with high-risk security flows: cross-user documents/payslips/finance, tenant isolation, removed permission/membership, changed reporting line, and stale session. Then exercise full create → submit → review → return/resubmit → approve/reject → history/download flows for each in-scope module.

**Exit evidence:** sanitized request/response or screenshots, actor and synthetic record IDs kept in restricted UAT storage, expected/actual, build IDs, timestamps, defects and retest results.

### Gate C — Validate mobile and notifications

Product owner confirms the mandatory native/mobile-web journeys and supported device/browser matrix. Execute warm and cold notification taps, denied permissions, live delivery receipts, expired sessions, account switch, offline work queue restart, partial rejection, retries, duplicate sync and return-to-network behavior on physical Android devices and narrow mobile web.

**Exit evidence:** device/OS/app/API versions, channel receipts, permission outcomes, sanitized logs, parity results and approved exclusions.

### Gate D — Close readiness and obtain release decisions

Re-run full CI (lint, typecheck, unit, DB e2e and browser automation) against the release commit. Reconcile payroll, leave, attendance, KPI and workflow counts using synthetic production-shaped data. Resolve or formally accept critical/high defects with accountable owner and expiry. Verify backup restore and rollback, monitoring alerts, support coverage, release notes and hypercare plan.

**Exit evidence:** immutable CI/build links, reconciliation report, defect register, operational check results, and signed HR, employee, manager, Payroll/Finance, IT/Security/Privacy, mobile product owner and release manager decisions.

## Current decision

**Go/no-go: NO-GO / not yet assessed for release.** This is a readiness finding, not a deployment action. The codebase has material implemented functionality and the targeted tests above pass, but broad traceability gaps, missing or unapproved scope items, unavailable UAT environment, real-device/provider testing and human sign-offs remain. Do not claim 100% operational completion until Gates A–D have evidence and the approved FRS scope is reconciled.
