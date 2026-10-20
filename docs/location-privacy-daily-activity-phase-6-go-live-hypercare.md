# Location Privacy and Daily Work Activity: Phase 6 go-live and hypercare

Phase 6 is the controlled production rollout after the Phase 5 UAT record is complete and approved. It does not replace the company's privacy, retention, or activity-policy sign-offs.

## Go-live gates

- [ ] Phase 5 UAT was executed against the isolated UAT database using employee, manager, HR, Privacy/Data Protection, and unauthorized accounts. Evidence and exceptions are attached to the release record.
- [ ] HR, Privacy/Data Protection, Legal/Records, IT/Security, and the daily activity policy owner have signed the company approval record.
- [ ] Production company activity categories, required fields/evidence, daily cutoffs/timezones, manager review targets, escalation delays, and department heads are verified against the signed policy.
- [ ] Production GPS purpose, notice, access roles, map provider, retention periods, holds, purge approvers, and employee request process are approved and recorded.
- [ ] Production secrets, origins, database, scheduler, email/push delivery, storage, and support destinations are confirmed through the deployment secret store. No secret values belong in this checklist.
- [ ] Backups are current and the restore owner confirms the recovery procedure. Record backup ID and timestamp.
- [ ] Review migration status for the release build and apply only approved migrations through the deployment pipeline. Record build/commit, migration result, and operator.
- [ ] Confirm production role assignments and company/department scope for employee, manager, HR, privacy, retention operator, and approver roles.
- [ ] Name primary and backup operators for daily activity exceptions, overdue manager reviews, department escalations, location-access requests, retention jobs, and incidents.
- [ ] Agree local support hours, response targets, activity cutoff escalation, privacy incident contacts, change window, and rollback decision owner.
- [ ] Keep location retention purge/anonymization disabled until approved retention settings, per-record holds, two-person approval, and purge evidence are verified.

## Controlled rollout

1. Start with one approved company department and a small employee/manager cohort. Record the approved cohort and effective policy version.
2. Confirm each employee can create and submit the daily report for the correct local date, timezone, category, evidence, and late state.
3. Confirm managers see only their assigned scope, can return/approve reports, and their decisions and action items are audited.
4. Confirm overdue reminders and any approved department-head escalation reach the intended accounts. Capture delivery evidence; an action item in the HRMS alone is not proof that email or push reached a recipient.
5. Use a UAT-like controlled live location event only when the approved purpose requires it. Confirm denied users receive no coordinates and authorized location reads create access logs.
6. Reconcile report totals and a sample of activity entries to source records and the HR-approved operating process. Verify the location-read audit sample separately.
7. Expand by department only after HR and IT sign the previous cohort's reconciliation and privacy checks. Do not infer approval from an absence of incident reports.

## Daily hypercare

For every operating day in the agreed hypercare window, the named HR and IT owners record:

| Field | Daily entry |
| --- | --- |
| Local date, timezone, build/release, company, department, cohort | ____________________ |
| Expected reports; submitted, late, missing, returned, approved, rejected | ____________________ |
| Submission reminder and manager review actions; open, delivered, overdue | ____________________ |
| Escalation actions; expected, created, recipient verified, unresolved | ____________________ |
| Report-to-entry and HR summary reconciliation; sample size and variance | ____________________ |
| Location reads; authorized, denied, audit rows checked, exceptions | ____________________ |
| Retention job state; holds, approvals, dry-run counts, purge outcome | ____________________ |
| User support requests, privacy requests, incidents, defects and owner/due time | ____________________ |
| HR / Privacy / IT reviewer, decision to expand, hold, or roll back | ____________________ |

Keep evidence in the approved restricted release folder. Exclude precise coordinates, selfies, tokens, device identifiers, and unnecessary employee details from routine notes; reference the controlled record IDs instead.

## Hold and rollback criteria

**Hold cohort expansion** when evidence is incomplete, notification receipt is unconfirmed, a manager queue exceeds the approved response window, activity summaries do not reconcile, or a location-read audit sample is incomplete. Keep the current cohort stable and assign an owner and due time.

**Pause the affected workflow and notify the incident owner** if any of these occur:

- An employee or manager can view another company's or unauthorized employee's activity or precise location.
- A report is assigned to the wrong employee, manager, department, date, or company.
- Reprocessing or retries create duplicate reports, entries, actions, or audit records.
- A location-access read is not logged, coordinates are exposed to an unauthorized user, or an unapproved retention job purges data.
- A material report-to-source discrepancy remains unexplained at the agreed close.
- Reminders or escalation are not visible to the named operational owner within the approved support window.

Preserve source records and audit logs. Follow the approved deployment/database restore procedure under the incident owner's direction; do not delete or rewrite source evidence to mask a mismatch. Reconcile a bounded period before resuming or expanding.

## Hypercare exit

- [ ] The agreed initial live activity cycle is complete and reconciles to source entries and HR summaries.
- [ ] Managers have cleared or assigned every overdue review and escalation; unresolved records have named owners and due dates.
- [ ] Privacy access samples reconcile to the audit log; all denied-access checks pass and any access request is resolved.
- [ ] Retention jobs match the signed policy; holds and approvals are evidenced. Purge remains disabled if any safeguard is incomplete.
- [ ] No unresolved critical access, privacy, assignment, duplicate, or reconciliation issue remains.
- [ ] HR, Privacy/Data Protection, and IT approve hypercare exit and accept the Phase 7 steady-state ownership register.

## Release and hypercare record

- Production release/build and migration ID: ____________________
- Backup and restore confirmation: ____________________
- Approved company/policy version and cohort: ____________________
- Rollout date, start/end, and expansion decisions: ____________________
- Reconciliation sample, result, variances, and resolution: ____________________
- Location audit sample and privacy result: ____________________
- Notification receipt evidence: ____________________
- Hypercare evidence location and access owner: ____________________
- Open issues, responsible owner, and due date: ____________________
- HR / Privacy / IT approval and date: ____________________
- Go / hold / rollback decisions: ____________________

An unfilled checklist is a release plan, not evidence of deployment. Transfer named owners, approved targets, evidence locations, and unresolved items into the steady-state operations register after this phase is signed off.
