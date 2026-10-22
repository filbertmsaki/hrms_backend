# Employee creation and optional onboarding

`POST /api/employees` commits the user/company membership, employee profile,
initial assignments and employee audit in one transaction. Optional onboarding
runs afterward in its own transaction. A failed onboarding operation cannot
turn a committed employee creation into an error response.

| Employee input | Onboarding behavior |
| --- | --- |
| `onboarding` omitted or null | Skip onboarding |
| `onboarding.auto_start: false` | Skip onboarding, regardless of `submit` |
| `onboarding.submit: false` | Save a draft without checking approvers |
| `onboarding: {}` or `onboarding.submit: true` | Check all steps and submit if eligible; otherwise save a draft with a warning |

Flags accept JSON booleans. Both flags default to true when the onboarding
object is present. A valid submission initially has status `submitted`.

Employee creation returns HTTP 201 with the employee's `id`, `employee_no` and
`company_user_id` at the top level, plus:

```json
{
  "onboarding_request": { "id": 55, "status": "draft", "onboarding_no": "ONB-2026-000001" },
  "warning": "Required workflow step at order 1 has no eligible approver. Employee created; onboarding saved as draft.",
  "warning_details": [{
    "id": 11,
    "step_order": 1,
    "name": "HR Document Collection",
    "assigned_role_id": 7,
    "assigned_user_id": null,
    "assigned_department_id": null
  }]
}
```

`onboarding_request` is null if onboarding is skipped or cannot be created.
`warning` is null on success and `warning_details` is an empty array when there
are no failed required steps. Unexpected onboarding failures use a generic
warning. If loading the full employee profile fails after commit, the response
still contains the saved employee identifiers and names.

An eligible approver is an active membership in the same company: first the
explicitly assigned user, then active members of the assigned role if that user
is unavailable, then the assigned department's active employee manager with an
active membership. An explicitly assigned active user does not need an
additional HR role. Every required step is checked before any approval is saved;
all failed required steps appear in `warning_details`.

Retrying the same company user returns HTTP 409 with the existing profile:

```json
{
  "statusCode": 409,
  "message": "This company user already has an employee profile",
  "employee_id": 123,
  "employee": { "id": 123, "employee_no": "000123", "first_name": "Jane", "last_name": "Doe" }
}
```

`POST /api/onboarding/requests` requires `employee_id`. Its `submit` flag defaults
to true. `submit: false` bypasses approver checks; missing required approvers on
submission return HTTP 201 with the draft request, `warning` and
`warning_details`. Other creation errors roll back the request transaction.
An active-request conflict returns HTTP 409 with `onboarding_request_id` and an
`onboarding_request` summary containing `id`, `employee_id`, `onboarding_no` and
`status`.

Regression coverage is in `employee-create.integration.spec.ts` (real HTTP
controllers and validation with in-memory persistence) and
`onboarding-workflow.service.spec.ts` (approver eligibility and preflight).

## HR readiness overview and reminders

Employee Management → Joining & onboarding → Onboarding opens the HR readiness
overview. All requests remains available for historical requests and the existing
listing actions. The overview includes open requests (including drafts and
rejected requests), groups by the first mandatory blocker, and filters by search,
stage, employee department, responsible owner, blocker group and overdue status.
Filters include every loaded batch, not just the first page. Invitations and
employees without an onboarding request remain in their respective joining tabs.

`GET /api/onboarding/requests/overview?after=0` requires
`onboarding_requests:read` and applies both company and employee-access scope.
It returns `{ data, next_cursor }` in batches of at most 50; continue with
`after=next_cursor` until the cursor is null. Readiness uses the same mandatory
checks as final activation, including payroll, independently approved salary,
verified banking and the signed contract. Counts never imply that task completion
alone activates the employee. Opening a request refreshes its detailed readiness,
and activation still rechecks requirements and permissions.

The existing daily escalation job runs at 08:00 in the server timezone. It reminds
only actionable overdue tasks and current, unblocked pending approvals. Task and
approval reminder timestamps are claimed under row locks to prevent concurrent
workers from repeatedly sending the same reminder. Position assignments use the
same active-position resolver as task completion; user, department and role
assignments retain their existing routing. Configuration:

- `ONBOARDING_TASK_REMINDER_HOURS` (default 24): minimum task reminder interval.
- `ONBOARDING_APPROVAL_REMINDER_DAYS` (default 2): approval age and repeat interval.
- `ONBOARDING_DOCUMENT_REMINDER_HOURS` (default 48): existing candidate document reminders.

An hourly check re-evaluates active requests, including payroll/contract changes
made outside onboarding. It sends company HR an in-app ready-for-activation alert
with the employee name and request link. The notification uses a stable per-request,
per-recipient deduplication key, so repeat checks and concurrent workers do not
create repeated alerts. Failed checks are isolated and retried on the next run.
This is an advisory readiness notification, not automatic activation; the request
may have changed since the alert, so HR must review current readiness. No migration
or new external scheduling service is required.

## Activation regression checks

### Employee workspace collaboration

Apply migration `1795100000000-AddOnboardingWorkspaceCollaboration` before serving
the new workspace. It adds scoped handoff notes and per-user last-visit records;
it does not change activation rules or existing employee records.

- `GET requests/:id/workspace/notes` requires onboarding read access and employee
  scope. Internal notes additionally require `onboarding_requests:update`.
- `GET requests/:id/workspace/my-notes` only permits the beneficiary and only
  returns employee-visible messages, regardless of any HR permissions.
- `POST requests/:id/workspace/notes` requires onboarding update permission,
  an open request and a valid readiness requirement. Notes are immutable, limited
  to 2,000 characters and scoped to that requirement. Reusing `client_key` retries
  the same note without duplicating it. History returns the newest 200 notes.
- `POST requests/:id/workspace/visit` requires onboarding read access and returns
  the previous visit without incrementing the onboarding request version.

New notes notify active HR recipients, exclude the sender, and also notify the
beneficiary when explicitly shared. Notification text never includes the note
body; each recipient has a stable deduplication key. A saved note is not a delivery
receipt. Existing scheduled reminders and their cooldowns are unchanged.

Employee-detail review accepts `expected_version` and conditionally updates the
request to reject concurrent decisions. Review snapshots expose previous field
values for correction comparisons. Payroll profile upsert optionally accepts
`expected_version` (zero when creating) and `preserve_existing_identifiers`; the
latter keeps omitted private identifiers rather than writing masked values.
Existing clients that omit these optional fields keep their existing API behavior.

Readiness includes actual workflow dependency reasons and task due dates. The
overview adds factual attention reasons and planned start dates; these are advisory
signals, never additional activation requirements or automatic activation.

### Database checks

`test/onboarding-readiness.e2e-spec.ts` exercises the real service and PostgreSQL
transactions: a completed checklist still waits for verified banking, independent
salary approval and a signed contract; concurrent activation finalizes once;
transactional failures roll back and can be retried; an assignee's final task
leaves activation to authorized HR; cross-company requests remain inaccessible.
Notification dispatch is mocked in this database suite to avoid external sends.
The notification listener and scheduled reminder tests cover routing separately.

Use only a dedicated migrated and seeded test database, with `DB_NAME` ending in
`_test_db` or `_e2e`, then run
`node ./node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --runInBand onboarding-readiness.e2e-spec`.
Never point these tests at production or UAT employee data. The standard backend
CI end-to-end job discovers this suite automatically.
