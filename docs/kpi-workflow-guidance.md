# KPI workflow guidance in the existing HRMS

The KPI Management home page shows **Your Next Actions** from `GET /api/hr/kpi/workflow/guidance`. It uses the current JWT company context, `TenantGuard`, `KpiRolesGuard`, and the existing scoped KPI, scorecard, achievement, and evaluation services. Record links are guidance; every mutation still uses its existing guarded API.

## Entity and dependency map

- A KPI definition and a reporting period are independent setup records. Publishing a definition creates an immutable version. A later draft revision does not replace the published version used by existing assignments.
- An assignment needs a published definition version, compatible period, authorized existing HRMS subject, manager scope, and target. Target changes create revisions.
- A scorecard needs eligible assignments for its subject and period. Published configuration versions preserve assignment, target, definition, and scoring-policy references. Approved achievements supply live actuals; pending, returned, and rejected submissions do not.
- An achievement belongs to one assignment. Draft, submission, review, decision, correction, evidence, and approval history remain separate from the assignment and scorecard configuration.
- An evaluation cycle needs an existing period and published appraisal template. Enrollment needs a permitted employee, responsible manager, and published personal scorecard for the cycle period. Self-assessment, manager review, optional HR review, approval, finalization, and acknowledgement follow the existing service transitions. Finalization stores a frozen scorecard snapshot. Acknowledgement and dispute do not change that snapshot; an amendment starts a separately traceable evaluation.
- Achievement and evaluation reviews continue to use the existing action inbox. Employee-initiated HR reminders also use that same action inbox and notification service; no parallel inbox was added.

The navigation stages **Setup → Define → Assign → Track → Submit → Review → Approve → Close** are a guide, not a replacement database lifecycle. Scorecards, achievements, and evaluations use their own status transitions. Archive, rejection, return, dispute, cancellation, and amendment do not imply every earlier stage completed.

## Role-to-action matrix

| Role | Guided actions |
|---|---|
| Company Administrator / HR Manager | Define and publish KPIs; create periods, assignments, scorecards, and cycles; handle permitted HR reviews and finalization. |
| Department / Branch Manager | Create scoped assignments and scorecards; review assigned employee achievements and evaluations. HR-only prerequisites are explained without an HR-only link. |
| Employee | Submit or correct own direct-assignment achievements, complete own self-assessment, acknowledge or dispute own finalized evaluations. |
| MANAGEMENT | Aggregate KPI analytics only by default; guidance does not fetch individual assignments, achievements, or confidential evaluations. |

The server computes record-specific actions and blocking reasons. The frontend displays them with Fluent UI cards, badges, progress, disabled buttons, and direct links. Assignment, scorecard, achievement, and evaluation entry screens recheck the relevant prerequisites; Guided and Manual modes share the same gate. The backend remains authoritative when records change concurrently.

## Refresh and limits

Guidance refreshes on page focus, the existing `hrms:refresh-page-data` event after supported mutations, and while the tab is visible every 30 seconds so shared reminder status appears for other affected employees. The endpoint returns at most 50 actions and 100 progress records, drawing from the existing scoped list limits. It does not fabricate due dates when a cycle deadline is not returned with an evaluation list item. Signed-in visual acceptance against `hrms_db` needs an authorized existing session; automated tests use mocks and do not modify employee performance records.

Definition detail shows a separate record progress path. A pending new draft returns that definition to the Define guidance stage while the prior published version remains valid for assignments. Existing draft evaluation cycles appear as an Open cycle action instead of another Create cycle prompt.

## Shared HR reminders

The reminder identity is derived on the server from the unresolved dependency. Missing reporting-period setup and missing published-definition setup are company-wide issues, so all affected employees in the company see the same active reminder. Assignment setup is employee-specific because the current data model has no company-wide enrollment or mandatory assignment campaign; separate employees cannot safely be treated as one obligation. HR finalization is scoped to one evaluation. Achievement manager review already has its own action-inbox task keyed to the achievement and does not create a duplicate reminder task.

`POST /api/hr/kpi/workflow/remind-hr` accepts only a pending step key from the authenticated employee's own guidance. It checks the dependency again under a PostgreSQL advisory transaction lock, then creates at most one open `REMINDER` action item and one in-app notification for the issue. The action item is the active-state record. A second employee receives the existing status and no second notification. The task is completed after the corresponding period, definition, personal assignment, or evaluation finalization succeeds through the normal KPI endpoints. Closed-but-unresolved issues are not automatically reopened; escalation/retry needs an approved policy. Shared notifications omit the initiating employee's identity. No email or SMS delivery is asserted.
