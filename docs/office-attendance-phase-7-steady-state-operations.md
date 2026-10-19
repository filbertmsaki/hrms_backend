# Office Attendance Phase 7: steady-state operations

Phase 7 begins after the Phase 6 hypercare exit criteria are met. It establishes the recurring operating model for attendance, devices, corrections, payroll reconciliation, and policy changes.

## 1. Service ownership

| Work area | Accountable owner | Backup | Routine responsibility |
|---|---|---|---|
| Attendance policy and exceptions | HR | HR delegate | Approve policy interpretation, own unmatched/exception queues, review corrections and audit trail. |
| Overtime and payroll reconciliation | Payroll | Payroll delegate | Review approvals and payable minutes; reconcile attendance reports to payroll before each cutoff. |
| Devices, integrations, queue workers, backups, deployment | IT | IT delegate | Maintain device connectivity/timezones, secrets, workers, recovery, monitoring, backup and release records. |
| Employee roster and schedules | HR / workforce scheduling owner | Named scheduler | Maintain effective-dated shifts, timetables, rotations, holidays, and employee assignments. |

Record actual names, contact route, coverage hours, and escalation path in the service register before handover. The roles above are functional owners; they do not grant additional system permissions.

## 2. Operating cadence

### Each operating day

- Review failed/partial Hikvision syncs and unexpected zero-event windows; replay bounded ranges after resolving the cause.
- Review unmatched logs, failed processing exceptions, and pending recalculation jobs. Assign an owner and due time to each item.
- Sample raw punches against daily summaries, including overnight shifts, remote punches, and the local device timezone.
- Resolve employee correction requests under the configured approval workflow and retain the audit record.

### Each payroll period

- Close attendance only after source-to-summary reconciliation and exception review.
- Reconcile regular, pending, approved, and payable overtime; holiday/rest-day totals; absences; and manual adjustments against the payroll preview.
- Confirm late corrections and backdated changes have triggered recalculation for all affected dates, including later dates subject to monthly overtime caps.
- Obtain HR and Payroll approval and retain report exports and the period close record.

### Monthly

- Review device sync reliability, event mapping quality, queue age, exception volumes, correction volumes, report reconciliation differences, and payroll adjustments.
- Review active policies, holiday calendars, employee schedule coverage, device-to-employee mappings, and remote-work eligibility for stale or conflicting records.
- Review privileged attendance permissions and remove access no longer required.
- Track recurring issues as product/configuration defects with a named owner and due date.

### Quarterly and before material policy changes

- Reconfirm approved grace, thresholds, rounding, overtime caps/approvals, holiday treatment, and payroll multipliers with HR and Payroll.
- Re-test representative threshold boundaries and mobile/Hikvision controls in UAT before applying changed rules in production.
- Review recovery steps, backup restore evidence, device credentials, and contact/escalation details with IT.

## 3. Service indicators and thresholds

Track these indicators in an operational register or approved monitoring system. Set numerical targets and service windows with HR, Payroll, and IT before relying on automated alerts.

| Indicator | Calculation | Escalate when |
|---|---|---|
| Sync completion | Successful/partial/failed runs by device and scheduled window | A required device misses the organization-approved recovery window or repeatedly returns partial/failed results. |
| Unmapped event rate | Unmapped attendance logs / valid attendance logs | Any event remains unresolved at payroll cutoff, or rate exceeds the company-approved threshold. |
| Processing backlog | Pending/failed raw events and recalculation jobs by oldest age | Items exceed the approved processing window or block a payroll close. |
| Attendance reconciliation | Difference between source punches, processed summaries, and report totals | Any unexplained employee/day difference remains at close. |
| Correction turnaround | Open correction requests by age and status | Requests exceed the HR-approved service target or affect payroll close. |
| Payroll variance | Difference between approved attendance totals and payroll preview | Any unexplained payable-time or amount variance remains before payroll approval. |

## 4. Incident management

1. Record incident time, affected company/branch/device/employee/date range, release version, visible job IDs, and business impact. Do not place passwords or tokens in the incident record.
2. Preserve original events, sync history, processing records, adjustments, and audit logs. Avoid destructive edits to source punches.
3. Assign an incident owner and notify HR, Payroll, or IT according to the affected function and payroll cutoff risk.
4. Resolve the root cause, retry only the bounded affected range, and verify deduplication plus downstream summaries/reports.
5. Record reconciliation evidence and communicate closure to affected owners. Turn recurring incidents into a tracked corrective action.

For wrong-employee/company access, duplicate payable attendance, unexplained payroll variance, or unrecoverable device/processing loss, follow the Phase 6 pause and rollback criteria immediately.

## 5. Change control

- Treat policy, shift, timetable, holiday, device mapping, and remote eligibility edits as controlled attendance changes.
- Record requester, approver, affected population/effective date, before/after values, UAT evidence, and production change time.
- Use an effective date that avoids unintended historical changes. For backdated changes, identify and recalculate the full affected period, then reconcile payroll impact.
- Do not alter production policy values solely to make a report match. Resolve the source discrepancy and retain approval evidence.

## 6. Handover register

- Approved operational targets and service windows: ____________________
- HR owner and backup / contact: ____________________
- Payroll owner and backup / contact: ____________________
- IT owner and backup / contact: ____________________
- Daily queue review location and evidence retention: ____________________
- Payroll close calendar and escalation deadline: ____________________
- Monitoring dashboard or register: ____________________
- Last backup restore verification: ____________________
- Next policy review and UAT date: ____________________

## Exit criteria

- [ ] Every operational queue and recurring review has a named primary and backup owner.
- [ ] Numerical service targets, payroll cutoff, and escalation route are approved and recorded.
- [ ] The organization has completed at least one full monthly review and recorded follow-up actions.
- [ ] Policy changes follow the documented approval and UAT route.
- [ ] No unresolved critical attendance, access, or payroll reconciliation issue remains.

Use [Phase 8 production readiness](./office-attendance-phase-8-production-readiness.md) as the final release gate before production sign-off.
