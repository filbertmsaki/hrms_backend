# Office Attendance Phase 5: release readiness and UAT

Phase 5 validates the completed attendance flow against approved company policy and a real UAT environment. Unit tests verify code behavior; they do not replace device, mobile, payroll, or HR acceptance.

## 1. Release prerequisites

- [ ] HR and Payroll approve the active attendance policy, including grace periods, late/half-day/absence thresholds, rounding, overtime caps and approvals, holiday/rest-day treatment, and payroll multipliers.
- [ ] HR and IT confirm shift, timetable, rotation, employee schedule, holiday group, and attendance device assignments for the test population.
- [ ] A dedicated UAT database, Redis/queue, frontend URL, notification sink, and test accounts are configured. Confirm the effective database identity before migrations or writes.
- [ ] Each Hikvision device has a recorded model, firmware, serial number, branch, timezone, active sync mode, and tested network path. Store credentials in the UAT secret store only.
- [ ] Prepare synthetic employees for office, remote-enabled, remote-disabled, overnight, rotating, holiday, and unmapped-device cases.
- [ ] Capture application version, migration status, test date, policy version, and approver names in the sign-off record.

## 2. UAT acceptance matrix

| Area | Scenario | Acceptance evidence |
|---|---|---|
| Schedule resolution | Employee with date-specific schedule, published roster, shift/rotation assignment, timetable, and company default | Preview and processed summary use the expected schedule source and shift for each date. |
| Attendance thresholds | Check-in immediately before, at, and after grace and late/half-day/absence boundaries | Daily status and late minutes match independently calculated expectations. |
| Work time | Early departure, scheduled/recorded breaks, rounding, overnight shift, and missing punch | Worked minutes and exceptions match the approved policy; overnight punches land on the intended attendance date. |
| Overtime | Start delay, rounding, daily cap, monthly cap, approval-required and approval-not-required shifts | Summary separates calculated, pending, approved/payable minutes as configured; payroll preview agrees. |
| Holiday/rest day | Required holiday, optional holiday with attendance, rest day, and normal workday | Classification, work minutes, and overtime match the approved holiday mode and policy. |
| Mobile controls | On-site check-in, geofence/Wi-Fi/checkpoint failures, remote-enabled shift, remote-disabled shift | Valid punch is accepted; each disallowed or invalid case is rejected with a clear reason and audit evidence. |
| Corrections | Employee correction request, approval/rejection, HR override, and backdated change in a capped overtime month | Authorization and audit trail are correct; affected summaries are recalculated in date order. |
| Hikvision | Bounded sync, duplicate sync, transient outage/recovery, wrong timezone, non-attendance event, and unmapped employee then mapping repair | Sync history is recoverable and deduplicated; local event time and employee are correct; unmapped records become processable after mapping. |
| Processing and reports | Process synced/mobile events, review exceptions, export daily/monthly report, compare with source events | No unexplained unmatched/failed records; report totals reconcile to summaries and approved source punches. |
| Access control | Employee, manager, HR, Payroll, and attendance administrator access | Each role sees and changes only authorized company, branch, employee, and payroll-relevant data. |
| Resilience | Queue worker restart, repeated processing, and representative concurrent attendance imports | Jobs are visible, safe to retry, and do not duplicate punches or summaries. |

For every row, record the test employee, input, expected outcome, actual outcome, evidence link, tester, and pass/fail. Raise a defect for any mismatch; do not waive policy mismatches as implementation behavior.

## 3. Operational checks

1. Review `/dashboard/attendance/device-sync-logs` and each device's Hikvision sync history after scheduled and manual syncs. Investigate failures, partial runs, or unexpected zero-event windows.
2. Review `/dashboard/attendance/unmatched-logs` and `/dashboard/attendance/processing-exceptions`; these queues must have an owner and a documented resolution before payroll close.
3. Compare source-device event counts with saved attendance logs and processed daily summaries for the same device, employee, and local-time window.
4. Confirm failed or partial syncs remain visible and can be replayed for their original bounded time range without duplicate events.
5. Confirm the attendance recalculation queue drains and every accepted event reaches a terminal processing state before payroll preview.

## 4. Local verification completed in development

The focused backend regression suites cover Hikvision pagination, retries, deduplication, timezone parsing, event filtering, unmatched mapping recovery, remote attendance policy enforcement, schedule resolution, overtime limits, and daily summaries. Record the exact command output and commit identifier for the candidate release here:

- Candidate commit: ____________________
- Test command and result: ____________________
- Typecheck/lint result: ____________________
- Date and operator: ____________________

## 5. Sign-off and release gate

- [ ] All UAT scenarios pass or have an explicitly approved, tracked exception.
- [ ] HR approves attendance statuses, lateness, working-time, correction, and absence outcomes.
- [ ] Payroll approves overtime, holiday/rest-day treatment, and payroll reconciliation.
- [ ] IT approves device connectivity/timezones, retry/recovery behavior, access controls, backups, and monitoring ownership.
- [ ] No unresolved critical/high attendance defects remain.
- [ ] UAT evidence and policy approvals are attached to the release record.

UAT environment, physical Hikvision devices, live mobile location/Wi-Fi, and company policy approvals are external dependencies. A completed local test suite alone is not production sign-off.

After the Phase 5 release gate is signed, follow [Phase 6 go-live and hypercare](./office-attendance-phase-6-go-live-hypercare.md).
