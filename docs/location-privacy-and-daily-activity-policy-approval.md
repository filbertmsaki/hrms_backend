# Location Privacy and Daily Work Activity Policy Approval

This is a company approval record, not a statement that a policy has already been approved. Complete and retain one signed copy per company before enabling new location retention purge or relying on activity cut-offs and escalation settings.

## Approval record

| Field | Approved value |
| --- | --- |
| Company and legal entity | ______________________________ |
| Policy owner | ______________________________ |
| Version and effective date | ______________________________ |
| Review date | ______________________________ |
| Evidence / records-system reference | ______________________________ |

## Location privacy decisions

| Decision | Company-approved rule | Owner / evidence |
| --- | --- | --- |
| Purpose and necessity for attendance GPS, field visit GPS, Wi-Fi checkpoint, IP address and device metadata | ______________________________ | ______________________________ |
| Capture events (check-in/out only, or other documented events) | ______________________________ | ______________________________ |
| Whether any continuous/background location is prohibited | ______________________________ | ______________________________ |
| Employee notice wording, delivery point, version and acknowledgement evidence | ______________________________ | ______________________________ |
| Roles allowed to view precise attendance locations and field visit maps | ______________________________ | ______________________________ |
| Approved map tile provider, attribution, data transfer review, and permitted geocoding (if any) | ______________________________ | ______________________________ |
| Attendance location retention days and effective date | ______________________________ | ______________________________ |
| Field visit location retention days and effective date | ______________________________ | ______________________________ |
| Legal hold authority, release authority, and record | ______________________________ | ______________________________ |
| Purge approvers and separation-of-duties requirement | ______________________________ | ______________________________ |
| Location correction/access request process and response owner | ______________________________ | ______________________________ |
| Location exception review rules and manager authority | ______________________________ | ______________________________ |

Attendance location retention settings are `ATTENDANCE_LOCATION_RETENTION_DAYS` and `ATTENDANCE_LOCATION_RETENTION_PURGE_ENABLED`. Field visit location retention uses `FIELD_LOCATION_RETENTION_DAYS` and `FIELD_LOCATION_ANONYMIZE_AFTER_RETENTION`. Both scheduled jobs are disabled by default until explicitly configured. Each purge/anonymization run requires a company-scoped, one-time approval by a different operator; active per-record holds are excluded. The HRMS retention safeguards screen supports attendance and field visit location holds and approvals.

The app's live work-location view is opt-in even if the operating system already granted location permission. Opening Google Maps requires a second confirmation because Google receives the coordinates. Attendance tile maps may also send map-area requests to the configured tile provider.

## Daily Work Activity decisions

| Decision | Company-approved rule | Owner / evidence |
| --- | --- | --- |
| Required activity categories and category owners | ______________________________ | ______________________________ |
| Required fields, evidence, location, time, and outcome by category | ______________________________ | ______________________________ |
| Daily submission required for which employee groups | ______________________________ | ______________________________ |
| Cut-off time and timezone | ______________________________ | ______________________________ |
| Late submission handling, correction window and exception authority | ______________________________ | ______________________________ |
| Minimum submitted/completed activity counts | ______________________________ | ______________________________ |
| Manager review required, validation checklist and response target | ______________________________ | ______________________________ |
| Escalation recipient, timing, cadence, and closure rules | ______________________________ | ______________________________ |
| Reports and audit history required for HR review | ______________________________ | ______________________________ |

The policy stores company-scoped categories, daily cut-off time and IANA timezone, manager review target hours, and an optional department-head escalation delay. Escalations resolve the head from the employee's active primary department at execution time. A missing department head, inactive head, or missing company user prevents escalation and must be corrected in company setup. Escalation is disabled by default; configure it only after the owner, timing, and escalation route are approved. Approved/closed reports stop being escalated, and their open review actions are closed by the review workflow.

## Phase 3–4 workflow behavior and acceptance

- The scheduled submission reminder is idempotent per employee and activity date.
- Pending report review reminders are created for the assigned manager after the policy review target (24 hours by default).
- If enabled, an overdue report also creates one idempotent action for the department manager after the configured escalation delay (48 hours by default). It does not silently substitute HR or another department when the department manager is missing.
- Review actions for a report are completed when the report leaves manager review pending.
- Verify the workflow with employee, assigned manager, department head, HR, and unauthorized accounts. Confirm a report remains scoped to its company, employee and department; repeat the reminder sweep and ensure it does not duplicate open actions; approve/reject the report and confirm both manager and escalation actions close.
- Validate cutoff behavior on both sides of midnight in each approved timezone, and verify reports show submission date, late status, manager decision, and audit history.

Phase 4 operational completion still requires company policy signatures, production role configuration, migration through the approved release pipeline, notification receipt checks, and real-account UAT. These are operational sign-offs, not values that can be inferred or auto-approved by the application.

## Sign-off

| Role | Name | Decision | Signature / evidence | Date |
| --- | --- | --- | --- | --- |
| HR owner | __________________ | Approve / reject | __________________ | __________ |
| Privacy / Data Protection owner | __________________ | Approve / reject | __________________ | __________ |
| Legal / Records owner | __________________ | Approve / reject | __________________ | __________ |
| IT / Security owner | __________________ | Approve / reject | __________________ | __________ |
| Department activity policy owner | __________________ | Approve / reject | __________________ | __________ |
