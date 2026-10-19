# Resignation and Exit Module: Completion Criteria

This document defines the implementation baseline and acceptance criteria for the resignation and exit module. Company-specific notice periods, approver assignments, statutory calculations, retention periods, and employment-status mappings remain configurable policy decisions; this repository does not encode a universal legal policy for them.

## Supported exit types

The backend supports resignation, termination, retirement, contract end, absconded, deceased, layoff, and other. Each request uses a configurable workflow, notice policy, access-termination mode, tasks, approvals, clearances, assets, and settlements. The selected company policy determines which items are required.

## Role and access baseline

| Actor | Allowed actions | Information boundary |
| --- | --- | --- |
| Employee | Submit and view own resignation/offboarding request; complete own assigned tasks and clearances | Own request and items assigned to them; HR-only approval notes and manager feedback stay restricted |
| HR / authorized offboarding manager | Create, edit drafts, configure workflow items, review, approve/reject, manage exit items, initiate termination, finalize | Company and employee records within assigned permissions and scope |
| Assigned approver | Act on approvals assigned to them at the active workflow level | Approval and request context needed for that decision |
| Assigned task/clearance owner | Update only items assigned to them, subject to permission | Their assigned work item and minimum related exit context |
| System worker | Execute scheduled access termination and reminders | Scoped to queued company/request operation |

Permission guards and tenant/employee scoping remain authoritative; UI visibility is not an authorization boundary.

## Lifecycle baseline

1. Employee submits a resignation or HR creates an exit request. Duplicate active exits for the same employee are rejected.
2. Submission snapshots the selected workflow and opens the current approval level.
3. Rejection closes pending approvals and notifies the employee with the approver's comments when supplied. A rejected request can be edited and resubmitted.
4. Approval starts operational work. Required tasks, approvals, clearances, access actions, assets, and settlements must be resolved before access termination can be scheduled.
5. If `OFFBOARDING_REQUIRE_EXIT_INTERVIEW=true`, a completed interview is required before access termination. If false, an interview remains optional.
6. Access termination runs at the configured time/mode. Failures remain visible, retryable, and block finalization.
7. Finalization requires successful access termination and resolved settlement and asset items. It records the employee's exit status/date, ends assignments, updates attendance artifacts, and writes an audit snapshot.

## Notice and final pay baseline

- Notice days come from the best matching active company notice policy, falling back to `OFFBOARDING_DEFAULT_NOTICE_DAYS`.
- Notice shortfall/excess is recorded from notice date and last working date.
- Only an authorized HR manager can waive notice. A non-empty reason is mandatory and is included in the audit record.
- Payroll owns final pay calculation. Offboarding tracks and gates on settlement items; it does not silently calculate statutory amounts outside the payroll policy.
- A settlement item may be completed or explicitly waived. Blocked or unresolved items prevent readiness/finalization.

## Employee-facing information

Employees can see their request status, proposed last working day, progress, notice summary, and their assigned tasks and clearances. Sensitive approval comments, manager interview feedback, rehire recommendation, finance-only recovery details, and internal audit metadata are not exposed through employee views. HR provides completed letters and other exit documents through the authorized document access path.

## Required acceptance scenarios

- Each supported exit type can be created and routed through the configured workflow.
- Employee resignation submission is scoped to the signed-in employee and validates required reason/date fields.
- Duplicate active exit submissions are rejected; closed requests do not block a later exit request.
- Only current-level assigned approvers can approve/reject; rejection closes later approvals and records the reason.
- Only draft/rejected requests can be edited; submitted/in-progress requests must use workflow actions.
- Notice policy selection, shortfall/excess calculation, waiver validation, and audit history are correct.
- Required interview configuration blocks access termination until interview status is completed.
- Required tasks, approvals, clearances, asset returns, settlements, and access operations each block readiness while unresolved.
- Access-operation retries are idempotent; failure prevents finalization and successful completion is auditable.
- Finalization updates employee status/date and downstream assignments once, with no duplicate side effects on repeat calls.
- Employees cannot read another employee's exit data or HR-only content; authorized roles can access needed documents and records.
- Submission, approval, rejection, assignment, overdue, access termination failure, and completion notifications reach the intended recipients without duplicate delivery.
- Generated letters contain the correct employee, employer, role, department, and effective dates, and downloads are access-checked and audited.
