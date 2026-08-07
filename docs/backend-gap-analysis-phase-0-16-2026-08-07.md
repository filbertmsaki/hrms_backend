# Backend Gap Analysis - Phases 0-16

Date: 2026-08-07
Scope: Backend only
Repository assessed: `D:\Projects\Office\HRMS\backend`

## A. Executive Summary

This backend is not a skeleton. It contains substantial real implementation across Phases 0-16, with 58 modules, 79 controllers, 185 services, 193 entities, 46 migrations, 28 seed-related files, 19 background/listener-style job files, 67 unit/spec files, and 16 e2e files.

The overall status is:

| Area | Status | Notes |
| --- | --- | --- |
| Phase 0 foundation | PARTIAL | Good config, validation, health checks, throttling, bootstrap; missing stronger runtime hardening and production artifacts. |
| Phase 1 auth/security | PARTIAL | Strong JWT, refresh, revocation, 2FA, audit; no global auth enforcement and no persisted session/device model. |
| Phase 2 employee master/org | PARTIAL | Rich implementation, numbering, structure, access scoping; destructive deletes remain a major data-history risk. |
| Phase 3 import/documents | PARTIAL | Real employee import pipeline and private docs; retention/download auditing not clearly implemented. |
| Phase 4 onboarding | PARTIAL | Real workflows, approvals, provisioning, reminders, probation handoff; test depth is limited. |
| Phase 5 attendance/access control | PARTIAL | Broad functionality and Hikvision/device sync present; deletion strategy and job scaling are uneven. |
| Phase 6 leave | PARTIAL | Strong workflows, balances, ledger, PDF, attendance integration; limited end-to-end coverage beyond main flow. |
| Phase 7 offboarding | PARTIAL | Mature workflow and settlement/access features; some emitted overdue events are not handled by listeners. |
| Phase 8 notifications/self-service/reporting | PARTIAL | In-app and email are real; SMS/PUSH are declared but not implemented. |
| Phase 9 deployment/ops | PARTIAL | Health/readiness exists, but repo-level deployment/monitoring/observability assets are thin. |
| Phase 10 probation | PARTIAL | Real policies, cases, reminders, letters, audit; no seed bootstrap and no e2e coverage found. |
| Phase 11 employee movements | PARTIAL | Real workflow, approvals, compensation versions; no e2e and migration ordering risk overlaps payroll. |
| Phase 12 performance/KPI | PARTIAL | Large feature surface exists; test depth is mostly unit-level and seed data is absent. |
| Phase 13 work activities | PARTIAL | Module exists and is integrated into performance; evidence of compatibility-layer debt remains. |
| Phase 14 payroll | PARTIAL / DEFECTIVE | Large implementation exists, but some monetary calculations fall back to `Number(...)` and queue config is not wired. |
| Phase 15 employee finance | PARTIAL / DEFECTIVE | Large implementation exists, but interest/amortization logic uses floating-point math and no queue wiring was found. |
| Phase 16 analytics | PARTIAL / DEFECTIVE | Real analytics module exists, but reconciliation uses raw numeric comparisons and queue env is not wired. |

Bottom line: the backend is materially implemented across nearly all requested phases, but it is not production-complete. The main gaps are integration completeness, data-retention safety, operational hardening, late-phase financial precision, missing seed baselines for later phases, migration hygiene, and incomplete e2e coverage.

## B. Backend Inventory

Inventory derived from source files, not planning docs:

- Modules: 58
- Controllers: 79
- Services: 185
- Entities: 193
- Migrations: 46
- Seed-related files: 28
- Background/listener/processor/cron-style files: 19
- Unit/spec files under `src`: 67
- E2E specs under `test`: 16

Top-level backend modules registered in `src/app.module.ts`:

- `SecurityModule`
- `AuthModule`
- `UsersModule`
- `CompaniesModule`
- `RolesModule`
- `PermissionsModule`
- `MailModule`
- `HrModule`
- `HikvisionModule`
- `AccessControlModule`
- `NotificationsModule`
- `ScheduledReportingModule`
- `SystemHealthModule`
- `AnalyticsModule`

Registration checks performed against the current source indicate:

- No obvious unreferenced Nest modules were found.
- No unregistered controllers were found.
- The backend is structurally wired into the module graph.

## C. Runtime Wiring and Registration Findings

Positive findings:

- `src/app.module.ts` wires config validation, scheduler, event emitter, Bull root config, throttling, TypeORM, and the main business modules.
- `src/main.ts` sets a global `ValidationPipe`, `HttpExceptionFilter`, CORS allowlist, request correlation middleware, optional Swagger, and shutdown hooks.
- `src/modules/system-health/system-health.controller.ts` exposes liveness and readiness endpoints with DB/Redis/disk checks.

Gaps:

- `src/app.module.ts:133` sets `APP_GUARD` only for `ThrottlerGuard`. Authentication is not globally enforced.
- `TenantGuard` is provided in `src/app.module.ts:131` but not globally registered as an `APP_GUARD`.
- Most controllers do use `@UseGuards(AuthGuard('jwt'), TenantGuard)` at class level, but the system depends on local consistency rather than universal enforcement.
- `src/main.ts` contains CORS, validation, filters, and shutdown hooks, but no `helmet` or equivalent HTTP hardening middleware was found.
- `src/ormconfig.ts` appears stale and inconsistent with `src/database/data-source.ts`, which is the stronger runtime source of truth.

## D. Phase-by-Phase Implementation Matrix

| Phase | Status | Evidence | Gaps |
| --- | --- | --- | --- |
| 0 Foundation | PARTIAL | Strong env validation, bootstrap, health, throttling, TypeORM, Bull root, event emitter. | No `helmet`; thin repo-level production ops assets; stale `src/ormconfig.ts`. |
| 1 Auth/Security | PARTIAL | Login, refresh, logout, forgot/reset password, email verification, company switching, 2FA, token versioning, blacklist support, security events. | No global auth guard; token contains `sessionId` but no persistent session/device store. |
| 2 Employee Core/Org | PARTIAL | Employees, employee numbering, branches, departments, positions, grades, cost centers, company structure, access scoping. | Hard deletes across employee and related records threaten historical traceability. |
| 3 Import/Documents | PARTIAL | Employee import preview/confirm/history/download, queue processor, private document storage, HR document service. | No clear retention/purge policy or document download audit trail was confirmed. |
| 4 Onboarding | PARTIAL | Requests, workflows, approvals, tasks, provisioning operations, cron reminders, probation integration. | Later-stage e2e coverage not found; workflow completeness needs broader scenario validation. |
| 5 Attendance/Access | PARTIAL | Policies, holidays, checkpoints, schedules, geofences, wifi, mobile punches, Hikvision sync, access-control modules. | Mixed hard/soft deletion strategy; no evidence of queue-based scaling despite complex workloads. |
| 6 Leave | PARTIAL | Leave types, policies, workflows, balances, ledger, audit, PDF, attendance integration. | Coverage is decent but still centered on selected flows. |
| 7 Offboarding | PARTIAL | Workflows, requests, tasks, approvals, asset returns, settlements, access ops, exit interview, reminders, audit. | Asset-overdue and settlement-overdue events are emitted but no listener handling was found. |
| 8 Notifications/Self-service/Reporting | PARTIAL | Notifications module, preferences, gateway, outbox, in-app listeners, scheduled reporting, action inbox. | SMS and PUSH channels are skipped because providers are not configured in code. |
| 9 Deployment/Ops | PARTIAL | Health, readiness, throttling, shutdown hooks, deploy scripts. | No obvious Docker/compose/PM2/Nginx/monitoring/backup infrastructure assets found in repo. |
| 10 Probation | PARTIAL | Policies, cases, review cycles, objectives, reminders, letters, audit, onboarding handoff. | No baseline seeders found; no probation e2e spec found. |
| 11 Employee Movements | PARTIAL | Movement workflows, approvals, acknowledgement, operations, compensation versions, maker-checker enforcement. | No e2e spec found; migration timeline overlaps payroll migration timestamp. |
| 12 Performance/KPI | PARTIAL | Financial years, periods, rating scales, KPI definitions/templates, plans, achievements, reviews, appeals, PIP, aggregates. | No e2e spec found; no baseline seed data found for configuration-heavy setup. |
| 13 Work Activities | PARTIAL | Work activities module exists and is used by performance. | No e2e coverage found; compatibility-controller debt suggests transitional design. |
| 14 Payroll | PARTIAL / DEFECTIVE | Profiles, components, structures, periods, runs, payslips, banking, accounting, reports, reconciliation, final settlement. | Monetary logic still uses floating-point conversions; queue env exists but queue wiring was not found; no payroll e2e. |
| 15 Employee Finance | PARTIAL / DEFECTIVE | Products, applications, approvals, accounts, disbursement, installments, ledger, payroll instructions, settlement, reports, reconciliation. | Interest math uses floating-point conversions; no queue wiring found; no e2e; no baseline product seeds. |
| 16 Analytics | PARTIAL / DEFECTIVE | Analytics module, controllers, services, warehouse-style metrics/reconciliation logic, strict env validation. | Numeric reconciliation uses `Number(...)`; queue env exists but queue wiring was not found; no analytics e2e. |

## E. Security and Access-Control Gap Report

Confirmed strengths:

- `src/modules/auth/auth.service.ts` and `src/modules/auth/strategies/jwt.strategy.ts` implement access/refresh token flows, token-version revocation, invalid-before revocation, and blacklist checks.
- `src/modules/auth/2fa` enforces role-sensitive 2FA behavior and supports admin revocation/reset flows.
- `src/modules/security` and `src/modules/security/security-events.service.ts` provide security-event logging.
- `src/modules/hr/shared/hr-access.service.ts` enforces employee visibility scopes such as self, team, department, branch, and company.
- Tenant-aware controllers are common throughout the codebase.

Security gaps and risks:

1. Local guard discipline instead of global auth enforcement

- `src/app.module.ts:133` registers only `ThrottlerGuard` globally.
- The platform depends on each controller remembering `AuthGuard('jwt')`, `TenantGuard`, and `PermissionsGuard`.
- This is not currently a discovered open controller exposure, but it is a systemic regression risk.

2. Session claims exist without a persisted session model

- `src/modules/auth/auth.service.ts:1172` and `src/modules/auth/auth.service.ts:1194` create `sessionId` values.
- `src/modules/auth/strategies/jwt.strategy.ts:211` and `:262` pass `sessionId` through validation context.
- No persistent device/session repository was found, so device-level management, session listing, and selective revocation are incomplete.

3. Missing HTTP hardening middleware

- `src/main.ts` includes validation, CORS, exception filter, and shutdown hooks.
- No `helmet` usage was found in `src/main.ts`.

4. Destructive deletion in historically sensitive HR areas

- `src/modules/hr/employees/employees.service.ts:4555` removes the employee record.
- The same service performs many related hard deletes, including `repository.delete(...)` and `repository.remove(...)` at `:2005`, `:2102`, `:2129`, `:2158`, `:2187`, `:2219`, `:2255`, `:2288`, `:2318`, `:3673`, `:3764`, `:3856`, `:3958`, `:4090`, `:4242`, `:4398`, and `:4544`.
- Similar hard deletes exist in leave, attendance, payroll cleanup, and employee finance product flows.
- This is a major audit/history/compliance risk for an HRMS.

5. Document retention and access auditing are not clearly complete

- Private document storage exists.
- I did not confirm a dedicated retention/purge policy, document download audit log, or evidence-lock strategy in the document stack.

## F. Migration Report

Migration posture:

- The repository contains 46 migrations under `src/database/migrations`.
- `src/database/data-source.ts` is the authoritative migration configuration.

Critical migration defect:

- Two migrations share the exact same timestamp prefix:
  - `src/database/migrations/1792500000000-CreateEmployeeMovementOperations.ts`
  - `src/database/migrations/1792500000000-CreatePayrollAndPayslips.ts`

Why this matters:

- Duplicate migration timestamps create ordering ambiguity and raise execution/reconciliation risk across environments.
- This should be treated as a blocker before further migration authoring on top of those files.

Additional migration concerns:

- `src/ormconfig.ts` appears stale and does not match the stronger discovery patterns in `src/database/data-source.ts`.
- Later phases are represented by migrations, which is good, but sequencing discipline has already degraded by Phase 14.

Conclusion:

- Migration coverage exists for all major later phases.
- Migration hygiene is not clean enough to declare the schema pipeline production-safe without remediation.

## G. Seeder Report

What is present:

- Core permissions, roles, platform users, company, company admin, branches, departments, positions.
- Leave baseline seeds.
- Shift/timetable seeds.
- Onboarding workflow seed.
- Offboarding workflow seed.
- Attendance device/access-organization/access-group seeds.
- Holidays and default avatars.

Representative files:

- `src/database/seeds/001-permissions.seed.ts`
- `src/database/seeds/002-global-roles.seed.ts`
- `src/database/seeds/004-company.seed.ts`
- `src/database/seeds/013-leave-types.seed.ts`
- `src/database/seeds/019-onboarding-workflow.seed.ts`
- `src/database/seeds/020-offboarding-workflow.seed.ts`

Seeder gaps:

- No obvious seeders were found for probation baseline policies.
- No obvious seeders were found for employee movement master data.
- No obvious seeders were found for KPI/performance rating-scale templates beyond permission availability.
- No obvious seeders were found for payroll components/structures baseline data.
- No obvious seeders were found for employee-finance products or approval defaults.
- No obvious seeders were found for analytics metrics/dashboard/report baselines.
- No obvious seeders were found for notification template/content baselines.

Seeder hygiene concerns:

- `src/database/seeds` contains legacy and duplicate-looking artifacts such as:
  - `company-structure.constants copy.ts`
  - `company-structure.constants.ts.bak`
- `009-department-position-mappings.seed.spec.ts` sits inside the seed folder, which is not harmful by itself but contributes to folder hygiene drift.

Conclusion:

- Early-phase seed coverage is respectable.
- Later-phase seed maturity is materially behind module maturity.

## H. Background Jobs, Events, and Integration Gaps

Confirmed background/integration strengths:

- Employee import is queue-backed and processor-backed.
- Hikvision/device sync includes cron/processor-style behavior.
- Notifications use an outbox/dispatcher model.
- Scheduled reporting has execution scheduling and delivery behavior.
- Offboarding and probation use cron/reminder services.

Concrete gaps:

1. Notification channel adapters are incomplete

- `src/modules/notifications/notification-delivery-dispatcher.service.ts:160-164` marks SMS and PUSH deliveries as `SKIPPED` with `No <channel> provider is configured`.
- Email is implemented; SMS/PUSH are not.

2. Offboarding emits events that are not handled by listeners

- `src/modules/hr/offboarding/services/offboarding-cron.service.ts:391` emits `OffboardingAssetOverdueEvent`.
- `src/modules/hr/offboarding/services/offboarding-cron.service.ts:470` emits `OffboardingSettlementOverdueEvent`.
- Listener searches in `src/modules/hr/notifications` found handlers for task overdue, approval reminder, clearance required, clearance overdue, and completed events, but not for asset-overdue or settlement-overdue events.
- Status: `NOT_INTEGRATED`.

3. Queue configuration exists without later-phase queue wiring

- `src/config/env.validation.ts:1209` validates `PAYROLL_QUEUE_CONCURRENCY`.
- `src/config/env.validation.ts:1446` validates `ANALYTICS_QUEUE_CONCURRENCY`.
- No corresponding `registerQueue`, `@Processor`, or Bull queue wiring was found in payroll, employee-finance, or analytics modules.
- This suggests intended async/scaled execution was not finished for those later phases.

## I. Workflow Control and Maker-Checker Findings

Confirmed control strengths:

- Leave prevents self-approval:
  - `src/modules/hr/leave/services/leave-workflow.service.ts:493`
- Leave workflow comments explicitly note self-approval should be skipped with audit notation:
  - `src/modules/hr/leave/services/leave-workflow.service.ts:283`
- Employee movements prevent creator/self approval:
  - `src/modules/hr/employee-movements/employee-movements.service.ts:817`
  - `src/modules/hr/employee-movements/employee-movements.service.ts:823`
- Probation prevents self-review:
  - `src/modules/hr/probation/probation.service.ts:790`
- Employee finance prevents self-approval and maker-approver collisions:
  - `src/modules/hr/employee-finance/services/employee-finance-core.services.ts:1060`
  - `src/modules/hr/employee-finance/services/employee-finance-core.services.ts:1194`
  - `src/modules/hr/employee-finance/services/employee-finance-core.services.ts:1454`

Assessment:

- Maker-checker controls are implemented in several later-phase workflows.
- This is a strong point in the current backend.
- The remaining gap is broader e2e assurance rather than complete absence of maker-checker logic.

## J. Test Coverage Gap Report

E2E tests found:

- `test/app.e2e-spec.ts`
- `test/auth-revocation.e2e-spec.ts`
- `test/authorization.e2e-spec.ts`
- `test/default-avatar-upload.e2e-spec.ts`
- `test/employee-import-endpoints.e2e-spec.ts`
- `test/health.e2e-spec.ts`
- `test/leave-flow.e2e-spec.ts`
- `test/notifications.e2e-spec.ts`
- `test/offboarding-access-termination.e2e-spec.ts`
- `test/permission-matrix.e2e-spec.ts`
- `test/private-documents.e2e-spec.ts`
- `test/scheduled-reporting-execution.e2e-spec.ts`
- `test/scheduled-reporting.e2e-spec.ts`
- `test/tenant-isolation.e2e-spec.ts`
- `test/user-2fa-admin.e2e-spec.ts`
- `test/user-avatar.e2e-spec.ts`

Notable unit/spec coverage exists for:

- Payroll core services
- Employee finance core services
- Analytics core services
- Leave services/workflows/balances
- Offboarding services
- Onboarding service
- Probation service
- Performance scoring/factory logic

Major test gaps:

- No payroll e2e suite found.
- No employee-finance e2e suite found.
- No analytics e2e suite found.
- No probation e2e suite found.
- No performance e2e suite found.
- No onboarding e2e suite found.
- No work-activities e2e suite found.
- No broad attendance end-to-end reconciliation suite was found despite the complexity of that phase.

Important note:

- I did not execute the test suite during this audit.
- This report classifies test presence and coverage shape from the repository structure and source contents only.

## K. Technical Debt and Code Quality Findings

High-signal technical debt:

1. Financial precision drift in payroll

- `src/modules/hr/payroll/services/payroll-core.services.ts:606` returns a proration factor via `Number((numerator / denominator).toFixed(8))`.
- `src/modules/hr/payroll/services/payroll-core.services.ts:799` computes `dailyRate` using `Number(compensation.baseSalary)`.
- `src/modules/hr/payroll/services/payroll-core.services.ts:802` then converts that back into money utilities.
- Status: `DEFECTIVE` for money-safety expectations in payroll.

2. Financial precision drift in employee finance

- `src/modules/hr/employee-finance/services/employee-finance-core.services.ts:497`
- `src/modules/hr/employee-finance/services/employee-finance-core.services.ts:505`
- `src/modules/hr/employee-finance/services/employee-finance-core.services.ts:519`
- These paths use `Number(args.annualInterestRate)` and floating-point monthly-rate math for schedules and payable calculations.
- Status: `DEFECTIVE` for loan/advance schedule precision.

3. Numeric reconciliation drift in analytics

- `src/modules/analytics/services/analytics-core.services.ts:1447`
- `src/modules/analytics/services/analytics-core.services.ts:1450`
- `src/modules/analytics/services/analytics-core.services.ts:1467`
- These reconciliations compare totals using raw `Number(...)`, which is fragile for finance-oriented data verification.

4. Repo hygiene drift

- `src/ormconfig.ts` appears outdated.
- Duplicate/backup seed artifacts exist in the seed folder.
- Compatibility/legacy controllers remain in some HR/attendance areas.

5. Deletion strategy inconsistency

- Some attendance areas use soft deletion, such as geofences/wifi/shifts/timetables.
- Many employee, leave, holiday, assignment, and finance paths still use hard deletion.
- This inconsistency increases audit and recovery risk.

## L. Recommended Remediation Batches

Recommended order of work:

### Batch 1 - Safety and schema blockers

- Resolve the duplicate migration timestamp collision at `1792500000000`.
- Standardize migration/config source of truth and retire or align `src/ormconfig.ts`.
- Replace destructive deletes in historically sensitive HR records with archival/soft-delete strategies where required by business rules.

### Batch 2 - Security hardening

- Add global authentication/tenant enforcement strategy or a stronger default-closed routing posture.
- Add HTTP security middleware such as `helmet`.
- Decide whether persistent user/device/session management is required and implement it if so.

### Batch 3 - Integration completeness

- Implement SMS provider integration.
- Implement PUSH provider integration.
- Add listener handling for `OffboardingAssetOverdueEvent`.
- Add listener handling for `OffboardingSettlementOverdueEvent`.
- Either wire Bull queues for payroll, employee finance, and analytics or remove the unused queue env contract.

### Batch 4 - Financial correctness

- Remove floating-point math from payroll calculations.
- Remove floating-point interest/amortization logic from employee finance.
- Replace raw `Number(...)` reconciliation checks in analytics with precision-safe comparisons.

### Batch 5 - Seed maturity for later phases

- Add probation baseline seeds.
- Add employee movement reference-data seeds.
- Add performance/KPI baseline seeds.
- Add payroll baseline component/structure seeds.
- Add employee-finance product/configuration seeds.
- Add analytics baseline metric/report/dashboard seeds if the product expects turnkey setup.

### Batch 6 - E2E confidence expansion

- Add payroll end-to-end runs.
- Add employee-finance approval/disbursement/repayment e2e flows.
- Add analytics refresh/reconciliation e2e flows.
- Add probation lifecycle e2e flows.
- Add onboarding end-to-end lifecycle e2e flows.
- Add attendance reconciliation/device/mobile/geofence e2e coverage.

## Final Conclusion

This repository already contains a serious HRMS backend, not just placeholders. The strongest parts are structural module coverage, auth/token controls, employee import, leave workflows, onboarding/offboarding workflow engines, scheduled reporting, probation lifecycle modeling, and the existence of later-phase payroll/finance/analytics modules.

The backend is not yet clean enough to call fully complete for Phases 0-16. The highest-value gaps are:

- missing global security defaults
- destructive deletion in historical HR domains
- duplicate migration timestamp ordering risk
- incomplete notification channel/event integration
- unused late-phase queue configuration
- insufficient precision discipline in payroll, employee finance, and analytics
- weak later-phase seed maturity
- missing e2e coverage across several complex domains

No prior Step 1 baseline report was found in this repository during the audit, so this report treats the current source tree as the authoritative implementation truth.
