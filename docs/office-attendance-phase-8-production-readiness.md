# Office Attendance Phase 8: production readiness

This checklist is the production release gate for Office Attendance. Complete it with authorized production operators and retain evidence in the change record. Local code checks do not establish device connectivity, policy approval, or a successful live attendance cycle.

**Current readiness:** blocked pending Phase 5 UAT, Phase 6 hypercare exit, and Phase 7 handover. Use the [Phase 8 release evidence register](./office-attendance-phase-8-release-evidence.md). A static, non-networking configuration gate is available as `npm run attendance:production:preflight` from `backend`; it does not deploy or prove runtime readiness.

## Production configuration and access

- [ ] Confirm the production environment identity, API/frontend URLs, database, Redis/queue, worker count, scheduler ownership, and timezone with IT.
- [ ] Validate required attendance/Hikvision credentials are supplied by the production secret store. Confirm `ATTENDANCE_PROCESSING_ENABLED`, attendance cron settings, and Hikvision automatic sync settings are appropriate for the approved operating schedule.
- [ ] Confirm production devices are active, configured for pull sync, mapped to the correct company/branch, and reachable from the backend. Verify credentials and timezones with the device owner; never store credentials in this record.
- [ ] Review role and direct permission assignments for `access_control_sync:execute`, `attendance_processing:read`, `attendance_processing:execute`, and `attendance_summaries:read`. Verify an authorized operator can inspect history and resolve exceptions, while an unauthorized user is denied.
- [ ] Record HR, Privacy, Security, IT, and Payroll sign-offs for GPS purpose/retention, selfie requirements/retention, location exceptions, map provider, device replacement, and attendance-to-payroll rules. The attendance controls are configurable, but code defaults are not company approval.
- [ ] Confirm the approved data-retention period and legal/business owner for raw biometric attendance events, device sync logs, audit records, and reports. The code checks raw Hikvision logs daily, but the retention period is intentionally unset and deletion defaults off. After approval, configure `ATTENDANCE_RAW_LOG_RETENTION_DAYS` in deployment secrets, observe dry-run candidate counts, verify backups and restore, then explicitly enable `ATTENDANCE_RAW_LOG_RETENTION_PURGE_ENABLED=true` only after a different authorized reviewer has approved a one-time purge request in Attendance Retention Safeguards. Active per-record legal holds are excluded from purge.
- [ ] Approve selfie retention with the privacy/data owner. `ATTENDANCE_SELFIE_RETENTION_DAYS` defaults to `0` and `ATTENDANCE_SELFIE_RETENTION_PURGE_ENABLED` defaults to `false`; configure a period, review dry-run counts, verify backups, place legal holds where required, and use the one-time in-app purge approval before enabling purge.
- [ ] If offline punches are approved, enable `allow_offline_punches` and set a reviewed `offline_max_age_hours` (1–72). Include delayed punch review in manager procedures. QR checkpoint punches remain online-only, and queued punches require a native app build with SQLCipher enabled.
- [ ] Confirm backups include attendance source logs, sync history, summaries, correction/audit records, and notification records as required; record a recent restore test.

## Monitoring and sync-failure alerts

- [x] Failed and partial attendance syncs are recorded in Hikvision sync history and exposed in the device sync-log view.
- [x] An hourly alert scan creates deduplicated in-app notifications for active company users with `access_control_sync:execute`, whether permission is direct or role-based. Alerts link to attendance device sync logs.
- [ ] Assign at least one active permission holder per company as the operational alert recipient. The service logs a warning when no recipient is configured.
- [ ] Confirm the production notification worker delivers an alert during a controlled failed/partial sync and that it is visible to the intended operator.
- [ ] Configure external infrastructure alerts for backend/worker health, database/Redis availability, and scheduler liveness. Application notifications cannot report a fully stopped backend process.
- [ ] Agree numerical response/recovery windows for device failures, unmatched events, processing backlog, and payroll cutoff with HR, Payroll, and IT.
- [ ] Name primary/backup operational owners, support channel, service targets, and payroll cutoff escalation; configure external alert destinations and verify receipt.

### Evidence to capture

| Control | Verification | Result / evidence / operator / time |
|---|---|---|
| Application liveness | Monitoring can call `/api/health/live` and alert on non-2xx or missed probes. | ____________________ |
| Dependency readiness | Monitoring can call `/api/health/ready`; verify database, Redis when enabled, and disk checks. Keep detailed health output private. | ____________________ |
| Attendance sync notification | Create/identify an approved controlled failed or partial test run; verify an in-app alert arrives for the assigned operator and links to the sync history. | ____________________ |
| Scheduler and worker liveness | Use infrastructure/process monitoring to detect stopped API instances, queue workers, and scheduler instances; health routes alone cannot detect an entirely stopped process. | ____________________ |
| Recovery ownership | Record incident channel, primary/backup support contacts, payroll cutoff escalation, and decision owner. | ____________________ |

Do not expose database errors, connection details, or environment values in public monitoring dashboards. `HEALTH_EXPOSE_DETAILS` must remain disabled on public production probes unless access is restricted to trusted operators.

## Recovery instructions

1. Open the device's attendance sync history and capture the failed/partial sync ID, device ID, time window, status, and error details.
2. Check device reachability, timezone, credentials, sync mode, and backend/queue health with IT. Do not edit raw events to clear the failure.
3. Resolve the underlying problem, then replay the original bounded date/time range using the documented Hikvision attendance UAT runbook's sync procedure.
4. Confirm the rerun is deduplicated, all pages completed, the employee mapping is correct, and the attendance recalculation job completed.
5. Reconcile raw device events to daily summaries and the report for the affected employee/date range. Record evidence and close the incident only after HR/Payroll confirms any payable impact.
6. If source data, company/employee identity, or payroll totals cannot be safely reconciled, stop cohort expansion and follow the Phase 6 incident/rollback criteria.

## Sample attendance reconciliation

Use a small, approved sample covering a standard shift, a remote-eligible shift if configured, one overtime/holiday case if applicable, and an overnight shift if used.

| Evidence | Record |
|---|---|
| Employee, company/branch, schedule and policy version | ____________________ |
| Source punch IDs and device/mobile source timestamps | ____________________ |
| Device timezone and expected local attendance date | ____________________ |
| Raw log IDs and mapping/processing state | ____________________ |
| Daily summary: status, worked minutes, late/early, overtime | ____________________ |
| Approved schedule/correction and approval evidence | ____________________ |
| Report/payroll preview totals and variance explanation | ____________________ |
| HR, Payroll, IT reviewer and result | ____________________ |

- [ ] Every sampled punch maps to the correct employee/company/branch and local date.
- [ ] Processed summaries match the approved schedule and policy calculations.
- [ ] Report/payroll preview totals reconcile; all differences have an approved explanation.

## Deployment and first live cycle

- [ ] Phase 5 UAT, Phase 6 go-live, and Phase 7 operations gates are signed.
- [ ] Production backup and rollback owner/procedure are confirmed before deployment.
- [ ] Release commit, migrations, configuration change, operator, and deployment time are recorded.
- [ ] Deploy through the approved pipeline; check startup, worker, scheduler, and database migration health.
- [ ] Run a controlled sync/punch and verify source event → raw log → employee mapping → processing → daily summary → report.
- [ ] Monitor the first full live attendance cycle, review queues and failed-sync alerts, and reconcile the agreed sample before marking Phase 8 complete.

### Rollback rehearsal record

Before production release, the named IT recovery owner confirms a recent database backup can be restored using the approved procedure and identifies the application rollback artifact. Record evidence without putting credentials or backup contents in this document.

| Evidence | Record |
|---|---|
| Backup identifier, timestamp and retention expiry | ____________________ |
| Restore rehearsal date, isolated target and result | ____________________ |
| Release artifact/commit and migration rollback or forward-fix decision | ____________________ |
| Incident commander and rollback decision owner | ____________________ |
| Recovery time objective / payroll cutoff constraint | ____________________ |
| HR and Payroll validation after restore/replay | ____________________ |

Do not rehearse by restoring over production. A restore rehearsal uses an isolated target and approved access.

## Current workspace verification

- Focused attendance/Hikvision regression suites: record result and build identifier: ____________________
- Backend lint/typecheck: record result and build identifier: ____________________
- Live production connectivity, sample reconciliation, deployment, and first-cycle result: ____________________

Phase 6 daily hypercare entries and Phase 7 approved service targets/period-close evidence are required attachments to the production release record; an unfilled template is not evidence of completion.

**Complete only when** production configuration, access, connectivity, retention ownership, alerts, recovery, and rollback are verified, and the first live cycle reconciles successfully. The production checks above remain open until executed by authorized operators.
