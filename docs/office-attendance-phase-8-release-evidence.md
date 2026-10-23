# Office Attendance Phase 8: production release evidence

**Readiness: BLOCKED — production readiness has not been demonstrated.**
**Assessment date:** 23 October 2026.

This register coordinates the Phase 8 checklist. An empty evidence field is not a pass. Do not deploy, run migrations, alter device settings, enable retention purges, or run a live punch as part of this preparation.

## Gate status

| Gate | Status | Evidence / action | Owner |
| --- | --- | --- | --- |
| Phase 5 UAT and HR/Payroll/IT/device-owner sign-off | BLOCKED | Complete the authorized device/mobile/database UAT and attach signed evidence. | QA / HR / Payroll / IT / device owner |
| Phase 6 go-live/hypercare exit | BLOCKED | Attach rollout records and two reconciled payroll cycles with approved exit. | Release owner / HR / Payroll / IT |
| Phase 7 steady-state handover | BLOCKED | Complete [Phase 7 operational register](./office-attendance-phase-7-operational-register.md), including owners, targets, escalation routes, and one monthly review. | HR / Payroll / IT |
| Production configuration and identity | NOT VERIFIED | Run `npm run attendance:production:preflight` from `backend` inside the authorized production deployment context after injecting production secrets and evidence references. The script is static and does not connect to or modify production. | IT / release operator |
| Backup, restore and rollback | NOT VERIFIED | Record approved production backup identifier, isolated restore rehearsal, application rollback artifact, and decision owner. | DBA / IT |
| Monitoring, alerts and operational recipients | NOT VERIFIED | Attach liveness/readiness probe evidence, external worker/DB/Redis/scheduler alert receipt, and an attendance sync alert visible to the assigned operator. | IT / DevOps |
| Device reachability and production mapping | NOT VERIFIED | Device owner verifies model/firmware, pull mode, timezone, branch/company mapping and reachability without recording credentials here. | Device owner / IT |
| HR, Payroll, Privacy and Security policies | NOT VERIFIED | Attach approved attendance/overtime rules, data retention, GPS/selfie controls, and location exception/privacy decisions. | HR / Payroll / Privacy / Security |
| First production attendance cycle | NOT RUN | After approved deployment, follow the Phase 8 bounded sample and reconcile source → raw event → mapping → processing → summary → report/payroll preview. | Attendance operator / HR / Payroll |

## Workspace evidence available

| Evidence | Result | Limitation |
| --- | --- | --- |
| Backend mobile/Hikvision/attendance cron focused tests | PASS, 41 tests across 3 suites (22 Oct 2026) | Mock/unit tests; no live device, production queue, or production database. |
| Android application TypeScript check | PASS (22 Oct 2026) | Static type check only. |
| Local PostgreSQL synthetic report/payroll reconciliation | PASS per Module 6 audit | Isolated local test data; does not prove a payroll run or production behavior. |
| UAT preflight in this workspace | BLOCKED | No confirmed UAT identity and operational evidence references; preflight stopped before database connection. |
| Production preflight in this workspace | NOT RUN | No production deployment environment or explicit production target confirmation is available here. |
| Hardware/mobile production operation, backup restore, external alerts, first live cycle | NOT RUN | Requires authorized production operators and devices. |

## Static production configuration gate

Run only inside the approved deployment context with secret values injected by the deployment secret manager; do not paste secrets into a shell transcript or evidence file. The preflight prints pass/block status only and does not show secret values.

It requires: `APP_ENV=production`; an exact `ATTENDANCE_PROD_CONFIRM_DB` match; HTTPS application origins; explicit database TLS policy (certificate verification when TLS is enabled, or a recorded private-network exception); public health details disabled; explicit attendance processing state; required secret presence; and references for Phase 5/6/7 sign-offs, release/change approval, operator, backup/restore, monitoring, device, retention, Privacy/Security, Payroll, HR, and service owners/targets.

Command: `cd backend; npm run attendance:production:preflight`

A successful static preflight means **ready for authorized operator review only**. It does not prove runtime health, migration state, device connectivity, permissions, notification delivery, backups, or scenario acceptance.

## Release decision and approvals

| Function | Approver / role | Decision | Date | Change/evidence reference |
| --- | --- | --- | --- | --- |
| Release owner | | NOT RECORDED | | |
| HR | | NOT RECORDED | | |
| Payroll | | NOT RECORDED | | |
| IT / DBA | | NOT RECORDED | | |
| Privacy / Security | | NOT RECORDED | | |
| Device owner | | NOT RECORDED | | |

**Release remains blocked** until the prior phase gates are signed, configuration and operational controls are verified, all applicable critical scenarios pass, the sample live cycle reconciles without unexplained variance, rollback readiness is evidenced, and the required approvers record their decisions.
