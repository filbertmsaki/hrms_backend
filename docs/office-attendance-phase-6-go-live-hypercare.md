# Office Attendance Phase 6: go-live and hypercare

Phase 6 moves the attendance module from signed-off UAT into a controlled production rollout, then monitors the first payroll cycles. Complete the release gates in Phase 5 before scheduling production work.

## Go-live gates

- [ ] Phase 5 UAT evidence is complete and HR, Payroll, and IT have signed the release record.
- [ ] Production attendance policy, active shifts/timetables, employee assignments, holiday groups, device assignments, and remote-work eligibility are reviewed against the approved policy version.
- [ ] Production secrets, URLs, worker/queue settings, scheduled jobs, device credentials, and timezone settings are verified through the deployment secret store. No secret values are written into this checklist.
- [ ] Database backup completes and a restore owner confirms the rollback path. Record backup identifier and timestamp.
- [ ] Migration status is reviewed against the release build. Apply only the approved migrations through the normal deployment pipeline; record the release commit, migration result, and operator.
- [ ] Confirm production role assignments for employees, managers, HR, Payroll, attendance operators, and system workers. Validate company and branch boundaries.
- [ ] Confirm notification recipients and links use production URLs; disable test recipients and sandbox integrations.
- [ ] Set an agreed change window, support contacts, incident owner, payroll cutoff, and rollback decision owner.

## Controlled rollout

1. Start with one approved branch and a small employee cohort spanning office, mobile, remote-enabled, shift, and biometric attendance.
2. Verify a mobile punch and (where configured) one Hikvision punch from capture through raw log, employee mapping, processing, daily summary, and report.
3. Compare device/source records, daily summaries, correction history, and payroll preview for the same sample dates.
4. Expand by branch only after HR and IT confirm the previous cohort reconciles. Record the rollout time and cohort for each expansion.
5. Keep existing approved payroll controls in place until Payroll signs the first production reconciliation.

## First-cycle monitoring

For each operating day during the first two payroll cycles, the named attendance operator reviews:

- Hikvision device sync status/history, failed or partial syncs, unexpected zero-event windows, and device connectivity.
- Unmatched employee logs, failed processing exceptions, pending recalculation jobs, and unresolved correction requests.
- A sample of employee attendance history against raw punches, including overnight shifts and local device time.
- Late, absent, half-day, overtime, holiday/rest-day, and remote attendance totals against the approved policy.
- Daily and payroll-period report totals against source records and the payroll preview.

Record counts, exceptions, owner, resolution, and evidence in the operational log. Assign an owner and due date to every unresolved item before payroll close.

### Daily hypercare record

Create one record per operating day and retain links to source exports/screenshots in the controlled release folder. Do not put employee selfies, device credentials, tokens, or unnecessary personal data in the record.

| Field | Daily entry |
|---|---|
| Date, local timezone, release/build, cohort and branches | ____________________ |
| Scheduled/expected device syncs; successful / partial / failed / missing | ____________________ |
| Raw source events; mapped / unmapped / duplicate counts | ____________________ |
| Processing backlog; oldest item; failed/retried jobs | ____________________ |
| Mobile punches; accepted / pending override / rejected | ____________________ |
| Corrections and approvals still open | ____________________ |
| Reconciliation sample size and unexplained variance | ____________________ |
| Payroll preview variance and cutoff risk | ____________________ |
| Incident/defect IDs, owners and due times | ____________________ |
| HR / Payroll / IT reviewer and decision to expand, hold or roll back | ____________________ |

Expansion requires a recorded decision for the previous cohort. A missing review is a hold, not an implicit pass.

### Go / hold / rollback decision

- **Go:** all expected sources arrived; no unresolved identity, access, duplicate-payable-time or local-date defect exists; the sample reconciles; queue age and payroll variance are inside organization-approved limits; HR and IT sign the cohort record.
- **Hold:** evidence is incomplete, any queue exceeds its approved window, a source is missing, or a variance remains unexplained. Keep the cohort size unchanged and assign an owner and due time.
- **Rollback / pause processing:** a wrong-company/employee assignment, duplicate payable result, unauthorized access, unsafe data loss, or material unreconciled payroll mismatch occurs. The incident owner chooses the deployment/database recovery action; preserve original sources and audit records.

No numeric service threshold is invented here. HR, Payroll, and IT must set the numeric windows and payroll materiality before rollout and write them into the Phase 7 handover register.

## Incident and rollback criteria

Pause cohort expansion and notify the incident owner if any of the following occurs:

- Attendance is assigned to the wrong employee, company, branch, local date, or shift.
- A repeat sync or processing retry creates duplicate punches, summaries, or payable overtime.
- A material source-to-summary or summary-to-payroll mismatch cannot be explained and corrected before payroll cutoff.
- Device or processing failures are not visible or cannot be recovered within the agreed service window.
- An employee or operator can access or change another company's or unauthorized employee's attendance.

For an incident, retain raw source events and audit history, pause automated expansion or processing only under the incident owner's direction, and use the approved database restore/deployment rollback procedure. Do not delete or overwrite source punches to hide a mismatch. After correction, replay the bounded date range and reconcile it before resuming.

## Handover and closure

- [ ] HR owns attendance corrections, policy interpretation, and exception resolution.
- [ ] Payroll owns overtime/holiday approval and payroll reconciliation.
- [ ] IT owns devices, credentials, queue/worker health, backups, deployments, and incident response.
- [ ] Each queue has a named daily owner and a backup owner.
- [ ] The two initial payroll cycles reconcile and have HR/Payroll sign-off.
- [ ] Open defects, workarounds, and deferred enhancements have named owners and due dates.

## Release record

- Production release/commit: ____________________
- Migration and backup identifiers: ____________________
- Rollout date and cohorts: ____________________
- First payroll reconciliation result: ____________________
- HR / Payroll / IT sign-off and date: ____________________
- Remaining issues and owners: ____________________
- Approved response/recovery windows and variance limits: ____________________
- Daily hypercare evidence location and retention: ____________________
- Go / hold / rollback decisions by cohort: ____________________
- Hypercare start/end and exit approval: ____________________

This document is an execution checklist. It does not mean a production deployment or payroll sign-off has occurred; those actions require the organization's production change process and authorized operators.

After hypercare exit criteria are met, use [Phase 7 steady-state operations](./office-attendance-phase-7-steady-state-operations.md) for ongoing ownership, reviews, and controlled policy changes.
