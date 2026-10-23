# Office Attendance Phase 7: operating register

**Status: PREPARED; ACTIVATION BLOCKED.** Phase 7 starts only after the Phase 6 hypercare exit criteria are signed. The current release record does not contain that exit approval. Use this register to collect the operational owners, approved targets, recurring evidence, incidents, and period-close results; do not treat empty fields as approvals.

Related procedures: [Phase 6 go-live and hypercare](./office-attendance-phase-6-go-live-hypercare.md), [Phase 7 steady-state operations](./office-attendance-phase-7-steady-state-operations.md), and [Phase 8 production readiness](./office-attendance-phase-8-production-readiness.md).

## Activation gate

| Required Phase 6 exit item | Status | Evidence reference / approver |
| --- | --- | --- |
| Phase 5 UAT evidence and HR, Payroll, IT sign-off | BLOCKED | |
| Two initial payroll cycles reconciled and approved | BLOCKED | |
| No unresolved critical attendance, access, or payroll defect | BLOCKED | |
| Daily queue reviewers and backup owners named | BLOCKED | |
| Service targets, response windows, and escalation route approved | BLOCKED | |
| Hypercare exit date and release owner approval | BLOCKED | |

## Service ownership register

Record functional owner and backup. Use a team contact route or approved directory reference; do not store credentials or personal contact details in an open repository.

| Work area | Primary owner / role | Backup owner / role | Contact or escalation route | Coverage hours / timezone | Accepted on / by |
| --- | --- | --- | --- | --- | --- |
| Attendance rules, unmatched events, corrections | | | | | |
| Overtime approvals and payroll reconciliation | | | | | |
| Device sync, workers, scheduler, backup, deployment | | | | | |
| Employee roster, schedules, shifts, holidays | | | | | |
| Incident commander / payroll cutoff decision | | | | | |

## Approved indicator targets

The indicators below have no numeric defaults. Owners must approve the target and the escalation path before alerts or operational pass/fail decisions rely on them.

| Indicator | Actual calculation / evidence source | Approved target or maximum age | Escalation route | Primary / backup | Approved by / date |
| --- | --- | --- | --- | --- | --- |
| Device sync completion | Required sync runs completed / expected runs; inspect device sync history and zero-event windows | | | | |
| Unmapped event backlog | Valid unmapped raw attendance events; resolve by payroll cutoff | | | | |
| Processing/recalculation backlog | Pending and failed raw events/jobs; record oldest item age | | | | |
| Correction turnaround | Open correction requests by age/status | | | | |
| Source-to-summary variance | Independently compare source punches to processed daily summaries | Zero unexplained differences at close or approved disposition | | | |
| Payroll variance | Compare approved attendance/overtime values and payroll preview; record minute and amount deltas separately | | | | |
| Incident acknowledgement | Time from incident creation to named owner acknowledgement | | | | |

## Daily operations record

Create one record per operating day in the access-controlled evidence location. Attach report parameters and correlation/job IDs, not secret values or unnecessary employee PII.

| Field | Daily entry |
| --- | --- |
| Date, local timezone, release/build, branches covered | |
| Expected / successful / partial / failed / missing device syncs | |
| Raw events: received / valid / duplicate / unmapped | |
| Processing and recalculation backlog: count / oldest age / failed IDs | |
| Mobile queue or pending-override items and age | |
| Open corrections and approvals nearing payroll cutoff | |
| Sample employees/dates and independently checked source-to-summary result | |
| Incidents/defects, severity, owner, due time, escalation | |
| Decision: GO / HOLD / PAUSE; decision owner and reason | |
| HR / IT reviewer, timestamp, evidence references | |

## Payroll period close record

Do not close attendance while unexplained source-to-summary or payroll differences remain.

| Close control | Result / variance | Evidence reference | Reviewer / date | Owner / due date for exception |
| --- | --- | --- | --- | --- |
| Source punches/mobile events to processed summaries | | | | |
| Unmatched events, failed exceptions, pending recalculation jobs | | | | |
| Corrections, backdated changes, approvals, and audit history | | | | |
| Regular minutes, late/absence classifications, and holiday/rest-day cases | | | | |
| Calculated, requested, approved, and payable overtime | | | | |
| Attendance exports and payroll preview agree for identical scope/period | | | | |
| Variance disposition and recalculation/re-export evidence | | | | |
| HR close decision | | | | |
| Payroll close decision | | | | |

## Monthly and quarterly review

| Review period | Required review | Findings / action IDs | Owner / due date | Reviewer / evidence |
| --- | --- | --- | --- | --- |
| Monthly | Sync reliability, unmapped event rate, queue age, exception/correction volumes, reconciliation differences, payroll adjustments | | | |
| Monthly | Stale/conflicting policies, holiday calendars, schedules, device mappings, remote eligibility | | | |
| Monthly | Privileged attendance access and direct grants | | | |
| Quarterly / policy change | HR/Payroll approval of thresholds, rounding, overtime caps/approval, holiday treatment and multipliers | | | |
| Quarterly / policy change | Representative boundary cases retested in UAT before production effective date | | | |
| Quarterly | Backup restore, device credential ownership, escalation and recovery contacts reviewed | | | |

## Incident and controlled change log

| ID / date | Scope and impact | Severity | Source records preserved | Bounded retry / change reference | Reconciliation result | Owner / due date | Closure approval |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |

## Handover acceptance

| Acceptance | Owner | Decision / date | Evidence reference |
| --- | --- | --- | --- |
| HR accepts daily exception/correction and policy ownership | | | |
| Payroll accepts period-close overtime and variance process | | | |
| IT accepts device, worker, backup, deployment, monitoring, and incident ownership | | | |
| Primary and backup reviewers are assigned for each operating queue | | | |
| Numeric service targets, payroll cutoff, and escalation routes are approved | | | |
| At least one monthly review and follow-up action log is complete | | | |

**Phase 7 exit:** all ownership and target rows are approved; recurring evidence is being retained; one monthly review is complete; no unresolved critical attendance, access, or payroll issue remains; HR, Payroll, and IT have accepted handover. Phase 8 remains a separate production-readiness gate.
