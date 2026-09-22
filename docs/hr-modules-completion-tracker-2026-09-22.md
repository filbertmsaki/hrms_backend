# HR Modules 100% Completion Tracker

Date: 2026-09-22

This tracker defines what "100% complete" means for each HRMS HR module across backend and frontend.

## Completion Gates

Each module is complete only when all applicable gates pass:

- Backend API and domain logic are implemented and wired into Nest modules.
- Frontend routes/components expose the expected workflows.
- Unit/service tests cover core business rules and failure paths.
- Backend e2e tests cover create/read/update/workflow/security paths with persistence where practical.
- Frontend API helper tests and route smoke/e2e tests cover visible surfaces.
- Permission, tenant, self/team/department/branch scope, and cross-user access protections are verified.
- Seeds/migrations/config needed for a fresh environment are present and idempotent.
- Background jobs, notifications, retries, idempotency, and concurrency are verified where relevant.
- Performance/reconciliation evidence exists for heavy processing modules.

## Current Verified Baseline

Commands run on 2026-09-22:

- Backend: `npm run typecheck` passed.
- Frontend: `npm run build` passed.
- Backend targeted HR suite passed: 8 suites, 77 tests.
- Backend attendance unit slice passed: 22 suites, 103 tests.
- Backend WiFi mobile-attendance validation internals passed: 1 suite, 7 tests.
- Backend geofence distance/accuracy validation internals passed: 1 suite, 4 tests.
- Backend checkpoint configuration/scope internals passed: 1 suite, 14 tests.
- Backend device sync-log service validation/query coverage passed: 1 suite, 5 tests.
- Backend attendance endpoint e2e passed: 1 suite, 19 tests.
- Backend attendance recalculation/processing unit verification passed: 2 suites, 7 tests.
- Backend HR e2e slice passed: 6 suites, 30 tests.
- Backend leave unit slice passed: 4 suites, 23 tests.
- Backend leave flow e2e passed with submit, approve, return/resubmit, and cancel recalculation coverage: 1 suite, 4 tests.
- Backend onboarding unit slice passed: 2 suites, 11 tests.
- Backend onboarding flow e2e passed with request, document, task, approval, acknowledgement, completion, rejection/cancel, and permission-denial coverage: 1 suite, 3 tests.
- Backend employee invitations service slice passed with pending list, email/SMS delivery, delivery failure, and invitation owner scope coverage: 1 suite, 4 tests.
- Backend employee invitations e2e passed with create/list/resend, public lookup/acceptance, strong password validation, and permission-denial coverage: 1 suite, 3 tests.
- Backend offboarding unit/integration slice passed with access termination, workflow, letters, cron overdue/reminder events, asset-liability settlement, and finalization coverage: 6 suites, 27 tests.
- Backend offboarding flow e2e passed with request, submit, document, task, asset, settlement, clearance, approval, access termination, completion/finalization, rejection/cancel, and permission-denial coverage: 1 suite, 3 tests.
- Backend onboarding/invitation/offboarding combined flow e2e passed: 3 suites, 9 tests.
- Backend probation service slice passed with scope, lifecycle, manager review, HR decision, extension limit, and manual case coverage: 1 suite, 15 tests.
- Backend probation e2e slice passed with policy/case CRUD, manager dashboard/team scope, manager review, HR decision, letter generation, and permission-denial coverage: 2 suites, 15 tests.
- Backend employee movements service/scheduler slice passed with lifecycle, compensation, approval/application, operation, scheduler, reminder, lock, and error handling coverage: 2 suites, 38 tests.
- Backend employee movements flow e2e passed with draft CRUD, submit, cancel, delete, approve, reject, return, apply, letter generation, operation listing/retry, and permission-denial coverage: 1 suite, 3 tests.
- Backend self-service controller movement coverage passed with list/detail and acknowledgement routing: 1 suite, 8 tests.
- Backend performance service slice passed with scorecard, 360 feedback, workflow, employee KPI, KPI data source, applicability, progress, scoring, and period factory coverage: 9 suites, 32 tests.
- Backend performance workflow e2e passed with self review, manager review, HR approval, workflow approval, moderation, reopen, appeal, PIP, 360 feedback, calibration, and permission-denial coverage: 1 suite, 3 tests.
- Backend work-activities unit slice passed with field location enrichment fallback coverage: 1 suite, 3 tests.
- Backend work-activities flow e2e passed with daily activity creation/evidence/submission/manager review, field visit planning/check-in/check-out/evidence/manager review, manager map/planned-vs-actual/follow-up/exception routes, and permission-denial coverage: 1 suite, 3 tests.
- Backend HR notification listener slice passed with leave, onboarding, offboarding overdue, employee-movement approval/decision/applied mail, in-app, SMS queue, action item, and error swallowing coverage: 2 suites, 11 tests.
- Backend notifications core unit/integration slice passed with delivery flow, service, preferences, and gateway coverage: 4 suites, 11 tests.
- Backend notifications HTTP e2e passed with permission denial, create/list/unread, mark read, archive, and unauthenticated rejection coverage: 1 suite, 5 tests.
- Backend: `npm run typecheck` passed after employee movements, performance, work-activities, notifications, and manager field-visit route-order changes.
- Backend employee positions flow e2e passed with assignment create/list/detail/update/end and permission-denial coverage: 1 suite, 2 tests.
- Backend branch flow e2e passed with CRUD, access grant/revoke/list, audit context, and permission-denial coverage: 1 suite, 2 tests.
- Backend department/position flow e2e passed with department CRUD, position CRUD, department-position assignment/list/removal, department access grant/revoke/list, and permission-denial coverage: 1 suite, 2 tests.
- Backend departments/positions/position-availability service slice passed: 3 suites, 18 tests.
- Backend grade/cost-center flow e2e passed with grade CRUD, cost-center CRUD, tenant scoping, and permission-denial coverage: 1 suite, 3 tests.
- Backend org/support flow e2e group passed for employee positions, branches, departments, positions, grades, and cost centers: 4 suites, 9 tests.
- Frontend org-structure API helper test passed with employee-position lifecycle, branch CRUD/access, and cost-center CRUD coverage: 1 file, 3 tests.
- Frontend org/movement/foundation helper slice passed after employee-position `is_primary` query support fix: 4 files, 30 tests.
- Backend manager-self-service, dashboards, and action-inbox controller/service slice passed with manager dashboard/team/action-items/team-attendance routing, dashboard endpoint routing, action item idempotency, and manager scope coverage: 4 suites, 13 tests.
- Backend: `npm run typecheck` passed after manager self-service team-attendance route-order fix and dashboard/action-inbox controller coverage.
- Backend launch-readiness/default-avatars slice passed with launch checklist aggregation, missing-permission next steps, per-employee readiness summary/checkOne coverage, launch-readiness controller tenant routing, default-avatar controller tenant routing, and default-avatar service edge coverage: 5 suites, 22 tests.
- Backend: `npm run typecheck` passed after launch-readiness and default-avatar coverage expansion.
- Frontend attendance refresh API helper test passed: 1 file, 2 tests.
- Frontend targeted HR/API helper suite passed: 9 files, 43 tests.
- Frontend TypeScript check after route coverage expansion passed: `npx tsc --noEmit --incremental false`.

## Priority Modules Requested

| Module | Current status | Remaining to reach 100% |
| --- | --- | --- |
| `attendance` | Implemented; unit slice, endpoint/security e2e including checkpoint, device sync-log, shift assignment, and manual schedule override security; recalculation endpoints, manual adjustments, refresh alias compatibility, checkpoint/geofence/WiFi validation internals, and frontend refresh helper coverage passing | Persistence e2e for processing reconciliation, broader scope matrix, concurrency/performance baseline. |
| `leave` | Strong implementation; unit slice and selected e2e passing, including returned-for-correction resubmission cycle | Broader workflow e2e permutations beyond submit/approve/resubmit/cancel, carry-forward/accrual edge cases, manager/department/branch scope matrix, frontend route smoke for self and HR views. |
| `onboarding` | Implemented; targeted service tests and lifecycle endpoint e2e passing for invitation/create/list/resend/accept, request/task/document/approval/acknowledgement/completion, plus provisioning/probation handoff response coverage | Persistence e2e for invitation-to-request acceptance side effects, provisioning/probation side effects, frontend self/HR journey coverage. |
| `offboarding` | Implemented; unit/integration, access-termination e2e, and lifecycle endpoint e2e passing for request/task/document/asset/settlement/clearance/approval/access/completion/finalization flows | Persistence e2e for full exit lifecycle settlement reconciliation across real repositories, frontend HR/self route coverage. |
| `probation` | Implemented with unit and e2e coverage passing for policy/case CRUD, manager/team scope, manager review, HR decision, letters, manual lifecycle, and permission denial | Reminder e2e, self-view/frontend route coverage, and broader manager/security scope matrix. |
| `employee-movements` | Implemented; service/scheduler slice and endpoint lifecycle e2e passing for draft CRUD, submit, cancel/delete, approve/reject/return, apply, letter generation, operation listing/retry, compensation payload routing, permission denial, and self-service list/detail/acknowledgement routing | Persistence e2e for transfer/promotion/acting-role side effects, compensation version creation, acknowledgement side effects, rollback after failed apply, and frontend HR/team/self coverage. |
| `performance` | Implemented; service slice and cross-controller workflow e2e passing for self review, manager review, HR approval/workflow, moderation, reopen, appeal, PIP, 360 feedback, calibration, and permission denial; frontend API tests passing and smoke-route coverage expanded | Persistence e2e for review-cycle side effects, KPI baseline seed checks, calibration data accuracy, broader manager scope matrix, run frontend self/manager/HR route smoke. |
| `work-activities` | Implemented; endpoint e2e passing for daily activity creation/evidence/submission/manager review, field visit planning/check-in/check-out/evidence/manager review, and manager map/planned-vs-actual/follow-up/exception routes; location enrichment fallback unit coverage passing; frontend API tests passing | Persistence e2e for daily/field side effects, offline sync conflict/retry coverage, frontend self/manager/HR route smoke. |
| `self-service` | Implemented across multiple modules; movement list/detail/acknowledgement controller coverage passing | Employee-facing permission matrix, profile-change/file e2e, cross-user access protection, frontend self workspace route smoke. |
| `notifications` | Implemented; HR listener unit tests, core notification unit/integration tests, and HTTP e2e passing, including employee movement mail events, leave/onboarding/offboarding in-app and mail events, SMS queue paths, create/list/unread/read/archive, and permission denial | Full template/channel matrix, SMS configured/unconfigured edge expansion, push unsupported behavior, frontend notification-center e2e, delivery retry/idempotency coverage. |

## Remaining HR Submodules

| Submodule | Current status | Remaining to reach 100% |
| --- | --- | --- |
| `employees` | Implemented | Employee lifecycle e2e, audit-safe delete/archive strategy, sensitive-field permission matrix, frontend directory/profile workflow coverage. |
| `employee-invitations` | Implemented; service and endpoint e2e coverage for pending list, create, resend, public lookup/acceptance, strong-password validation, delivery failure, and owner-scope restoration | Expiry/cancel e2e, duplicate invite race tests, delivery retry tests, frontend invite/register journey coverage. |
| `employee-positions` | Implemented; assignment history endpoint e2e passing for create/list/detail/update/end and permission denial; frontend API helper lifecycle coverage passing including `is_primary` query support | Persistence validation against branch/department availability, frontend employee profile/position route smoke. |
| `branches` | Implemented; CRUD/access endpoint e2e passing with audit context and permission denial; frontend branch CRUD/access helper coverage passing | Persistence dependency behavior for disable/delete, branch-scope security matrix, frontend branch route smoke. |
| `departments` | Implemented; CRUD, department-position assignment, access endpoint e2e, and service slice passing | Persistence dependency checks, broader manager/department scope validation, frontend department route smoke. |
| `positions` | Implemented; CRUD and department-assignment endpoint e2e plus service/availability slice passing | Persistence dependency checks for deletion/availability, frontend positions route smoke. |
| `grades` | Implemented; CRUD endpoint e2e passing with tenant scoping and permission denial | Payroll/performance dependency checks, baseline seed validation, frontend grade route smoke. |
| `cost-centers` | Implemented; CRUD endpoint e2e passing with tenant scoping; frontend CRUD helper coverage passing | Payroll/finance mapping/dependency checks, frontend structure route smoke. |
| `documents` | Implemented; private employee document e2e passing | Retention/purge/download audit consistency across onboarding, offboarding, and leave documents. |
| `payroll` | Implemented with e2e present | Bank batch, accounting journal, final settlement reconciliation, concurrency tests, money precision review. |
| `employee-finance` | Implemented with e2e present | Expanded loan/advance lifecycle e2e, amortization precision review, payroll deduction edge cases. |
| `dashboards` | Implemented; dashboard controller routing coverage passing for employee, manager, HR, and management dashboards | Manager/analytics access matrix and dashboard accuracy checks against source modules. |
| `manager-self-service` | Implemented; manager dashboard, team, team member, team attendance, action item controller coverage and service scope coverage passing | Broader team/department/branch scope certification, frontend manager dashboard/action workflow route smoke. |
| `action-inbox` | Implemented; action item idempotency/completion service coverage and manager action-items controller routing passing | End-to-end action creation/completion across leave, onboarding, offboarding, performance, and probation with real module emitters. |
| `default-avatars` | Mostly complete; service edge coverage and controller tenant routing coverage passing for list/detail/create/update/set-default/delete | Live guard e2e for permission denial and cross-company leakage against real auth context, frontend settings route smoke. |
| `launch-readiness` | Implemented; checklist aggregation, missing-permission next steps, per-employee readiness summary/checkOne, and controller tenant routing coverage passing | Persistence e2e against seeded production-like checklist data and frontend readiness route smoke. |
| `shared` | Support code | Scope/access regression tests as dependent modules expand. |

## Work Order

1. Attendance completion slice.
2. Leave + self-service completion slice.
3. Onboarding + employee-invitations completion slice.
4. Offboarding + notifications + action-inbox completion slice.
5. Probation + manager-self-service completion slice.
6. Employee movements + employee-positions completion slice.
7. Performance + work-activities completion slice.
8. Employees/org structure/documents completion slice.
9. Payroll + employee-finance reconciliation slice.
10. Dashboards/readiness/final frontend e2e slice.

## Definition Of Done For The Goal

The goal is complete when:

- All modules above have passing backend unit/service tests.
- All modules above have backend persistence e2e or equivalent integration coverage.
- All listed frontend routes have passing smoke/e2e coverage.
- `npm run typecheck`, backend targeted tests, frontend targeted tests, and production frontend build pass.
- Security scope matrices are present for employee, manager, HR, and platform/admin users where relevant.
- Remaining non-code certification evidence is recorded in this tracker or a dated verification report.
