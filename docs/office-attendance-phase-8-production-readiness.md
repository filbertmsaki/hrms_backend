# Office Attendance Phase 8: production readiness

This checklist is the production release gate for Office Attendance. Complete it with authorized production operators and retain evidence in the change record. Local code checks do not establish device connectivity, policy approval, or a successful live attendance cycle.

## Production configuration and access

- [ ] Confirm the production environment identity, API/frontend URLs, database, Redis/queue, worker count, scheduler ownership, and timezone with IT.
- [ ] Validate required attendance/Hikvision credentials are supplied by the production secret store. Confirm `ATTENDANCE_PROCESSING_ENABLED`, attendance cron settings, and Hikvision automatic sync settings are appropriate for the approved operating schedule.
- [ ] Confirm production devices are active, configured for pull sync, mapped to the correct company/branch, and reachable from the backend. Verify credentials and timezones with the device owner; never store credentials in this record.
- [ ] Review role and direct permission assignments for `access_control_sync:execute`, `attendance_processing:read`, `attendance_processing:execute`, and `attendance_summaries:read`. Verify an authorized operator can inspect history and resolve exceptions, while an unauthorized user is denied.
- [ ] Confirm the approved data-retention period and legal/business owner for raw biometric attendance events, device sync logs, audit records, and reports. The code checks raw Hikvision logs daily, but the retention period is intentionally unset and deletion defaults off. After approval, configure `ATTENDANCE_RAW_LOG_RETENTION_DAYS` in deployment secrets, observe dry-run candidate counts, verify backups and restore, then explicitly enable `ATTENDANCE_RAW_LOG_RETENTION_PURGE_ENABLED=true` if purge is approved.
- [ ] Confirm backups include attendance source logs, sync history, summaries, correction/audit records, and notification records as required; record a recent restore test.

## Monitoring and sync-failure alerts

- [x] Failed and partial attendance syncs are recorded in Hikvision sync history and exposed in the device sync-log view.
- [x] An hourly alert scan creates deduplicated in-app notifications for active company users with `access_control_sync:execute`, whether permission is direct or role-based. Alerts link to attendance device sync logs.
- [ ] Assign at least one active permission holder per company as the operational alert recipient. The service logs a warning when no recipient is configured.
- [ ] Confirm the production notification worker delivers an alert during a controlled failed/partial sync and that it is visible to the intended operator.
- [ ] Configure external infrastructure alerts for backend/worker health, database/Redis availability, and scheduler liveness. Application notifications cannot report a fully stopped backend process.
- [ ] Agree numerical response/recovery windows for device failures, unmatched events, processing backlog, and payroll cutoff with HR, Payroll, and IT.

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

## Current workspace verification

- Focused attendance/Hikvision regression suites: record result and build identifier: ____________________
- Backend lint/typecheck: record result and build identifier: ____________________
- Live production connectivity, sample reconciliation, deployment, and first-cycle result: ____________________

**Complete only when** production configuration, access, connectivity, retention ownership, alerts, recovery, and rollback are verified, and the first live cycle reconciles successfully. The production checks above remain open until executed by authorized operators.
